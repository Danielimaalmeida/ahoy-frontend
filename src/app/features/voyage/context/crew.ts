import type { ModelPlan, Run, RunStatus, SlotModel } from '@core/api/types';
import { crewLabel } from '@domain/models';

/** The slots of the model plan that run in `phase` (none for a phase without an agent). */
export function slotsForPhase(
  plan: ModelPlan | null,
  phase: string
): readonly SlotModel[] {
  return plan?.slots.filter((slot) => slot.phase === phase) ?? [];
}

/** What a slot's next run gets, as the Models table words it: "claude-sonnet-5 · high", "gpt-5.6-terra · default". */
export function modelLabel(slot: SlotModel): string {
  return `${slot.model ?? "the agent's own model"} · ${slot.reasoningEffort ?? 'default'}`;
}

/** The crew member of a run (G14): by the run's phase, else the API's free-text agent. */
export function runCrew(run: Run): string {
  return crewLabel(run.phase === 'pr_review' ? 'review' : run.phase, run.agent);
}

/** The run the voyage started last, by `createdAt`; null without runs. */
export function lastRun(runs: readonly Run[]): Run | null {
  let latest: Run | null = null;
  for (const run of runs)
    if (latest === null || run.createdAt > latest.createdAt) latest = run;
  return latest;
}

/** The run with id `runId` in the list, if it is there (the list may not be read yet). */
export function runById(
  runs: readonly Run[],
  runId: string | null
): Run | undefined {
  return runId === null ? undefined : runs.find((run) => run.id === runId);
}

/** Run statuses that end a run without a result the voyage can use: the header says so after the run id. */
const UNSUCCESSFUL = new Set<RunStatus>([
  'failed',
  'budget_exceeded',
  'timed_out',
  'cancelled',
  'output_violation',
  'auth_failed',
  'lost',
]);

/** What the header's "Current run" says beside the run link. */
export interface CurrentRunView {
  /** "none · last" when no run is active; "" when one is. */
  readonly prefix: string;
  readonly runId: string | null;
  /** " · Cartographer" for the active run, " (failed)" for a last run that ended badly, else "". */
  readonly suffix: string;
}

/**
 * The header's "Current run": the active run and its crew member ("r-02 · Cartographer"), else the last run, marked
 * when it ended badly ("none · last r-03 (failed)"), else "none".
 */
export function currentRunView(
  currentRunId: string | null,
  runs: readonly Run[]
): CurrentRunView {
  if (currentRunId !== null) {
    const run = runById(runs, currentRunId);
    return {
      prefix: '',
      runId: currentRunId,
      suffix: run === undefined ? '' : ` · ${runCrew(run)}`,
    };
  }
  const last = lastRun(runs);
  if (last === null) return { prefix: 'none', runId: null, suffix: '' };
  return {
    prefix: 'none · last',
    runId: last.id,
    suffix: UNSUCCESSFUL.has(last.status) ? ` (${last.status})` : '',
  };
}
