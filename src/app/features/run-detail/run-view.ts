import type { RunProgressSpend } from '@core/api/run-progress';
import type { AhoyEvent, GateRecord, Run } from '@core/api/types';
import type { ProgressEntry } from '@core/stores/run-progress-buffer';
import { budgetPercent, formatAiu } from '@domain/aiu';
import { formatTokens } from '@domain/identifiers';
import { EFFORT_SOURCE_LABELS } from '@domain/models';
import { absoluteTime, formatDuration } from '@domain/time';
import { formatCap } from '@ui/budget-meter/budget-meter';
import type { LiveStep } from '@ui/live-steps/live-steps';

/** A run that has not ended: queued, or running. Everything else is a final status. */
export function isRunActive(run: Run): boolean {
  return run.status === 'queued' || run.status === 'running';
}

/** The runs oldest first (by `createdAt`, then by id), the order of the pager and of the Runs table. */
export function oldestFirst(runs: readonly Run[]): Run[] {
  return [...runs].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

/** The runs on either side of `runId`, oldest first; null at the ends, and for a run the list does not hold yet. */
export function neighbours(
  runs: readonly Run[],
  runId: string
): { prev: Run | null; next: Run | null } {
  const ordered = oldestFirst(runs);
  const index = ordered.findIndex((run) => run.id === runId);
  if (index === -1) return { prev: null, next: null };
  return { prev: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null };
}

/**
 * The gates whose send-backs revise the work of a phase: a plan sent back at `plan_review` returns to `planning`, a
 * review or delivery send-back returns to `implementation`.
 */
const REVISED_AFTER: Readonly<Record<string, readonly string[]>> = {
  planning: ['plan_review'],
  implementation: ['pr_review', 'delivery_gate'],
};

/**
 * "Revision round 2" for a run, counted from the gate records: one more than the human send-backs recorded before the
 * run was queued, in the phase that sends work back to this run's phase. Null for the first round and for phases that
 * are not revised, since the records cannot tell the round then.
 */
export function revisionRound(
  run: Run,
  gates: readonly GateRecord[]
): number | null {
  const sources = REVISED_AFTER[run.phase];
  if (sources === undefined) return null;
  const sentBack = gates.filter(
    (record) =>
      record.source === 'human' &&
      record.outcome === 'send_back' &&
      sources.includes(record.phase) &&
      record.createdAt <= run.createdAt
  ).length;
  return sentBack === 0 ? null : sentBack + 1;
}

/** Where the reasoning effort of a run came from ("Chosen for this voyage"), from its `run.queued` event; null if unknown. */
export function effortSourceLabel(
  events: readonly AhoyEvent[],
  runId: string
): string | null {
  for (const event of events) {
    if (event.type !== 'run.queued') continue;
    const payload: Readonly<Record<string, unknown>> = event.payload;
    if (payload['runId'] !== runId) continue;
    const source = payload['effortSource'];
    if (
      typeof source === 'string' &&
      Object.hasOwn(EFFORT_SOURCE_LABELS, source)
    ) {
      return EFFORT_SOURCE_LABELS[source as keyof typeof EFFORT_SOURCE_LABELS];
    }
    return null;
  }
  return null;
}

/** "Tue 09:30:58", in the browser's time zone; "—" without a moment. */
export function momentLabel(at: string | null): string {
  if (at === null) return '—';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  return `${absoluteTime(date)}:${String(date.getSeconds()).padStart(2, '0')}`;
}

/** The four tiles of run detail, as text. */
export interface RunTiles {
  readonly spent: string;
  readonly cap: string;
  readonly percent: number;
  readonly requests: number;
  readonly tokens: string;
  readonly tokensDetail: string;
  readonly duration: string;
  readonly range: string;
}

/** "09:47", from a moment; "" when invalid. */
function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The tiles of a run. While it is active the spend and the requests are the latest `spend`'s (never below the run's
 * `usage`) and the duration runs up to `now`; once it ended they are what the API charged, and the duration is
 * `startedAt` to `endedAt`. AIU is shown with two decimals.
 */
export function runTiles(
  run: Run,
  spend: RunProgressSpend | null,
  now: Date
): RunTiles {
  const live = isRunActive(run) && spend !== null;
  const nanoAiu = live
    ? Math.max(spend.nanoAiu, run.usage.nanoAiu)
    : run.usage.nanoAiu;
  const requests = live
    ? Math.max(spend.requests, run.usage.requests)
    : run.usage.requests;
  const started = run.startedAt === null ? null : new Date(run.startedAt);
  const valid = started !== null && !Number.isNaN(started.getTime());
  let duration = '—';
  let range = 'Not started yet';
  if (valid) {
    const ended = run.endedAt === null ? null : new Date(run.endedAt);
    duration = formatDuration(started, ended ?? now);
    range = `${absoluteTime(started)} → ${ended === null ? 'now' : clockTime(ended)}`;
  }
  return {
    spent: formatAiu(nanoAiu, 2),
    cap: formatCap(run.budgetNanoAiu, 2),
    percent: budgetPercent(run.budgetNanoAiu, nanoAiu),
    requests,
    tokens: formatTokens(run.usage.inputTokens + run.usage.outputTokens),
    tokensDetail: `${formatTokens(run.usage.inputTokens)} in · ${formatTokens(run.usage.outputTokens)} out`,
    duration,
    range,
  };
}

/** Turns the buffer's rows into the rows `ah-live-steps` shows, keeping each step's time and each gap's count. */
export function toLiveSteps(entries: readonly ProgressEntry[]): LiveStep[] {
  return entries.map((entry): LiveStep => {
    if (entry.kind === 'gap') return { kind: 'gap', count: entry.count };
    const { step, at } = entry;
    if (step.kind === 'message')
      return { kind: 'message', at, text: step.text };
    return {
      kind: 'tool',
      at,
      tool: step.tool,
      ...(step.summary !== undefined ? { summary: step.summary } : {}),
    };
  });
}
