import { anEvent } from '@core/realtime/testing/events';
import {
  packageReportsByRun,
  packageRunLabel,
  packageRunsById,
  readPackageDecision,
  readPackageReport,
  readPackageRun,
} from './work-package-events';

/** The `run.queued` of an implementation run, as the reconciler writes it; fictional data. */
function queued(id: number, runId: string, workPackage?: string) {
  return anEvent(id, 'run.queued', {
    runId,
    phase: 'implementation',
    agent: 'implementer',
    model: null,
    runtime: 'github-actions',
    attempt: 1,
    ...(workPackage !== undefined
      ? { workPackage, repo: 'billing-api', branch: 'feature/PROJ-131-totals' }
      : {}),
  });
}

describe('readPackageRun', () => {
  it('reads the package, repository, branch and attempt a run was queued for', () => {
    expect(readPackageRun(queued(1, 'r-05', 'WP2'))).toEqual({
      runId: 'r-05',
      workPackageId: 'WP2',
      phase: 'implementation',
      repo: 'billing-api',
      branch: 'feature/PROJ-131-totals',
      attempt: 1,
      queuedAt: '2026-10-06T09:00:01.000Z',
    });
  });

  it('gives nothing for a run queued without a package, or another event', () => {
    expect(readPackageRun(queued(1, 'r-05'))).toBeNull();
    expect(
      readPackageRun(anEvent(2, 'run.finished', { runId: 'r-05' }))
    ).toBeNull();
    expect(
      readPackageRun(
        anEvent(3, 'run.queued', { runId: 'r-06', workPackage: 7 })
      )
    ).toBeNull();
  });
});

describe('packageRunsById', () => {
  it('ties two runs of the same workflow to their own packages by their run.queued, never by name or order', () => {
    // Same phase, agent and runtime: only the payload of each run.queued says which package it is.
    const events = [
      queued(1, 'r-04', 'WP1'),
      queued(2, 'r-05', 'WP2'),
      queued(3, 'r-06'),
    ];
    const runs = packageRunsById(events);
    expect(runs.get('r-04')?.workPackageId).toBe('WP1');
    expect(runs.get('r-05')?.workPackageId).toBe('WP2');
    expect(runs.has('r-06')).toBe(false);
    expect(packageRunLabel(runs, 'r-05')).toBe('WP2 — implementation');
    expect(packageRunLabel(runs, 'r-06')).toBeNull();
    expect(packageRunLabel(runs, 'r-99')).toBeNull();
  });

  it('keeps the first run.queued of a run', () => {
    const runs = packageRunsById([
      queued(1, 'r-04', 'WP1'),
      queued(2, 'r-04', 'WP9'),
    ]);
    expect(runs.get('r-04')?.workPackageId).toBe('WP1');
  });
});

describe('readPackageReport', () => {
  it('reads how Ahoy routed the report, the notes, the blocker question and whether the work was only verified', () => {
    const event = anEvent(4, 'implementation.reported', {
      runId: 'r-05',
      workPackage: 'WP2',
      repo: 'billing-api',
      status: 'blocked',
      notes: ['implementer is blocked on work package WP2', 7, ''],
      report: {
        status: 'blocked',
        blocker_question: 'Which currency do totals use?',
        delivery_kind: 'verified_existing',
      },
    });
    expect(readPackageReport(event)).toEqual({
      runId: 'r-05',
      workPackageId: 'WP2',
      status: 'blocked',
      notes: ['implementer is blocked on work package WP2'],
      blockerQuestion: 'Which currency do totals use?',
      deliveryKind: 'verified_existing',
      at: event.createdAt,
    });
  });

  it('reads a report that is not an object as having no question and no delivery kind', () => {
    const report = readPackageReport(
      anEvent(5, 'implementation.reported', {
        runId: 'r-05',
        workPackage: 'WP2',
        status: 'failed',
        notes: 'not a list',
        report: 'garbage',
      })
    );
    expect(report).toEqual({
      runId: 'r-05',
      workPackageId: 'WP2',
      status: 'failed',
      notes: [],
      at: '2026-10-06T09:00:05.000Z',
    });
  });

  it('gives nothing without a run, a package or a status', () => {
    for (const payload of [
      { workPackage: 'WP2', status: 'ready' },
      { runId: 'r-05', status: 'ready' },
      { runId: 'r-05', workPackage: 'WP2' },
    ])
      expect(
        readPackageReport(anEvent(6, 'implementation.reported', payload))
      ).toBeNull();
  });

  it('keeps the newest report of each run', () => {
    const reports = packageReportsByRun([
      anEvent(7, 'implementation.reported', {
        runId: 'r-05',
        workPackage: 'WP2',
        status: 'in_progress',
      }),
      anEvent(8, 'implementation.reported', {
        runId: 'r-05',
        workPackage: 'WP2',
        status: 'ready',
      }),
    ]);
    expect(reports.get('r-05')?.status).toBe('ready');
  });
});

describe('readPackageDecision', () => {
  it('reads a retry or an accept with its reason and who took it', () => {
    const event = {
      ...anEvent(9, 'work_package.decided', {
        workPackage: 'WP2',
        decision: 'accept',
        reason: 'Verified by hand.',
      }),
      actor: 'alex@example.com',
    };
    expect(readPackageDecision(event)).toEqual({
      workPackageId: 'WP2',
      decision: 'accept',
      reason: 'Verified by hand.',
      actor: 'alex@example.com',
      at: event.createdAt,
    });
  });

  it('gives nothing for another decision word or without a reason', () => {
    expect(
      readPackageDecision(
        anEvent(10, 'work_package.decided', {
          workPackage: 'WP2',
          decision: 'skip',
          reason: 'x',
        })
      )
    ).toBeNull();
    expect(
      readPackageDecision(
        anEvent(11, 'work_package.decided', {
          workPackage: 'WP2',
          decision: 'retry',
        })
      )
    ).toBeNull();
  });
});
