import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiClient } from '@core/api/api-client';
import {
  isNotFound,
  isStale,
  isUnreachable,
  isValidationFailed,
  type ApiError,
  type ApiResult,
} from '@core/api/api-error';
import { readStoryState } from '@core/api/story-state';
import type { AhoyEvent } from '@core/api/types';
import { NoAuthStrategy } from '@core/auth/auth-strategy';
import type { Clock } from '@core/realtime/clock';
import { CLOCK } from '@core/realtime/clock';
import { EventStreamClient } from '@core/realtime/event-stream-client';
import { FETCH } from '@core/realtime/fetch';
import { StoriesStore } from '@core/stores/stories-store';
import type { ManualClock } from '@testing/mock-backend/clock';
import { settle, testServer } from '@testing/mock-backend/spec-helpers';
import { firstValueFrom } from 'rxjs';
import {
  mockBackendInterceptor,
  MOCK_SERVER,
  provideMockBackend,
} from './mock-backend';

const AIU = 1_000_000_000;

/** The value of a result, or a failed spec that names the error. */
function value<T>(result: ApiResult<T>): T {
  if (!result.ok)
    throw new Error(`expected a value, got ${JSON.stringify(result.error)}`);
  return result.value;
}

/** The error of a result. */
function error<T>(result: ApiResult<T>): ApiError {
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return {
    now: () => new Date(manual.now()),
    schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }),
  };
}

/** A TestBed whose `HttpClient` and `FETCH` are served by a fresh mock. */
function setUp(seed = true) {
  const { server, clock } = testServer({ seed });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(server),
      { provide: CLOCK, useValue: asClock(clock) },
    ],
  });
  return { server, clock, api: TestBed.inject(ApiClient) };
}

