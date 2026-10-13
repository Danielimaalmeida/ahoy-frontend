/**
 * The work packages of a voyage as the page shows them: the plan's packages from the state (`work_packages[]`), each with
 * the runs whose `run.queued` names it, what those runs reported (`implementation.reported`) and the decisions a person
 * took on it (`work_package.decided`).
 *
 * Three things stay apart on purpose: a run's own status (did the worker's session end well), what Ahoy made of the
 * run's report (`ready`, `blocked`, ...) and the package's status in the state (whether Ahoy counts it as done). A
 * successful run is not an accepted package.
 */
import type { StoryPackage } from '@core/api/story-state';
import type { AhoyEvent, Run, Story } from '@core/api/types';
import {
  packageRunsById,
  packageReportsByRun,
  readPackageDecision,
  type PackageDecisionEvent,
  type PackageReportEvent,
  type PackageRun,
} from '@core/api/work-package-events';

/** The package statuses a person can retry or accept (`STUCK_STATUSES` of ahoy-hosted). */
export const DECIDABLE_PACKAGE_STATUSES: readonly string[] = [
  'failed',
  'stalled',
  'blocked',
  'unverified',
];

/** How a package's status reads, and its tone for the tag. */
export interface PackageStatusView {
  readonly label: string;
  readonly tone: 'neutral' | 'active' | 'ok' | 'warn' | 'bad';
}

/** The words for the package statuses the hosted API writes; anything else shows as it is. */
const STATUS_VIEWS: Readonly<Record<string, PackageStatusView>> = {
  pending: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'active' },
  waiting_on_handback: { label: 'Waiting on another package', tone: 'neutral' },
  done: { label: 'Done', tone: 'ok' },
  blocked: { label: 'Blocked', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
  stalled: { label: 'Stalled', tone: 'warn' },
  unverified: { label: 'Unverified', tone: 'warn' },
};

/** The words and tone of a package status; an unknown status reads as the API wrote it. */
export function packageStatusView(status: string): PackageStatusView {
  const known = Object.hasOwn(STATUS_VIEWS, status)
    ? STATUS_VIEWS[status]
    : undefined;
  return known ?? { label: status, tone: 'neutral' };
}

/** The words for what Ahoy made of an implementation report (`implementation.reported` `status`). */
const REPORT_WORDS: Readonly<Record<string, string>> = {
  ready: 'Reported ready',
  in_progress: 'Reported in progress',
  waiting_on_handback: 'Handed back to another package',
  blocked: 'Reported blocked',
  unverified: 'Reported unverified',
  failed: 'Report refused',
  stalled: 'Stalled',
};

/** "Reported ready", "Report refused", ...: what Ahoy made of a run's report, never the package's acceptance. */
export function reportWords(status: string): string {
  const known = Object.hasOwn(REPORT_WORDS, status)
    ? REPORT_WORDS[status]
    : undefined;
  return known ?? `Reported ${status}`;
}

/** One run of a package. */
export interface PackageRunRow {
  readonly runId: string;
  /** "WP2 — implementation". */
  readonly label: string;
  /** The run from the list; null while the list does not hold it yet. */
  readonly run: Run | null;
  readonly queued: PackageRun;
  /** What the run reported, once it did. */
  readonly report: PackageReportEvent | null;
}

/** One package, with everything the page shows about it. */
export interface PackageRow {
  readonly pkg: StoryPackage;
  readonly status: PackageStatusView;
  /** Its runs, oldest first. */
  readonly runs: readonly PackageRunRow[];
  /** A run of it is queued or running now. */
  readonly active: boolean;
  /** The last report of its runs; null before one. */
  readonly lastReport: PackageReportEvent | null;
  /**
   * Why it needs rework or is stuck, in the API's words: the blocker question of its last report, else that report's
   * notes, for a package that is not done. Null when there is nothing to quote.
   */
  readonly reason: string | null;
  /** What people decided about it, oldest first. */
  readonly decisions: readonly PackageDecisionEvent[];
  /** Its dependencies that are not done yet. */
  readonly waitingOn: readonly string[];
}

const isActive = (run: Run | null): boolean =>
  run !== null && (run.status === 'queued' || run.status === 'running');

/** Why a package needs rework or is stuck, from its last report; null for a done package or without one. */
function reasonOf(
  pkg: StoryPackage,
  report: PackageReportEvent | null
): string | null {
  if (pkg.status === 'done' || report === null) return null;
  if (report.blockerQuestion !== undefined) return report.blockerQuestion;
  return report.notes.length > 0 ? report.notes.join('\n') : null;
}

/**
 * The packages of the state, in plan order, with their runs, reports and decisions from the events. A run belongs to a
 * package only when its `run.queued` names it; a run without one belongs to none.
 */
export function packageRows(
  packages: readonly StoryPackage[],
  events: readonly AhoyEvent[],
  runs: readonly Run[]
): PackageRow[] {
  const queued = packageRunsById(events);
  const reports = packageReportsByRun(events);
  const decisions = events
    .map(readPackageDecision)
    .filter((d): d is PackageDecisionEvent => d !== null);
  const byId = new Map(runs.map((run) => [run.id, run]));
  const done = new Set(
    packages.filter((p) => p.status === 'done').map((p) => p.id)
  );

  return packages.map((pkg) => {
    const own = [...queued.values()]
      .filter((q) => q.workPackageId === pkg.id)
      // Oldest first, by when each was queued, then by id: the order never depends on how the API listed them.
      .sort(
        (a, b) =>
          a.queuedAt.localeCompare(b.queuedAt) || a.runId.localeCompare(b.runId)
      )
      .map((q): PackageRunRow => ({
        runId: q.runId,
        label: q.phase !== '' ? `${pkg.id} — ${q.phase}` : pkg.id,
        run: byId.get(q.runId) ?? null,
        queued: q,
        report: reports.get(q.runId) ?? null,
      }));
    const lastReport =
      [...own].reverse().find((row) => row.report !== null)?.report ?? null;
    return {
      pkg,
      status: packageStatusView(pkg.status),
      runs: own,
      active: own.some((row) => isActive(row.run)),
      lastReport,
      reason: reasonOf(pkg, lastReport),
      decisions: decisions.filter((d) => d.workPackageId === pkg.id),
      waitingOn: pkg.dependsOn.filter((dep) => !done.has(dep)),
    };
  });
}

/**
 * Whether a person may retry or accept the package now: only while the voyage is halted in implementation and the
 * package is failed, stalled, blocked or unverified (`decideWorkPackage` refuses the rest).
 */
export function canDecidePackage(
  story: Pick<Story, 'phase' | 'status'> | null,
  pkg: Pick<StoryPackage, 'status'> | null
): boolean {
  return (
    story !== null &&
    pkg !== null &&
    story.status === 'halted' &&
    story.phase === 'implementation' &&
    DECIDABLE_PACKAGE_STATUSES.includes(pkg.status)
  );
}
