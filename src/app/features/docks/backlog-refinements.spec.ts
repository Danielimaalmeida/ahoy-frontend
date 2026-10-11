import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { Refinement, RefinementSummary } from '@core/api/types';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { isActiveRefinement } from '@domain/refinement';
import { BacklogRefinements, REFINEMENT_POLL_MS } from './backlog-refinements';

/** A refinement for specs; fictional data. */
function aRefinement(
  key: string,
  changes: Partial<Refinement> = {}
): Refinement {
  const status = changes.status ?? 'succeeded';
  return {
    id: `${key.toLowerCase()}-refinement-001-abcd`,
    key,
    status,
    notes: null,
    requestedBy: 'alex@example.com',
    agent: 'quartermaster',
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
    content: status === 'succeeded' ? '## Verdict\nREADY.' : null,
    ...changes,
  };
}

const invalidState = (): Promise<ApiResult<never>> =>
  Promise.resolve(
    fail({
      kind: 'problem',
      status: 409,
      code: 'invalid_state',
      title: 'Invalid state',
    })
  );

describe('BacklogRefinements', () => {
  let api: FakeApi;
  let clock: FakeClock;
  /** Every refinement the fake API holds, newest first per key. */
  let held: Refinement[];

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock('2026-10-06T10:00:00.000Z');
    held = [];
    api.on('listRefinements', () => {
      const newest = new Map<string, RefinementSummary>();
      for (const r of held) if (!newest.has(r.key)) newest.set(r.key, r);
      return Promise.resolve(ok([...newest.values()]));
    });
    api.on('getRefinements', (key) =>
      Promise.resolve(ok({ key, items: held.filter((r) => r.key === key) }))
    );
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock, net: new FakeFetch() }),
        BacklogRefinements,
      ],
    });
  });

  const store = (): BacklogRefinements => TestBed.inject(BacklogRefinements);

  it('is loading until the list arrives, then holds the newest refinement of each refined item', async () => {
    held = [aRefinement('PROJ-1'), aRefinement('PROJ-2', { status: 'failed' })];
    const refinements = store();
    expect(refinements.status()).toBe('loading');
    await refinements.load();
    expect(refinements.status()).toBe('ready');
    expect(refinements.latest('PROJ-1')?.status).toBe('succeeded');
    expect(refinements.latest('PROJ-2')?.status).toBe('failed');
    expect(refinements.latest('PROJ-3')).toBeNull();
  });

  it('reports a list that cannot be read, and keeps what it read before when a later read fails', async () => {
    api.on('listRefinements', () => Promise.resolve(fail({ kind: 'network' })));
    const refinements = store();
    await refinements.load();
    expect(refinements.status()).toBe('error');

    held = [aRefinement('PROJ-1', { status: 'running' })];
    api.on('listRefinements', () => Promise.resolve(ok(held)));
    await refinements.load();
    expect(refinements.status()).toBe('ready');
    api.on('listRefinements', () => Promise.resolve(fail({ kind: 'network' })));
    await refinements.load();
    expect(refinements.status()).toBe('ready');
    expect(refinements.latest('PROJ-1')?.status).toBe('running');
  });

  it('reads the history of a row when it opens, and shows its newest refinement with the Markdown', async () => {
    held = [
      aRefinement('PROJ-1', { id: 'proj-1-refinement-002-beef' }),
      aRefinement('PROJ-1', { status: 'cancelled' }),
    ];
    const refinements = store();
    await refinements.load();
    expect(refinements.isOpen('PROJ-1')).toBe(false);
    expect(refinements.newest('PROJ-1')).toBeNull();
    refinements.toggle('PROJ-1');
    expect(refinements.isOpen('PROJ-1')).toBe(true);
    await settle();
    expect(refinements.history('PROJ-1')).toEqual({
      items: held,
      failed: false,
    });
    expect(refinements.newest('PROJ-1')?.content).toBe('## Verdict\nREADY.');
    refinements.toggle('PROJ-1');
    expect(refinements.isOpen('PROJ-1')).toBe(false);
    expect(api.callsOf('getRefinements')).toHaveLength(1);
  });

  it('does not take a history whose newest is not the row’s refinement as its content', async () => {
    held = [aRefinement('PROJ-1')];
    const refinements = store();
    await refinements.load();
    await refinements.readHistory('PROJ-1');
    held = [
      aRefinement('PROJ-1', {
        id: 'proj-1-refinement-002-beef',
        status: 'queued',
      }),
      ...held,
    ];
    api.on('getRefinements', () => new Promise(() => undefined));
    await refinements.load();
    expect(refinements.latest('PROJ-1')?.status).toBe('queued');
    expect(refinements.newest('PROJ-1')).toBeNull();
  });

  it('keeps the items read before when a history read fails, and clears the failure on the next success', async () => {
    held = [aRefinement('PROJ-1')];
    const refinements = store();
    await refinements.load();
    await refinements.readHistory('PROJ-1');
    api.on('getRefinements', () => Promise.resolve(fail({ kind: 'network' })));
    await refinements.readHistory('PROJ-1');
    expect(refinements.history('PROJ-1')).toEqual({
      items: held,
      failed: true,
    });
    api.on('getRefinements', (key) =>
      Promise.resolve(ok({ key, items: held }))
    );
    await refinements.readHistory('PROJ-1');
    expect(refinements.history('PROJ-1')?.failed).toBe(false);
  });

  it('asks with confirmSpend only, leaving out empty notes and a missing cap, and opens the queued row', async () => {
    const queued = aRefinement('PROJ-1', { status: 'queued' });
    api.on('requestRefinement', () => Promise.resolve(ok(queued)));
    const refinements = store();
    await refinements.load();
    const result = await refinements.request('PROJ-1', '', null);
    expect(result).toEqual(ok(queued));
    expect(api.callsOf('requestRefinement').map((c) => c.args)).toEqual([
      ['PROJ-1', { confirmSpend: true }],
    ]);
    expect(refinements.latest('PROJ-1')).toEqual(queued);
    expect(refinements.newest('PROJ-1')).toEqual(queued);
    expect(refinements.isOpen('PROJ-1')).toBe(true);
    expect(clock.delays).toEqual([REFINEMENT_POLL_MS]);
  });

  it('sends the notes and the cap when given', async () => {
    api.on('requestRefinement', (key) =>
      Promise.resolve(ok(aRefinement(key, { status: 'queued' })))
    );
    await store().request('PROJ-1', 'Check the limits', 2_500_000_000);
    expect(api.callsOf('requestRefinement')[0]?.args).toEqual([
      'PROJ-1',
      {
        confirmSpend: true,
        notes: 'Check the limits',
        budgetNanoAiu: 2_500_000_000,
      },
    ]);
  });

  it('reads the item again when a request finds a refinement already in progress', async () => {
    api.on('requestRefinement', invalidState);
    const refinements = store();
    await refinements.load();
    held = [aRefinement('PROJ-1', { status: 'running' })];
    const result = await refinements.request('PROJ-1', '', null);
    expect(result.ok).toBe(false);
    await settle();
    expect(api.callsOf('listRefinements')).toHaveLength(2);
    expect(refinements.latest('PROJ-1')?.status).toBe('running');
    expect(refinements.isOpen('PROJ-1')).toBe(false);
  });

  it('takes a cancelled refinement at once and stops polling when nothing is in progress', async () => {
    held = [aRefinement('PROJ-1', { status: 'queued' })];
    const cancelled = aRefinement('PROJ-1', {
      status: 'cancelled',
      cancelRequested: true,
      exitReason: 'cancelled by alex@example.com: Wrong story',
    });
    api.on('cancelRefinement', () => Promise.resolve(ok(cancelled)));
    const refinements = store();
    await refinements.load();
    expect(clock.pending).toBe(1);
    await refinements.cancel('PROJ-1', 'Wrong story');
    expect(api.callsOf('cancelRefinement')[0]?.args).toEqual([
      'PROJ-1',
      { reason: 'Wrong story' },
    ]);
    expect(refinements.latest('PROJ-1')?.status).toBe('cancelled');
    expect(clock.pending).toBe(0);
  });

  it('reads the item, and its open row, again when a cancel finds nothing in progress', async () => {
    held = [aRefinement('PROJ-1', { status: 'running' })];
    api.on('cancelRefinement', invalidState);
    const refinements = store();
    await refinements.load();
    refinements.toggle('PROJ-1');
    await settle();
    held = [aRefinement('PROJ-1')];
    await refinements.cancel('PROJ-1', 'Too late');
    await settle();
    expect(refinements.latest('PROJ-1')?.status).toBe('succeeded');
    expect(refinements.newest('PROJ-1')?.content).toBe('## Verdict\nREADY.');
  });

  it('polls the list while a refinement is in progress, and reads only the open rows that moved', async () => {
    held = [
      aRefinement('PROJ-1', { status: 'running' }),
      aRefinement('PROJ-2', { status: 'running' }),
      aRefinement('PROJ-3', { status: 'running' }),
    ];
    const refinements = store();
    await refinements.load();
    refinements.toggle('PROJ-1');
    refinements.toggle('PROJ-2');
    await settle();
    expect(api.callsOf('getRefinements')).toHaveLength(2);

    held = [
      aRefinement('PROJ-1'),
      aRefinement('PROJ-2', { status: 'running' }),
      aRefinement('PROJ-3'),
    ];
    await clock.advance(REFINEMENT_POLL_MS);
    expect(api.callsOf('listRefinements')).toHaveLength(2);
    expect(api.callsOf('getRefinements').map((c) => c.args)).toEqual([
      ['PROJ-1'],
      ['PROJ-2'],
      ['PROJ-1'],
    ]);
    expect(refinements.newest('PROJ-1')?.status).toBe('succeeded');
    expect(refinements.latest('PROJ-3')?.status).toBe('succeeded');
    expect(clock.pending).toBe(1);

    held = [
      aRefinement('PROJ-1'),
      aRefinement('PROJ-2'),
      aRefinement('PROJ-3'),
    ];
    await clock.advance(REFINEMENT_POLL_MS);
    expect(refinements.newest('PROJ-2')?.status).toBe('succeeded');
    expect(clock.pending).toBe(0);
  });

  it('never schedules two reads at once', async () => {
    held = [aRefinement('PROJ-1', { status: 'running' })];
    const refinements = store();
    await refinements.load();
    await refinements.load();
    await refinements.readHistory('PROJ-1');
    expect(clock.pending).toBe(1);
  });

  it('keeps a refinement just asked for, and keeps polling it, when a list read that began before it answers after it', async () => {
    const queued = aRefinement('PROJ-1', { status: 'queued' });
    api.on('requestRefinement', () => Promise.resolve(ok(queued)));
    const refinements = store();
    await refinements.load();
    expect(clock.pending).toBe(0);

    // A read of the list is under way (a poll, or a retry) and the server answers it as it was before the request.
    let release: (
      value: ApiResult<readonly RefinementSummary[]>
    ) => void = () => undefined;
    api.on(
      'listRefinements',
      () => new Promise((resolve) => (release = resolve))
    );
    const pending = refinements.load();
    await refinements.request('PROJ-1', '', null);
    expect(refinements.latest('PROJ-1')?.status).toBe('queued');
    expect(clock.pending).toBe(1);

    held = [queued];
    api.on('listRefinements', () => Promise.resolve(ok(held)));
    release(ok([]));
    await pending;
    await settle();
    expect(refinements.latest('PROJ-1')?.status).toBe('queued');
    expect(refinements.newest('PROJ-1')).toEqual(queued);
    expect(clock.pending).toBe(1);
  });

  it('keeps a cancel just answered when a list read that began before it answers after it', async () => {
    held = [aRefinement('PROJ-1', { status: 'running' })];
    const cancelled = aRefinement('PROJ-1', {
      status: 'cancelled',
      cancelRequested: true,
      exitReason: 'cancelled by alex@example.com: Wrong story',
    });
    api.on('cancelRefinement', () => Promise.resolve(ok(cancelled)));
    const refinements = store();
    await refinements.load();

    let release: (
      value: ApiResult<readonly RefinementSummary[]>
    ) => void = () => undefined;
    const before = held;
    api.on(
      'listRefinements',
      () => new Promise((resolve) => (release = resolve))
    );
    const pending = refinements.load();
    await refinements.cancel('PROJ-1', 'Wrong story');
    held = [cancelled];
    api.on('listRefinements', () => Promise.resolve(ok(held)));
    release(ok(before));
    await pending;
    await settle();
    expect(refinements.latest('PROJ-1')?.status).toBe('cancelled');
    expect(clock.pending).toBe(0);
  });

  it('keeps a refinement just asked for when a history read that began before it answers after it', async () => {
    const earlier = aRefinement('PROJ-1');
    held = [earlier];
    const refinements = store();
    await refinements.load();
    refinements.toggle('PROJ-1');
    await settle();
    const queued = aRefinement('PROJ-1', {
      id: 'proj-1-refinement-002-beef',
      status: 'queued',
    });
    api.on('requestRefinement', () => Promise.resolve(ok(queued)));

    let release: (
      value: ApiResult<{ key: string; items: readonly Refinement[] }>
    ) => void = () => undefined;
    api.on(
      'getRefinements',
      () => new Promise((resolve) => (release = resolve))
    );
    const pending = refinements.readHistory('PROJ-1');
    await refinements.request('PROJ-1', '', null);
    held = [queued, earlier];
    api.on('getRefinements', (key) =>
      Promise.resolve(ok({ key, items: held }))
    );
    release(ok({ key: 'PROJ-1', items: [earlier] }));
    await pending;
    await settle();
    expect(refinements.latest('PROJ-1')?.status).toBe('queued');
    expect(refinements.history('PROJ-1')?.items?.map((r) => r.id)).toEqual([
      queued.id,
      earlier.id,
    ]);
    expect(clock.pending).toBe(1);
  });

  it('stops polling and ignores late answers once the page is gone', async () => {
    held = [aRefinement('PROJ-1', { status: 'running' })];
    const page = createEnvironmentInjector(
      [BacklogRefinements],
      TestBed.inject(EnvironmentInjector)
    );
    const refinements = page.get(BacklogRefinements);
    await refinements.load();
    expect(clock.pending).toBe(1);
    let release: (
      value: ApiResult<readonly RefinementSummary[]>
    ) => void = () => undefined;
    api.on(
      'listRefinements',
      () => new Promise((resolve) => (release = resolve))
    );
    const late = refinements.load();
    page.destroy();
    expect(clock.pending).toBe(0);
    release(ok([aRefinement('PROJ-1')]));
    await late;
    expect(refinements.latest('PROJ-1')?.status).toBe('running');
    expect(clock.pending).toBe(0);
  });
});
