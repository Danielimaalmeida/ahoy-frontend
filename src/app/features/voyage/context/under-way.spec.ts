import type { Run, Story } from '@core/api/types';
import type { ProgressEntry } from '@core/stores/run-progress-buffer';
import { newestStep, underWay } from './under-way';

const NOW = new Date('2026-11-05T10:44:30Z');

function story(overrides: Partial<Story> = {}): Story {
  return {
    key: 'PROJ-140',
    title: 'Add audit trail to admin role changes',
    owner: 'jordan@example.com',
    phase: 'implementation',
    status: 'running',
    haltReason: null,
    budgetNanoAiu: 30e9,
    spentNanoAiu: 9e9,
    controlSha: 'a41f9c2',
    currentRunId: 'r-05',
    version: 7,
    createdAt: '2026-11-05T10:00:00Z',
    updatedAt: '2026-11-05T10:44:00Z',
    ...overrides,
  };
}

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 'r-05',
    storyKey: 'PROJ-140',
    phase: 'implementation',
    agent: 'implementer',
    model: 'claude-sonnet-5',
    reasoningEffort: 'high',
    status: 'running',
    runtime: 'fake',
    controlSha: 'a41f9c2',
    budgetNanoAiu: 28e9,
    usage: { requests: 3, nanoAiu: 1e9, inputTokens: 0, outputTokens: 0 },
    replayOf: null,
    exitReason: null,
    gate: null,
    startedBy: 'ahoy-reconciler',
    createdAt: '2026-11-05T10:40:00Z',
    startedAt: '2026-11-05T10:40:18Z',
    endedAt: null,
    ...overrides,
  };
}

const STEPS: ProgressEntry[] = [
  {
    kind: 'step',
    at: '2026-11-05T10:44:05Z',
    eventId: '1',
    step: {
      kind: 'tool',
      runId: 'r-05',
      line: 1,
      tool: 'view',
      summary: 'services/admin/roles/RoleService.ts',
    },
  },
  { kind: 'gap', count: 3 },
  {
    kind: 'step',
    at: '2026-11-05T10:44:21Z',
    eventId: '2',
    step: {
      kind: 'message',
      runId: 'r-05',
      line: 5,
      text: 'Role changes go through\n  RoleService only.',
    },
  },
];

describe('underWay', () => {
  it('says who is at work, in which phase, for how long and the newest step', () => {
    const view = underWay({
      story: story(),
      runs: [run()],
      waitingForCi: false,
      entries: STEPS,
      now: NOW,
    });
    expect(view).toEqual({
      kind: 'running',
      heading: 'Implementer is at work on implementation',
      time: '4 m 12 s',
      detail: '',
      runId: 'r-05',
      runLabel: 'r-05 · claude-sonnet-5 · high',
      step: {
        at: '2026-11-05T10:44:21Z',
        tool: 'message',
        text: 'Role changes go through RoleService only.',
      },
    });
  });

  it('says the run is starting while it is queued', () => {
    const view = underWay({
      story: story(),
      runs: [run({ status: 'queued', startedAt: null })],
      waitingForCi: false,
      entries: [],
      now: NOW,
    });
    expect(view?.kind).toBe('starting');
    expect(view?.heading).toBe('Starting Implementer for implementation');
    expect(view?.time).toBe('waiting for a worker, 4 m 30 s');
  });

  it('uses the worker startup words while the worker is not up yet', () => {
    const view = underWay({
      story: story(),
      runs: [
        run({
          runtimeStatus: {
            state: 'waiting_for_node',
            reason: null,
            message: null,
            observedAt: '2026-11-05T10:44:25Z',
          },
        }),
      ],
      waitingForCi: false,
      entries: [],
      now: NOW,
    });
    expect(view?.kind).toBe('starting');
    expect(view?.detail).toBe(
      'Waiting for a new node. The cluster is adding capacity.'
    );
  });

  it('says Ahoy is moving on when no run is on, naming the last run', () => {
    const view = underWay({
      story: story({ status: 'ready', currentRunId: null }),
      runs: [run({ status: 'succeeded', endedAt: '2026-11-05T10:44:00Z' })],
      waitingForCi: false,
      entries: [],
      now: NOW,
    });
    expect(view).toEqual({
      kind: 'between',
      heading: 'Moving on in implementation',
      time: 'queued 30 s',
      detail:
        'Ahoy is starting the next run. Last run: r-05 · Implementer · succeeded.',
      runId: 'r-05',
      runLabel: '',
      step: null,
    });
  });

  it('says the voyage is queued before its first run', () => {
    const view = underWay({
      story: story({ status: 'ready', currentRunId: null, phase: 'intake' }),
      runs: [],
      waitingForCi: false,
      entries: [],
      now: NOW,
    });
    expect(view?.heading).toBe('Queued for intake');
    expect(view?.time).toBe('30 s');
    expect(view?.runId).toBe(null);
  });

  it('shows nothing while Ahoy waits for CI, or when the voyage is not under way', () => {
    const base = { runs: [run()], entries: [], now: NOW };
    expect(underWay({ ...base, story: story(), waitingForCi: true })).toBe(
      null
    );
    for (const status of [
      'awaiting_input',
      'awaiting_decision',
      'halted',
      'terminal',
      'cancelled',
    ] as const)
      expect(
        underWay({ ...base, story: story({ status }), waitingForCi: false })
      ).toBe(null);
    expect(underWay({ ...base, story: null, waitingForCi: false })).toBe(null);
  });
});

describe('newestStep', () => {
  it('is null before any step', () => {
    expect(newestStep([{ kind: 'gap', count: 2 }])).toBe(null);
  });

  it('gives a tool with its summary', () => {
    expect(newestStep(STEPS.slice(0, 2))).toEqual({
      at: '2026-11-05T10:44:05Z',
      tool: 'view',
      text: 'services/admin/roles/RoleService.ts',
    });
  });
});
