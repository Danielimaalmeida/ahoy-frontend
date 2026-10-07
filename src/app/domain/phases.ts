/** The seven delivery phases, in order. `blocked` is a status, not a position (G12). */
export const PHASES = [
  "intake",
  "planning",
  "plan_review",
  "implementation",
  "pr_review",
  "delivery_gate",
  "done",
] as const;

/** A phase whose gate record is missing is named after its phase (G11). */
export const GATE_FOR_PHASE = {
  plan_review: "plan_accepted",
  delivery_gate: "delivery_accepted",
} as const;

/**
 * 1-based position of a phase in `PHASES` ("Phase 3 of 7"), or `null` for `blocked` and unknown phases: a blocked
 * voyage's position comes from the last `story.phase_changed` event instead (G12).
 */
export function phaseIndex(phase: string): number | null {
  const index = PHASES.findIndex((candidate) => candidate === phase);
  return index === -1 ? null : index + 1;
}
