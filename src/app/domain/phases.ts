/** The eight delivery phases, in order. `blocked` is a status, not a position (G12). */
export const PHASES = [
  'intake',
  'planning',
  'plan_review',
  'design',
  'implementation',
  'pr_review',
  'delivery_gate',
  'done',
] as const;

/** A phase whose gate record is missing is named after its phase (G11). */
export const GATE_FOR_PHASE = {
  plan_review: 'plan_accepted',
  delivery_gate: 'delivery_accepted',
} as const;

/**
 * 1-based position of a phase in `PHASES` ("Phase 3 of 8"), or `null` for `blocked` and unknown phases: a blocked
 * voyage's position comes from the last `story.phase_changed` event instead (G12).
 */
export function phaseIndex(phase: string): number | null {
  const index = PHASES.findIndex((candidate) => candidate === phase);
  return index === -1 ? null : index + 1;
}

/** Each phase in plain words, for people ("Delivery gate"); the API id stays beside it where the API word matters. */
export const PHASE_LABELS: Readonly<Record<(typeof PHASES)[number], string>> = {
  intake: 'Intake',
  planning: 'Planning',
  plan_review: 'Plan review',
  design: 'Design',
  implementation: 'Implementation',
  pr_review: 'PR review',
  delivery_gate: 'Delivery gate',
  done: 'Done',
};

/** A phase in plain words, or the API id itself for a phase this app does not know. */
export function phaseLabel(phase: string): string {
  const labels: Readonly<Record<string, string>> = PHASE_LABELS;
  return Object.hasOwn(labels, phase) ? (labels[phase] ?? phase) : phase;
}
