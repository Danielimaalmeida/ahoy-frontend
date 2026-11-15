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

/** Each phase in words, for lists where the API word would be hard to scan ("Delivery gate" for `delivery_gate`). */
export const PHASE_LABELS = {
  intake: 'Intake',
  planning: 'Planning',
  plan_review: 'Plan review',
  design: 'Design',
  implementation: 'Implementation',
  pr_review: 'PR review',
  delivery_gate: 'Delivery gate',
  done: 'Done',
  blocked: 'Blocked',
} as const satisfies Record<(typeof PHASES)[number] | 'blocked', string>;

function isLabelled(phase: string): phase is keyof typeof PHASE_LABELS {
  return Object.hasOwn(PHASE_LABELS, phase);
}

/** A phase in words; a phase this list does not know is shown as the API sent it, never guessed. */
export function phaseLabel(phase: string): string {
  return isLabelled(phase) ? PHASE_LABELS[phase] : phase;
}

/** "Phase 7 of 8" for a delivery phase, or `null` for `blocked` and unknown phases, which have no position. */
export function phasePosition(phase: string): string | null {
  const index = phaseIndex(phase);
  return index === null ? null : `Phase ${index} of ${PHASES.length}`;
}
