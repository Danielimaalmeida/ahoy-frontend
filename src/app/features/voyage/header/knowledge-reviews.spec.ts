import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type {
  KnowledgeReview,
  KnowledgeReviewList,
  Story,
} from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { isActiveRefinement } from '@domain/refinement';
import { VoyageContext } from '../context/voyage-context';
import { knowledgeStateLabel } from './knowledge-panel';
import {
  isReviewable,
  KNOWLEDGE_REVIEW_POLL_MS,
  KnowledgeReviews,
} from './knowledge-reviews';

/** A knowledge review for specs; fictional data. */
function aReview(
  key: string,
  changes: Partial<KnowledgeReview> = {}
): KnowledgeReview {
  const status = changes.status ?? 'succeeded';
  const succeeded = status === 'succeeded';
  return {
    id: `${key.toLowerCase()}-knowledge-001-abcd`,
    key,
    status,
    notes: null,
    requestedBy: 'system',
    agent: 'knowledge-curator',
    model: null,
    reasoningEffort: null,
    runtime: 'k8s',
    controlSha: 'a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302',
    budgetNanoAiu: 10_000_000_000,
    usage: {
      requests: 1,
      nanoAiu: 100_000_000,
      inputTokens: 1,
      outputTokens: 1,
    },
    exitReason: null,
    cancelRequested: false,
    createdAt: '2026-10-06T09:30:00.000Z',
    startedAt: '2026-10-06T09:30:05.000Z',
    endedAt: isActiveRefinement(status) ? null : '2026-10-06T09:34:00.000Z',
    content: succeeded ? '## Lessons\n- Name the repository.' : null,
    proposal: null,
    lessons: succeeded ? '# Lessons\n\n## All repositories\n- x\n' : null,
    patch: succeeded
      ? 'diff --git a/knowledge/lessons.md b/knowledge/lessons.md\n'
      : null,
    ...changes,
  };
}

describe('isReviewable', () => {
  it('is true for a done or halted story only', () => {
    expect(isReviewable({ status: 'terminal', phase: 'done' })).toBe(true);
    expect(isReviewable({ status: 'halted', phase: 'planning' })).toBe(true);
    expect(isReviewable({ status: 'terminal', phase: 'blocked' })).toBe(false);
    expect(isReviewable({ status: 'running', phase: 'planning' })).toBe(false);
    expect(isReviewable(null)).toBe(false);
  });
});

describe('knowledgeStateLabel', () => {
  it('names the review as it stands', () => {
    const now = new Date('2026-10-06T09:31:00.000Z');
    expect(
      knowledgeStateLabel(
        aReview('PROJ-097', { status: 'queued', startedAt: null }),
        now
      )
    ).toBe('Waiting for a run slot');
    expect(
      knowledgeStateLabel(
        aReview('PROJ-097', { status: 'running', cancelRequested: true }),
        now
      )
    ).toBe('Stopping the agent');
    expect(knowledgeStateLabel(aReview('PROJ-097'), now)).toBe('Reviewed');
    expect(
      knowledgeStateLabel(aReview('PROJ-097', { status: 'cancelled' }), now)
    ).toBe('Cancelled');
    expect(
      knowledgeStateLabel(aReview('PROJ-097', { status: 'timed_out' }), now)
    ).toBe('Failed');
  });
});

describe('KnowledgeReviews', () => {
  let api: FakeApi;
  let clock: FakeClock;
  let story: ReturnType<typeof signal<Story | null>>;
  /** Every review the fake API holds, newest first. */
  let held: KnowledgeReview[];

  const done = (version = 9): Story =>
    aStory('PROJ-097', { status: 'terminal', phase: 'done', version });
  const list = (): ApiResult<KnowledgeReviewList> =>
    ok({ key: 'PROJ-097', items: held });

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock('2026-10-06T10:00:00.000Z');
    held = [];
    api.on('listKnowledgeReviews', () => Promise.resolve(list()));
    story = signal<Story | null>(null);
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock, net: new FakeFetch() }),
        { provide: VoyageContext, useValue: { story } },
        KnowledgeReviews,
      ],
    });
  });

  const store = (): KnowledgeReviews => TestBed.inject(KnowledgeReviews);
  async function flush(): Promise<void> {
    TestBed.tick();
    await settle();
  }

  it('reads nothing while the voyage is under way or blocked, and the reviews once it is done', async () => {
    held = [aReview('PROJ-097')];
    const reviews = store();
    story.set(aStory('PROJ-097'));
    await flush();
    story.set(
      aStory('PROJ-097', { status: 'terminal', phase: 'blocked', version: 8 })
    );
    await flush();
    expect(api.callsOf('listKnowledgeReviews')).toHaveLength(0);
    expect(reviews.newest()).toBeNull();

    story.set(done());
    await flush();
    expect(api.callsOf('listKnowledgeReviews').map((c) => c.args)).toEqual([
      ['PROJ-097'],
    ]);
    expect(reviews.newest()?.lessons).toContain('## All repositories');
    expect(reviews.done()).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('polls every 5 s while the newest is in progress, and stops when it ends', async () => {
    held = [aReview('PROJ-097', { status: 'running' })];
    const reviews = store();
    story.set(done());
    await flush();
    expect(reviews.active()).toBe(true);
    expect(clock.pending).toBe(1);
    held = [aReview('PROJ-097')];
    await clock.advance(KNOWLEDGE_REVIEW_POLL_MS);
    expect(reviews.newest()?.status).toBe('succeeded');
    expect(clock.pending).toBe(0);
  });

  it('asks with confirmSpend only, leaving out empty notes and a missing limit, and shows it queued at once', async () => {
    const queued = aReview('PROJ-097', { status: 'queued', startedAt: null });
    api.on('requestKnowledgeReview', () => Promise.resolve(ok(queued)));
    const reviews = store();
    story.set(done());
    await flush();
    await reviews.request('', null);
    await reviews.request('Look at the refunds', 2_500_000_000);
    expect(api.callsOf('requestKnowledgeReview').map((c) => c.args)).toEqual([
      ['PROJ-097', { confirmSpend: true }],
      [
        'PROJ-097',
        {
          confirmSpend: true,
          notes: 'Look at the refunds',
          budgetNanoAiu: 2_500_000_000,
        },
      ],
    ]);
    expect(reviews.newest()).toEqual(queued);
    expect(clock.pending).toBe(1);
  });

  it('reads again when a request is refused as invalid_state, and takes a cancelled review at once', async () => {
    api.on('requestKnowledgeReview', () =>
      Promise.resolve(
        fail({
          kind: 'problem',
          status: 409,
          code: 'invalid_state',
          title: 'Invalid state',
        })
      )
    );
    const reviews = store();
    story.set(aStory('PROJ-118', { status: 'halted', version: 4 }));
    await flush();
    expect(reviews.done()).toBe(false);
    held = [aReview('PROJ-118', { status: 'queued', startedAt: null })];
    const refused = await reviews.request('', null);
    expect(refused.ok).toBe(false);
    await settle();
    expect(api.callsOf('listKnowledgeReviews')).toHaveLength(2);

    const cancelled = aReview('PROJ-118', {
      status: 'cancelled',
      cancelRequested: true,
    });
    api.on('cancelKnowledgeReview', () => Promise.resolve(ok(cancelled)));
    await reviews.cancel('Asked by mistake');
    expect(api.callsOf('cancelKnowledgeReview')[0]?.args).toEqual([
      'PROJ-118',
      { reason: 'Asked by mistake' },
    ]);
    expect(reviews.newest()?.status).toBe('cancelled');
    expect(clock.pending).toBe(0);
  });
});
