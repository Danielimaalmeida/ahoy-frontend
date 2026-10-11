import {
  EnvironmentInjector,
  createEnvironmentInjector,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { AgentDiagnosisList, Refinement, Story } from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { isActiveRefinement } from '@domain/refinement';
import { VoyageContext } from '../context/voyage-context';
import { AGENT_DIAGNOSIS_POLL_MS, AgentDiagnoses } from './agent-diagnoses';

/** An agent diagnosis for specs; fictional data. */
function aDiagnosis(
  key: string,
  changes: Partial<Refinement> = {}
): Refinement {
  const status = changes.status ?? 'succeeded';
  return {
    id: `${key.toLowerCase()}-diagnosis-001-abcd`,
    key,
    status,
    notes: null,
    requestedBy: 'alex@example.com',
    agent: 'shipwright',
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
    content: status === 'succeeded' ? '## Cause\nThe token was revoked.' : null,
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

describe('AgentDiagnoses', () => {
  let api: FakeApi;
  let clock: FakeClock;
  let story: ReturnType<typeof signal<Story | null>>;
  /** Every diagnosis the fake API holds, newest first. */
  let held: Refinement[];

  const halted = (version = 5): Story =>
    aStory('PROJ-118', { status: 'halted', haltReason: 'run_failed', version });
  const list = (): ApiResult<AgentDiagnosisList> =>
    ok({ key: 'PROJ-118', items: held });

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock('2026-10-06T10:00:00.000Z');
    held = [];
    api.on('listAgentDiagnoses', () => Promise.resolve(list()));
    story = signal<Story | null>(null);
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock, net: new FakeFetch() }),
        { provide: VoyageContext, useValue: { story } },
        AgentDiagnoses,
      ],
    });
  });

  const store = (): AgentDiagnoses => TestBed.inject(AgentDiagnoses);
  async function flush(): Promise<void> {
    TestBed.tick();
    await settle();
  }

  it('reads nothing while the voyage is not halted, and the diagnoses of the halted voyage once it is', async () => {
    held = [aDiagnosis('PROJ-118')];
    const agent = store();
    story.set(aStory('PROJ-118'));
    await flush();
    expect(api.callsOf('listAgentDiagnoses')).toHaveLength(0);
    expect(agent.newest()).toBeNull();

    story.set(halted());
    await flush();
    expect(api.callsOf('listAgentDiagnoses').map((c) => c.args)).toEqual([
      ['PROJ-118'],
    ]);
    expect(agent.newest()?.status).toBe('succeeded');
    expect(agent.state()).toBe('ready');
    expect(clock.pending).toBe(0);
  });

  it('reads again only when the halted voyage’s version moves, not when the same story is replaced', async () => {
    const agent = store();
    story.set(halted(5));
    await flush();
    story.set({ ...halted(5), spentNanoAiu: 2_000_000_000 });
    await flush();
    expect(api.callsOf('listAgentDiagnoses')).toHaveLength(1);
    story.set(halted(6));
    await flush();
    expect(api.callsOf('listAgentDiagnoses')).toHaveLength(2);
    expect(agent.newest()).toBeNull();
  });

  it('polls every 5 s while the newest is queued or running, and stops when it ends', async () => {
    held = [aDiagnosis('PROJ-118', { status: 'queued' })];
    const agent = store();
    story.set(halted());
    await flush();
    expect(agent.active()).toBe(true);
    expect(clock.pending).toBe(1);

    held = [aDiagnosis('PROJ-118', { status: 'running' })];
    await clock.advance(AGENT_DIAGNOSIS_POLL_MS);
    expect(agent.newest()?.status).toBe('running');
    expect(clock.pending).toBe(1);

    held = [aDiagnosis('PROJ-118')];
    await clock.advance(AGENT_DIAGNOSIS_POLL_MS);
    expect(agent.newest()?.status).toBe('succeeded');
    expect(agent.active()).toBe(false);
    expect(clock.pending).toBe(0);
    expect(api.callsOf('listAgentDiagnoses')).toHaveLength(3);
  });

  it('keeps what it read when a later read fails, and says it could not read when none ever answered', async () => {
    api.on('listAgentDiagnoses', () =>
      Promise.resolve(fail({ kind: 'network' }))
    );
    const agent = store();
    story.set(halted(5));
    await flush();
    expect(agent.state()).toBe('error');
    expect(agent.newest()).toBeNull();

    api.on('listAgentDiagnoses', () => Promise.resolve(list()));
    held = [aDiagnosis('PROJ-118')];
    story.set(halted(6));
    await flush();
    expect(agent.state()).toBe('ready');
    api.on('listAgentDiagnoses', () =>
      Promise.resolve(fail({ kind: 'network' }))
    );
    story.set(halted(7));
    await flush();
    expect(agent.state()).toBe('ready');
    expect(agent.newest()?.status).toBe('succeeded');
  });

  it('asks with confirmSpend only, leaving out empty notes and a missing limit, and shows it queued at once', async () => {
    const queued = aDiagnosis('PROJ-118', { status: 'queued' });
    api.on('requestAgentDiagnosis', () => Promise.resolve(ok(queued)));
    const agent = store();
    story.set(halted());
    await flush();
    const result = await agent.request('', null);
    expect(result).toEqual(ok(queued));
    expect(api.callsOf('requestAgentDiagnosis').map((c) => c.args)).toEqual([
      ['PROJ-118', { confirmSpend: true }],
    ]);
    expect(agent.newest()).toEqual(queued);
    expect(clock.pending).toBe(1);

    await agent.request('Is it the token?', 2_500_000_000);
    expect(api.callsOf('requestAgentDiagnosis')[1]?.args).toEqual([
      'PROJ-118',
      {
        confirmSpend: true,
        notes: 'Is it the token?',
        budgetNanoAiu: 2_500_000_000,
      },
    ]);
  });

  it('keeps a diagnosis just asked for when a read that began before it answers after it', async () => {
    const queued = aDiagnosis('PROJ-118', { status: 'queued' });
    api.on('requestAgentDiagnosis', () => Promise.resolve(ok(queued)));
    const agent = store();
    story.set(halted(5));
    await flush();

    let release: (value: ApiResult<AgentDiagnosisList>) => void = () =>
      undefined;
    api.on(
      'listAgentDiagnoses',
      () => new Promise((resolve) => (release = resolve))
    );
    story.set(halted(6));
    TestBed.tick();
    await agent.request('', null);
    expect(agent.newest()).toEqual(queued);

    held = [queued];
    api.on('listAgentDiagnoses', () => Promise.resolve(list()));
    release(ok({ key: 'PROJ-118', items: [] }));
    await settle();
    expect(agent.newest()?.status).toBe('queued');
    expect(clock.pending).toBe(1);
  });

  it('reads again when a request finds one already in progress, or the voyage no longer halted', async () => {
    api.on('requestAgentDiagnosis', invalidState);
    const agent = store();
    story.set(halted());
    await flush();
    held = [aDiagnosis('PROJ-118', { status: 'running' })];
    const result = await agent.request('', null);
    expect(result.ok).toBe(false);
    await settle();
    expect(api.callsOf('listAgentDiagnoses')).toHaveLength(2);
    expect(agent.newest()?.status).toBe('running');
  });

  it('takes a cancelled diagnosis at once and stops polling when nothing is in progress', async () => {
    held = [aDiagnosis('PROJ-118', { status: 'queued' })];
    const cancelled = aDiagnosis('PROJ-118', {
      status: 'cancelled',
      cancelRequested: true,
      exitReason: 'cancelled by alex@example.com: Asked by mistake',
    });
    api.on('cancelAgentDiagnosis', () => Promise.resolve(ok(cancelled)));
    const agent = store();
    story.set(halted());
    await flush();
    expect(clock.pending).toBe(1);
    await agent.cancel('Asked by mistake');
    expect(api.callsOf('cancelAgentDiagnosis')[0]?.args).toEqual([
      'PROJ-118',
      { reason: 'Asked by mistake' },
    ]);
    expect(agent.newest()?.status).toBe('cancelled');
    expect(clock.pending).toBe(0);
  });

  it('shows nothing of the voyage it was left for once the story on screen is another', async () => {
    held = [aDiagnosis('PROJ-118')];
    const agent = store();
    story.set(halted());
    await flush();
    expect(agent.newest()).not.toBeNull();
    story.set(aStory('PROJ-130', { status: 'halted', version: 2 }));
    TestBed.tick();
    expect(agent.newest()).toBeNull();
  });

  it('stops polling and ignores late answers once the page is gone', async () => {
    held = [aDiagnosis('PROJ-118', { status: 'running' })];
    const page = createEnvironmentInjector(
      [AgentDiagnoses],
      TestBed.inject(EnvironmentInjector)
    );
    const agent = page.get(AgentDiagnoses);
    story.set(halted());
    TestBed.tick();
    await settle();
    expect(clock.pending).toBe(1);
    page.destroy();
    expect(clock.pending).toBe(0);
    expect(agent.newest()?.status).toBe('running');
  });
});
