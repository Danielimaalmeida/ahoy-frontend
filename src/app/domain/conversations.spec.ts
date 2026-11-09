import { describe, expect, it } from 'vitest';
import {
  askRefusal,
  CONVERSATION_TURNS_MAX,
  contextChipText,
  conversationGroups,
  conversationSub,
  needsPolling,
  openTurn,
  pinInput,
  pinRefusal,
  sessionLine,
  type ContextItemLike,
  type ConversationLike,
  type ConversationSummaryLike,
} from './conversations';

const CONTEXT: readonly ContextItemLike[] = [
  { kind: 'jira', ref: 'PROJ-120', label: null },
  {
    kind: 'meeting_topic',
    ref: 'topic-1',
    label: 'Late fees for enterprise accounts',
  },
  { kind: 'defect', ref: 'PROJ-456', label: 'Late fee shown twice on the PDF' },
  {
    kind: 'figma',
    ref: 'https://www.figma.com/design/AbC123/Billing-invoices?node-id=12-40',
    label: null,
  },
  { kind: 'repository', ref: 'web', label: null },
];
const OPEN: ConversationLike = {
  canAsk: true,
  turns: [
    { n: 1, status: 'answered' },
    { n: 2, status: 'handed' },
  ],
  session: { status: 'running', cancelRequested: false },
};
const DONE: ConversationLike = { ...OPEN, turns: OPEN.turns.slice(0, 1) };

describe('pinning context', () => {
  it('takes a Jira or defect key in capitals, a figma.com link and a repository name', () => {
    expect(pinInput('jira', ' proj-123 ')).toEqual({
      ok: true,
      ref: 'PROJ-123',
    });
    expect(pinInput('defect', 'PROJ-456')).toEqual({
      ok: true,
      ref: 'PROJ-456',
    });
    expect(
      pinInput('figma', 'https://www.figma.com/design/AbC/Billing?node-id=1-2')
    ).toEqual({
      ok: true,
      ref: 'https://www.figma.com/design/AbC/Billing?node-id=1-2',
    });
    expect(pinInput('repository', 'web')).toEqual({ ok: true, ref: 'web' });
  });

  it('says early what the API would refuse', () => {
    expect(pinInput('jira', 'proj 123')).toEqual({
      ok: false,
      message: 'A Jira key, such as PROJ-123.',
    });
    expect(pinInput('jira', ' ')).toEqual({
      ok: false,
      message: 'Type what to pin.',
    });
    expect(pinInput('figma', 'https://example.com/design/x').ok).toBe(false);
    expect(pinInput('repository', '../web').ok).toBe(false);
    expect(pinInput('meeting_topic', 'Late fees').ok).toBe(false);
  });

  it('refuses an item pinned already, and more than the limits', () => {
    const ctx = CONTEXT;
    expect(pinRefusal(ctx, 'jira', 'PROJ-120')).toBe('It is pinned already.');
    expect(pinRefusal(ctx, 'jira', 'PROJ-121')).toBeNull();
    const repos = ['a', 'b', 'c'].map((ref) => ({
      kind: 'repository' as const,
      ref,
      label: null,
    }));
    expect(pinRefusal(repos, 'repository', 'd')).toBe(
      'At most 3 repositories can be pinned.'
    );
    const full = Array.from({ length: 12 }, (_, i) => ({
      kind: 'jira' as const,
      ref: `P-${i}`,
      label: null,
    }));
    expect(pinRefusal(full, 'defect', 'P-99')).toBe(
      'At most 12 items can be pinned.'
    );
  });

  it('names each chip by its key, its title, or a short form of the link', () => {
    expect(CONTEXT.map(contextChipText)).toEqual([
      'PROJ-120',
      'Late fees for enterprise accounts',
      'PROJ-456 · Late fee shown twice on the PDF',
      'Figma · Billing invoices',
      'repo · web',
    ]);
  });
});

describe('a conversation’s state', () => {
  it('finds the open question and polls only while there is one', () => {
    expect(openTurn(OPEN.turns)?.n).toBe(2);
    expect(needsPolling(OPEN)).toBe(true);
    expect(openTurn(DONE.turns)).toBeNull();
    expect(needsPolling(DONE)).toBe(false);
  });

  it('lets only the owner ask, one question at a time, up to the limit', () => {
    expect(askRefusal(OPEN)).toMatch(/still answering/);
    expect(askRefusal(DONE)).toBeNull();
    expect(askRefusal({ ...DONE, canAsk: false })).toMatch(
      /Only the person who started/
    );
    const full = Array.from({ length: CONVERSATION_TURNS_MAX }, (_, i) => ({
      ...DONE.turns[0]!,
      n: i + 1,
    }));
    expect(askRefusal({ ...DONE, turns: full })).toMatch(/its 40 questions/);
  });

  it('says whether a session is starting, answering, warm or none', () => {
    expect(sessionLine(OPEN)).toBe('Answering');
    expect(sessionLine(DONE)).toMatch(
      /^Warm: the next question is answered right away/
    );
    expect(
      sessionLine({ ...DONE, session: { ...DONE.session!, status: 'queued' } })
    ).toBe('Starting a session…');
    expect(
      sessionLine({
        ...DONE,
        session: { ...DONE.session!, cancelRequested: true },
      })
    ).toBe('Stopping…');
    expect(sessionLine({ ...DONE, session: null })).toMatch(
      /^No session running/
    );
    expect(sessionLine({ ...DONE, session: null, turns: [] })).toMatch(
      /^No session yet/
    );
  });
});

describe('the list', () => {
  const items: readonly ConversationSummaryLike[] = [
    {
      key: 'CONV-3',
      owner: 'alex@example.com',
      ownerName: 'Alex Example',
      turnCount: 2,
      updatedAt: '2026-11-03T09:14:00.000Z',
    },
    {
      key: 'CONV-4',
      owner: 'alex@example.com',
      ownerName: 'Alex Example',
      turnCount: 0,
      updatedAt: '2026-11-04T10:00:00.000Z',
    },
    {
      key: 'CONV-2',
      owner: 'sam@example.com',
      ownerName: 'Sam Example',
      turnCount: 3,
      updatedAt: '2026-11-02T15:00:00.000Z',
    },
  ];

  it('splits one’s own from the team’s shared ones, the latest changed first', () => {
    const groups = conversationGroups(
      items,
      (owner) => owner === 'alex@example.com'
    );
    expect(groups.mine.map((c) => c.key)).toEqual(['CONV-4', 'CONV-3']);
    expect(groups.shared.map((c) => c.key)).toEqual(['CONV-2']);
  });

  it('says the key, how many questions, and whose it is when not one’s own', () => {
    expect(conversationSub(items[0]!, true)).toBe('CONV-3 · 2 questions');
    expect(conversationSub(items[2]!, false)).toBe(
      'CONV-2 · 3 questions · Sam Example'
    );
    expect(conversationSub({ ...items[0]!, turnCount: 0 }, true)).toBe(
      'CONV-3 · no questions'
    );
  });
});
