/** Outcome pill modifiers of the design system (`ah-badge--<modifier>`). */
export type OutcomeModifier = "done" | "input" | "sendback" | "halted" | "decision" | "queued" | "running";

/** What an outcome pill shows: the API word itself and the CSS modifier that groups it. */
export interface OutcomePresentation {
  /** The API word (audit records are compared with logs, so it is never translated). */
  readonly label: string;
  readonly modifier: OutcomeModifier;
}

const MODIFIERS: Readonly<Record<string, OutcomeModifier>> = {
  // Human gates and automated checks.
  pass: "done",
  approve: "done",
  branch: "input",
  send_back: "sendback",
  fail: "halted",
  error: "halted",
  reject: "halted",
  halt: "halted",
  // Not an API value: the design system's word for a human gate nobody has decided yet (OutcomePill).
  waiting: "decision",
  // Runs.
  queued: "queued",
  running: "running",
  // The run stopped to ask questions, as a `branch` gate does. The design system does not list it: to be reviewed.
  awaiting_input: "input",
  succeeded: "done",
  failed: "halted",
  lost: "halted",
  cancelled: "queued",
  timed_out: "halted",
  auth_failed: "halted",
  output_violation: "halted",
  budget_exceeded: "halted",
};

/**
 * Maps a gate outcome or a run status to the outcome pill. An unknown word stays neutral (`queued`): a tooling
 * failure never reads like a verdict.
 */
export function outcomePresentation(value: string): OutcomePresentation {
  return { label: value, modifier: MODIFIERS[value] ?? "queued" };
}
