import { formatAiu } from '@domain/aiu';
import { isHaltReason } from '@domain/halt';
import type { HaltReason } from '@domain/types';

/** What the guidance needs to know about the voyage. */
export interface HaltGuidanceContext {
  /** The phase a resume retries. */
  readonly phase: string;
  /** What is left of the budget, in integer nano-AIU. */
  readonly remainingNanoAiu: number;
}

/** "Resuming retries planning and may spend from the remaining 10.2 AIU." */
function retries(context: HaltGuidanceContext): string {
  return `Resuming retries ${context.phase} and may spend from the remaining ${formatAiu(context.remainingNanoAiu)} AIU.`;
}

/** The step the crew takes before resuming, per reason; the sentence about the cost of a resume follows it. */
const STEPS: Readonly<
  Record<HaltReason, (context: HaltGuidanceContext) => string>
> = {
  stopped_by_user: (c) =>
    `read the reason above and settle it with whoever stopped the voyage, then resume. ${retries(c)}`,
  gate_rejected: (c) =>
    `open the run's gate verdict in Gates, fix what it points at (the Jira ticket, the model or the agent config), then resume. ${retries(c)}`,
  budget_exhausted: (c) =>
    `raise the budget, then resume. Raising it doesn't resume the voyage on its own. Resuming retries ${c.phase}.`,
  run_failed: (c) =>
    `pick a model this account can use for ${c.phase}, or fix what the run's log points at, then resume. ${retries(c)}`,
  run_lost: (c) =>
    `check the run in Runs: if it delivered nothing, resume to run ${c.phase} again. ${retries(c)}`,
  run_result_invalid: (c) =>
    `look at the run's output in Runs and Artifacts, change the model if it keeps breaking the rules, then resume. ${retries(c)}`,
  dispatch_failed: (c) =>
    `resume to try starting the run again. If it anchors again, ask whoever runs Ahoy to check the workers. ${retries(c)}`,
  revision_ceiling_reached: (c) =>
    `the plan can't be sent back again. Settle it with the crew (the earlier rounds are in Gates), then resume. ${retries(c)}`,
  reconciler_error: (c) =>
    `this is a fault inside Ahoy, not in the crew's work. Resume to try again; if it anchors again, ask whoever runs Ahoy. ${retries(c)}`,
};

/**
 * The "To continue: …" line of the Halted banner, per halt reason (the nine of `vocabulary.md`). A reason
 * this version does not know gets a generic step that sends the reader to the technical line, never a guess.
 */
export function haltGuidance(
  reason: string,
  context: HaltGuidanceContext
): string {
  if (isHaltReason(reason)) return STEPS[reason](context);
  return `check the technical line below and the Activity, then resume when it's safe. ${retries(context)}`;
}
