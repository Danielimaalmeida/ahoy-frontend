/**
 * Defensive readers for what the event history says about work packages: which run worked on which package
 * (`run.queued`), what each implementation run reported (`implementation.reported`) and what a person decided about a
 * stuck package (`work_package.decided`).
 *
 * The contract types these payloads only as objects, and `Run` itself carries no work package: the association is read
 * from the payload of the run's own `run.queued` and nowhere else, never from the run's name or the order of the runs.
 * The field names were read from the hosted reconciler (`ahoy-hosted` `apps/reconciler/src/delivery.ts`,
 * `stepImplementation` and `routeImplementationRun`, and `packages/core/src/service/commands.ts`, `decideWorkPackage`,
 * on its `main` of 2026-10-13). A payload that misses a field or has one of the wrong type gives nothing, rather than a
 * guess.
 */
import type { AhoyEvent } from './types';
import { isRecord, isWholeNumber } from './guard-kit';

/** The run of a work package, from its `run.queued`. */
export interface PackageRun {
  readonly runId: string;
  readonly workPackageId: string;
  /** The phase the payload names (`implementation`); "" when it names none. */
  readonly phase: string;
  /** The plan alias of the package's repository, when the payload names one. */
  readonly repo?: string;
  /** The branch the run pushes to, when the payload names one. */
  readonly branch?: string;
  /** The reconciler's count of runs of this phase, when the payload has it. */
  readonly attempt?: number;
  /** When the run was queued: the event's `createdAt`. */
  readonly queuedAt: string;
}

/** What an implementation run reported for its package, from `implementation.reported`. */
export interface PackageReportEvent {
  readonly runId: string;
  readonly workPackageId: string;
  /**
   * How Ahoy routed the report (`ready`, `blocked`, `unverified`, `failed`, `stalled`, `in_progress`, ...). It is what
   * Ahoy made of the report, not the run's own status, and not yet the package's acceptance: a `ready` package is still
   * checked by `child_ready` and `pr`.
   */
  readonly status: string;
  /** The routing's and the worker's notes, plain text, in order. */
  readonly notes: readonly string[];
  /** The implementer's `blocker_question`, when the report has one. */
  readonly blockerQuestion?: string;
  /** `changed` or `verified_existing` (the work was found done and only verified), when the report says. */
  readonly deliveryKind?: 'changed' | 'verified_existing';
  readonly at: string;
}

/** A person's retry or accept of a stuck package, from `work_package.decided`. */
export interface PackageDecisionEvent {
  readonly workPackageId: string;
  readonly decision: 'retry' | 'accept';
  readonly reason: string;
  readonly actor: string;
  readonly at: string;
}

/** A non-blank string field of an object; `undefined` otherwise. */
function text(
  value: Readonly<Record<string, unknown>>,
  key: string
): string | undefined {
  const field = value[key];
  return typeof field === 'string' && field.trim() !== '' ? field : undefined;
}

/** Reads a `run.queued` that names a work package; null for any other event, or one without a run or package. */
export function readPackageRun(event: AhoyEvent): PackageRun | null {
  if (event.type !== 'run.queued') return null;
  const payload = event.payload;
  const runId = text(payload, 'runId');
  const workPackageId = text(payload, 'workPackage');
  if (runId === undefined || workPackageId === undefined) return null;
  const repo = text(payload, 'repo');
  const branch = text(payload, 'branch');
  const attempt = payload['attempt'];
  return {
    runId,
    workPackageId,
    phase: text(payload, 'phase') ?? '',
    ...(repo !== undefined ? { repo } : {}),
    ...(branch !== undefined ? { branch } : {}),
    ...(isWholeNumber(attempt) && attempt > 0 ? { attempt } : {}),
    queuedAt: event.createdAt,
  };
}

/** Reads an `implementation.reported`; null for any other event, or one without a run, package or status. */
export function readPackageReport(event: AhoyEvent): PackageReportEvent | null {
  if (event.type !== 'implementation.reported') return null;
  const payload = event.payload;
  const runId = text(payload, 'runId');
  const workPackageId = text(payload, 'workPackage');
  const status = text(payload, 'status');
  if (
    runId === undefined ||
    workPackageId === undefined ||
    status === undefined
  )
    return null;
  const rawNotes: unknown = payload['notes'];
  const notes = Array.isArray(rawNotes)
    ? rawNotes.filter(
        (note): note is string => typeof note === 'string' && note.trim() !== ''
      )
    : [];
  const report: unknown = payload['report'];
  const blockerQuestion = isRecord(report)
    ? text(report, 'blocker_question')
    : undefined;
  const kind = isRecord(report) ? report['delivery_kind'] : undefined;
  return {
    runId,
    workPackageId,
    status,
    notes,
    ...(blockerQuestion !== undefined ? { blockerQuestion } : {}),
    ...(kind === 'changed' || kind === 'verified_existing'
      ? { deliveryKind: kind }
      : {}),
    at: event.createdAt,
  };
}

/** Reads a `work_package.decided`; null for any other event, or one without a package, decision or reason. */
export function readPackageDecision(
  event: AhoyEvent
): PackageDecisionEvent | null {
  if (event.type !== 'work_package.decided') return null;
  const payload = event.payload;
  const workPackageId = text(payload, 'workPackage');
  const decision = payload['decision'];
  const reason = text(payload, 'reason');
  if (
    workPackageId === undefined ||
    reason === undefined ||
    (decision !== 'retry' && decision !== 'accept')
  )
    return null;
  return {
    workPackageId,
    decision,
    reason,
    actor: event.actor,
    at: event.createdAt,
  };
}

/** The runs that name a work package, by run id, from their `run.queued` (the first one wins if a run has two). */
export function packageRunsById(
  events: readonly AhoyEvent[]
): ReadonlyMap<string, PackageRun> {
  const out = new Map<string, PackageRun>();
  for (const event of events) {
    const run = readPackageRun(event);
    if (run !== null && !out.has(run.runId)) out.set(run.runId, run);
  }
  return out;
}

/** The reports of implementation runs, by run id (the newest one wins if a run has two). */
export function packageReportsByRun(
  events: readonly AhoyEvent[]
): ReadonlyMap<string, PackageReportEvent> {
  const out = new Map<string, PackageReportEvent>();
  for (const event of events) {
    const report = readPackageReport(event);
    if (report !== null) out.set(report.runId, report);
  }
  return out;
}

/** "WP2 — implementation": the package a run worked on and the phase it ran in; null when its `run.queued` names none. */
export function packageRunLabel(
  runs: ReadonlyMap<string, PackageRun>,
  runId: string
): string | null {
  const run = runs.get(runId);
  if (run === undefined) return null;
  return run.phase !== ''
    ? `${run.workPackageId} — ${run.phase}`
    : run.workPackageId;
}
