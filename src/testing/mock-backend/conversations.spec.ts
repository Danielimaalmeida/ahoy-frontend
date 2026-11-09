import type { Conversation, ConversationList } from '@core/api/types';
import {
  DEFAULT_SESSION_BUDGET,
  MOCK_START_MS,
  MOCK_STEP_MS,
  MOCK_WARM_MS,
} from './conversations';
import { call, testServer } from './spec-helpers';

const ME = { 'x-ahoy-actor': 'dev@example.com' };
const OTHER = { 'x-ahoy-actor': 'alex@example.com' };

describe('the mock Product conversations', () => {
  function started(recipe: string | null = 'split-epic') {
    const { server, clock } = testServer();
    const c = call(
      server,
      'POST',
      '/conversations',
      { title: ' Late  fees ', recipe },
      ME
    );
    expect(c.status).toBe(201);
    const id = (c.body as Conversation).id;
    const get = (headers = ME) =>
      call(server, 'GET', `/conversations/${id}`, undefined, headers);
    return { server, clock, id, get, conversation: c.body as Conversation };
  }

  it('seeds one conversation Sam shared, and lists one’s own and the shared ones only', () => {
    const { server, conversation } = started();
    expect(conversation.title).toBe('Late fees');
    const mine = call(server, 'GET', '/conversations', undefined, ME)
      .body as ConversationList;
    expect(mine.items.map((c) => [c.key, c.owner])).toEqual([
      [conversation.key, 'dev@example.com'],
      ['CONV-1', 'sam@example.com'],
    ]);
    const theirs = call(server, 'GET', '/conversations', undefined, OTHER)
      .body as ConversationList;
    expect(theirs.items.map((c) => c.key)).toEqual(['CONV-1']);
  });

  it('pins what the API takes, refuses what it refuses, and labels a meeting topic with its title', () => {
    const { server, id } = started();
    const topic = (
      call(server, 'GET', '/meeting-search?q=late%20fee').body as {
        topics: { id: string; title: string }[];
      }
    ).topics[0]!;
    const pin = (items: unknown) =>
      call(server, 'PUT', `/conversations/${id}/context`, { items }, ME);
    const pinned = pin([
      { kind: 'jira', ref: 'PROJ-120' },
      { kind: 'meeting_topic', ref: topic.id },
      { kind: 'repository', ref: 'web' },
    ]);
    expect(pinned.status).toBe(200);
    expect((pinned.body as Conversation).context.map((x) => x.label)).toEqual([
      null,
      topic.title,
      null,
    ]);
    expect(pin([{ kind: 'repository', ref: 'legacy' }]).status).toBe(400);
    expect(pin([{ kind: 'jira', ref: 'proj 1' }]).status).toBe(400);
    expect(
      call(server, 'PUT', `/conversations/${id}/context`, { items: [] }, OTHER)
        .status
    ).toBe(404);
  });

  it('answers in steps: queued, then handed with live text and activity, then answered with proposals, and warm until idle', () => {
    const { server, clock, id, get } = started();
    const asked = call(
      server,
      'POST',
      `/conversations/${id}/turns`,
      { question: 'Split it', confirmSpend: true },
      ME
    );
    expect(asked.status).toBe(202);
    const queued = asked.body as Conversation;
    expect([
      queued.turns[0]?.status,
      queued.session?.status,
      queued.session?.budgetNanoAiu,
    ]).toEqual(['queued', 'queued', DEFAULT_SESSION_BUDGET]);
    expect(
      call(
        server,
        'POST',
        `/conversations/${id}/turns`,
        { question: 'Again', confirmSpend: true },
        ME
      ).status
    ).toBe(409);

    clock.advance(MOCK_START_MS + MOCK_STEP_MS * 2);
    const handed = get().body as Conversation;
    expect(handed.turns[0]?.status).toBe('handed');
    expect(handed.turns[0]?.activity.length).toBeGreaterThan(0);

    clock.advance(MOCK_STEP_MS * 20);
    const answered = get().body as Conversation;
    expect(answered.turns[0]?.status).toBe('answered');
    expect(answered.turns[0]?.liveText).toBeNull();
    expect(answered.turns[0]?.proposals.map((p) => p.kind)).toEqual([
      'story',
      'story',
      'topic',
    ]);
    expect(answered.turns[0]?.questions.map((q) => q.id)).toEqual(['Q1']);
    expect(answered.session?.warm).toBe(true);
    expect(answered.spentNanoAiu).toBeGreaterThan(0);

    clock.advance(MOCK_WARM_MS);
    const idle = get().body as Conversation;
    expect(idle.session).toBeNull();
    expect(idle.spentNanoAiu).toBe(answered.spentNanoAiu);
  });

  it('cancels the open question, shares read-only with others, and deletes', () => {
    const { server, clock, id, get } = started(null);
    call(
      server,
      'POST',
      `/conversations/${id}/turns`,
      { question: 'Why?', confirmSpend: true },
      ME
    );
    const cancelled = call(
      server,
      'POST',
      `/conversations/${id}/cancel`,
      undefined,
      ME
    );
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as Conversation).turns[0]?.status).toBe('cancelled');
    clock.advance(1_000);
    expect((get().body as Conversation).session).toBeNull();
    expect(
      call(server, 'POST', `/conversations/${id}/cancel`, undefined, ME).status
    ).toBe(409);

    expect(get(OTHER).status).toBe(404);
    call(server, 'PATCH', `/conversations/${id}`, { shared: true }, ME);
    const shared = get(OTHER);
    expect([shared.status, (shared.body as Conversation).canAsk]).toEqual([
      200,
      false,
    ]);
    expect(
      call(
        server,
        'POST',
        `/conversations/${id}/turns`,
        { question: 'x', confirmSpend: true },
        OTHER
      ).status
    ).toBe(403);

    expect(
      call(server, 'DELETE', `/conversations/${id}`, undefined, ME).status
    ).toBe(204);
    expect(get().status).toBe(404);
  });
});
