import type { StoryPackage } from '@core/api/story-state';
import type { Run } from '@core/api/types';
import { aStory, anEvent } from '@core/realtime/testing/events';
import listStoryRuns from '@testing/fixtures/listStoryRuns.json';
import {
  DECIDABLE_PACKAGE_STATUSES,
  canDecidePackage,
  packageRows,
  packageStatusView,
  reportWords,
} from './work-packages';

/** A run for specs, from the fixture's first run; fictional data. */
function aRun(id: string, changes: Partial<Run> = {}): Run {
  const base = listStoryRuns.items[0] as Run;
  return {
    ...base,
    id,
    phase: 'implementation',
    agent: 'implementer',
    status: 'succeeded',
    ...changes,
  };
}

function aPackage(
  id: string,
  changes: Partial<StoryPackage> = {}
): StoryPackage {
  return {
    id,
    repo: 'billing-api',
    agent: 'implementer',
    status: 'pending',
    openPr: false,
    dependsOn: [],
    ...changes,
  };
}

const queued = (id: number, runId: string, workPackage: string) =>
  anEvent(id, 'run.queued', {
    runId,
    phase: 'implementation',
    agent: 'implementer',
    workPackage,
  });

describe('packageRows', () => {
  it('shows the packages before implementation, with no runs and their unfinished dependencies', () => {
    const rows = packageRows(
      [aPackage('WP1'), aPackage('WP2', { dependsOn: ['WP1'] })],
      [],
      []
    );
    expect(rows.map((r) => [r.pkg.id, r.status.label, r.runs.length])).toEqual([
      ['WP1', 'Not started', 0],
      ['WP2', 'Not started', 0],
    ]);
    expect(rows[1]?.waitingOn).toEqual(['WP1']);
    expect(rows[0]?.reason).toBeNull();
  });

  it('gives each package of the same workflow its own runs, labelled with the package and the phase', () => {
    const events = [
      queued(1, 'r-04', 'WP1'),
      anEvent(2, 'implementation.reported', {
        runId: 'r-04',
        workPackage: 'WP1',
        status: 'ready',
        report: { status: 'ready', delivery_kind: 'changed' },
      }),
      queued(3, 'r-05', 'WP2'),
      anEvent(4, 'implementation.reported', {
        runId: 'r-05',
        workPackage: 'WP2',
        status: 'ready',
        report: { status: 'ready', delivery_kind: 'verified_existing' },
      }),
      // A run whose run.queued names no package belongs to none, whatever its order.
      anEvent(5, 'run.queued', { runId: 'r-06', phase: 'implementation' }),
    ];
    const runs = [aRun('r-04'), aRun('r-05'), aRun('r-06')];
    const rows = packageRows(
      [
        aPackage('WP1', { status: 'done', openPr: true }),
        aPackage('WP2', { status: 'done', dependsOn: ['WP1'] }),
      ],
      events,
      runs
    );
    expect(rows[0]?.runs.map((r) => [r.runId, r.label])).toEqual([
      ['r-04', 'WP1 — implementation'],
    ]);
    expect(rows[1]?.runs.map((r) => [r.runId, r.label])).toEqual([
      ['r-05', 'WP2 — implementation'],
    ]);
    expect(rows[1]?.lastReport?.deliveryKind).toBe('verified_existing');
    expect(rows[1]?.waitingOn).toEqual([]);
  });

  it("keeps a run's success apart from the package's status", () => {
    const rows = packageRows(
      [aPackage('WP2', { status: 'unverified' })],
      [
        queued(1, 'r-05', 'WP2'),
        anEvent(2, 'implementation.reported', {
          runId: 'r-05',
          workPackage: 'WP2',
          status: 'unverified',
          notes: ['a check it needed could not run'],
        }),
      ],
      [aRun('r-05', { status: 'succeeded' })]
    );
    const row = rows[0]!;
    expect(row.runs[0]?.run?.status).toBe('succeeded');
    expect(row.status.label).toBe('Unverified');
    expect(reportWords(row.lastReport!.status)).toBe('Reported unverified');
    expect(row.reason).toBe('a check it needed could not run');
  });

  it('quotes the blocker question of a blocked package, and its decisions', () => {
    const decided = {
      ...anEvent(4, 'work_package.decided', {
        workPackage: 'WP2',
        decision: 'retry',
        reason: 'Use EUR.',
      }),
      actor: 'alex@example.com',
    };
    const rows = packageRows(
      [aPackage('WP2', { status: 'blocked' })],
      [
        queued(1, 'r-05', 'WP2'),
        anEvent(2, 'implementation.reported', {
          runId: 'r-05',
          workPackage: 'WP2',
          status: 'blocked',
          notes: ['implementer is blocked'],
          report: { blocker_question: 'Which currency?' },
        }),
        decided,
      ],
      [aRun('r-05')]
    );
    expect(rows[0]?.reason).toBe('Which currency?');
    expect(rows[0]?.decisions.map((d) => [d.decision, d.actor])).toEqual([
      ['retry', 'alex@example.com'],
    ]);
  });

  it('marks the package whose run is on, and lists a run the list does not hold yet', () => {
    const rows = packageRows(
      [aPackage('WP1'), aPackage('WP2')],
      [queued(1, 'r-04', 'WP1'), queued(2, 'r-05', 'WP2')],
      [aRun('r-04', { status: 'running' })]
    );
    expect(rows.map((r) => r.active)).toEqual([true, false]);
    expect(rows[1]?.runs[0]?.run).toBeNull();
  });
});

describe('canDecidePackage', () => {
  const halted = aStory('PROJ-131', {
    phase: 'implementation',
    status: 'halted',
    haltReason: 'package_stuck',
  });

  it('allows a decision on a failed, stalled, blocked or unverified package of a voyage halted in implementation', () => {
    expect([...DECIDABLE_PACKAGE_STATUSES].sort()).toEqual([
      'blocked',
      'failed',
      'stalled',
      'unverified',
    ]);
    for (const status of DECIDABLE_PACKAGE_STATUSES)
      expect(canDecidePackage(halted, { status })).toBe(true);
  });

  it('refuses any other package status', () => {
    for (const status of [
      'pending',
      'in_progress',
      'done',
      'waiting_on_handback',
    ])
      expect(canDecidePackage(halted, { status })).toBe(false);
  });

  it('refuses while the voyage is not halted, or halted in another phase', () => {
    for (const story of [
      { ...halted, status: 'ready' as const },
      { ...halted, status: 'running' as const },
      { ...halted, phase: 'pr_review' },
      null,
    ])
      expect(canDecidePackage(story, { status: 'blocked' })).toBe(false);
    expect(canDecidePackage(halted, null)).toBe(false);
  });
});

describe('packageStatusView', () => {
  it('words the known statuses and shows an unknown one as the API wrote it', () => {
    expect(packageStatusView('done')).toEqual({ label: 'Done', tone: 'ok' });
    expect(packageStatusView('stalled').tone).toBe('warn');
    expect(packageStatusView('mystery')).toEqual({
      label: 'mystery',
      tone: 'neutral',
    });
  });
});