describe('the mock backend through ApiClient', () => {
  it('runs a whole voyage: set sail, questions, plan, send-back, approval, delivery, done', async () => {
    const { api, clock } = setUp(false);
    const started = value(
      await api.startStory({
        key: 'DEMO-7',
        title: 'Show order totals',
        budgetNanoAiu: 30 * AIU,
      })
    );
    expect(started).toMatchObject({
      key: 'DEMO-7',
      owner: 'dev@example.com',
      status: 'ready',
      phase: 'intake',
      version: 1,
    });

    clock.advance(10_000);
    let story = value(await api.getStory('DEMO-7'));
    expect([story.status, story.phase]).toEqual(['awaiting_input', 'planning']);

    let version = story.version;
    for (const question of value(await api.listQuestions('DEMO-7'))) {
      const accepted = value(
        await api.answerQuestion('DEMO-7', question.id, {
          answer: 'POC test answer, not a product decision',
          expectedVersion: version,
        })
      );
      expect(accepted.question).toMatchObject({
        id: question.id,
        answeredBy: 'dev@example.com',
      });
      version = accepted.story.version;
    }

    clock.advance(8_000);
    story = value(await api.getStory('DEMO-7'));
    expect([story.status, story.phase]).toEqual([
      'awaiting_decision',
      'plan_review',
    ]);
    const plan1 = value(
      await api.getArtifactContent('DEMO-7', { path: 'implementation-plan.md' })
    );
    if (plan1.kind !== 'content') throw new Error('expected the plan');
    expect(plan1.mediaType).toBe('text/markdown');
    expect(
      value(
        await api.getArtifactContent('DEMO-7', {
          path: 'implementation-plan.md',
          ifNoneMatch: plan1.etag ?? '',
        })
      )
    ).toEqual({
      kind: 'not_modified',
    });

    const sentBack = value(
      await api.decideHumanGate('DEMO-7', {
        gate: 'plan_accepted',
        decision: 'send_back',
        reason: 'Add the empty state.',
        expectedVersion: story.version,
      })
    );
    expect(sentBack.record).toMatchObject({
      outcome: 'send_back',
      actor: 'dev@example.com',
      source: 'human',
    });
    expect(sentBack.story).toMatchObject({
      phase: 'planning',
      status: 'ready',
    });

    clock.advance(8_000);
    story = value(await api.getStory('DEMO-7'));
    expect(story.status).toBe('awaiting_decision');
    const state = readStoryState(
      value(await api.getStoryState('DEMO-7')).state
    );
    expect(state.revisions).toEqual(new Map([['plan_accepted', 1]]));
    expect(state.revisionCeiling).toBe(4);
    const plan2 = value(
      await api.getArtifactContent('DEMO-7', { path: 'implementation-plan.md' })
    );
    expect(plan2.kind === 'content' && plan2.text).toContain(
      'Answers the review: Add the empty state.'
    );

    const approved = value(
      await api.decideHumanGate('DEMO-7', {
        gate: 'plan_accepted',
        decision: 'approve',
        expectedVersion: story.version,
      })
    );
    expect(approved.story.phase).toBe('implementation');

    clock.advance(30_000);
    story = value(await api.getStory('DEMO-7'));
    expect([story.status, story.phase]).toEqual([
      'awaiting_decision',
      'delivery_gate',
    ]);
    const delivered = value(
      await api.decideHumanGate('DEMO-7', {
        gate: 'delivery_accepted',
        decision: 'approve',
        expectedVersion: story.version,
      })
    );
    expect(delivered.story).toMatchObject({
      phase: 'done',
      status: 'terminal',
    });

    const gates = value(await api.listGateRecords('DEMO-7'));
    expect(
      gates.filter((g) => g.source === 'human').map((g) => g.outcome)
    ).toEqual(['send_back', 'approve', 'approve']);
    const runs = value(await api.listStoryRuns('DEMO-7'));
    expect(runs.map((r) => r.phase)).toEqual([
      'intake',
      'planning',
      'planning',
      'planning',
      'implementation',
      'pr_review',
    ]);
    expect(value(await api.getRun(runs[0]!.id)).status).toBe('succeeded');
    let after: string | undefined;
    const types: string[] = [];
    for (;;) {
      const page = value(
        await api.listStoryEvents('DEMO-7', {
          limit: 25,
          ...(after !== undefined ? { after } : {}),
        })
      );
      types.push(...page.items.map((e) => e.type));
      if (page.items.length === 0 || page.lastEventId === null) break;
      after = page.lastEventId;
    }
    expect(types[0]).toBe('story.started');
    expect(types.at(-1)).toBe('story.phase_changed');
    expect(types.filter((t) => t === 'decision.recorded')).toHaveLength(3);
  });

  it("gives the client the contract's errors, which its predicates recognise", async () => {
    const { api, server } = setUp();
    const stale = error(
      await api.stopStory('PROJ-123', { expectedVersion: 8, reason: 'Wait' })
    );
    expect(isStale(stale) && stale.currentVersion).toBe(9);
    expect(isNotFound(error(await api.getStory('PROJ-999')))).toBe(true);
    expect(
      isValidationFailed(
        error(await api.startStory({ key: 'DEMO-1', budgetNanoAiu: 0 }))
      )
    ).toBe(true);
    server.switches.failNext = 503;
    expect(isUnreachable(error(await api.listStories()))).toBe(true);
    server.switches.failNext = 502;
    expect(error(await api.getHealth())).toEqual({
      kind: 'network',
      status: 502,
    });
    server.switches.conflictNext = 'stale_version';
    expect(
      isStale(error(await api.resumeStory('PROJ-118', { expectedVersion: 14 })))
    ).toBe(true);
    expect(
      value(await api.resumeStory('PROJ-118', { expectedVersion: 14 })).status
    ).toBe('ready');
  });

  it("holds every answer for latencyMs on the mock's clock", async () => {
    const { api, server, clock } = setUp();
    server.switches.latencyMs = 400;
    let done = false;
    const pending = api.getHealth().then((r) => {
      done = true;
      return r;
    });
    await settle();
    expect(done).toBe(false);
    clock.advance(400);
    expect(value(await pending)).toEqual({ status: 'ok', database: 'ok' });
  });

  it('feeds StoriesStore: every seeded voyage, counted by status', async () => {
    setUp();
    const store = TestBed.inject(StoriesStore);
    expect(value(await store.loadAll())).toHaveLength(8);
    expect(store.counts()).toMatchObject({
      halted: 2,
      terminal: 2,
      awaiting_input: 1,
      awaiting_decision: 1,
      running: 1,
      ready: 1,
    });
    expect(store.needsYou().map((s) => s.key)).toEqual([
      'PROJ-118',
      'PROJ-126',
      'PROJ-131',
      'PROJ-123',
    ]);
  });

  it('serves the event stream to EventStreamClient, which resumes with Last-Event-ID after a drop', async () => {
    const { server, clock } = setUp();
    const mockFetch = TestBed.inject(FETCH);
    const sent: Headers[] = [];
    const fetch: typeof globalThis.fetch = (input, init) => {
      sent.push(new Headers(init?.headers));
      return mockFetch(input, init);
    };
    const received: AhoyEvent[] = [];
    const client = new EventStreamClient(
      {
        fetch,
        auth: new NoAuthStrategy(),
        base: '/api/v1',
        clock: asClock(clock),
        random: () => 0.5,
        onEvent: (event) => received.push(event),
      },
      { after: String(server.state.lastEventId) }
    );
    client.start();
    await settle();
    expect(client.status()).toBe('live');
    clock.advance(3_000);
    await settle();
    expect(received.length).toBeGreaterThan(0);
    const lastBeforeDrop = received.at(-1)!.id;
    expect(client.lastEventId()).toBe(lastBeforeDrop);

    server.dropStreams();
    await settle();
    expect(client.status()).toBe('reconnecting');
    clock.advance(1_000); // the first reconnection delay: 1 s
    await settle();
    expect(client.status()).toBe('live');
    expect(sent[1]?.get('Last-Event-ID')).toBe(lastBeforeDrop);
    clock.advance(3_000);
    await settle();
    const ids = received.map((e) => Number(e.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids.at(-1)).toBeGreaterThan(Number(lastBeforeDrop));
    client.stop();
    await settle();
    expect(server.state.hub.open).toBe(0);
  });

  it('leaves requests outside API_BASE to the next handler', async () => {
    const { server } = testServer({ seed: false });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockBackendInterceptor])),
        provideHttpClientTesting(),
        provideMockBackend(server),
      ],
    });
    expect(TestBed.inject(MOCK_SERVER)).toBe(server);
    const http = TestBed.inject(HttpClient);
    const config = firstValueFrom(http.get('/config.json'));
    TestBed.inject(HttpTestingController)
      .expectOne('/config.json')
      .flush({ actor: 'sam@example.com' });
    expect(await config).toEqual({ actor: 'sam@example.com' });
    const health = firstValueFrom(http.get('/api/v1/health'));
    TestBed.inject(HttpTestingController).verify(); // answered by the mock, never reached the backend
    expect(await health).toEqual({ status: 'ok', database: 'ok' });
  });
});
