import type { EffortSource, ModelSlot, ModelSource } from './types';

/** The model slots, in the order the Models table shows them (Set sail and Models). */
export const MODEL_SLOTS = [
  'intake',
  'planning',
  'implementation',
  'review',
] as const;

/** Crew member that owns each slot, in the crew's words (G14). */
export const CREW: Readonly<Record<ModelSlot, string>> = {
  intake: 'Navigator',
  planning: 'Cartographer',
  implementation: 'Implementer',
  review: 'Lookout',
};

/** Where the model comes from, in the crew's words (`vocabulary.md`). */
export const MODEL_SOURCE_LABELS: Readonly<Record<ModelSource, string>> = {
  revision: 'This revision only',
  story: 'Chosen for this voyage',
  configuration: 'Server default',
  phase_table: 'Agent config',
  agent_profile: "Agent's own",
};

/** Where the reasoning effort comes from, in the crew's words (`vocabulary.md`). An effort has no `agent_profile`. */
export const EFFORT_SOURCE_LABELS: Readonly<Record<EffortSource, string>> = {
  revision: MODEL_SOURCE_LABELS.revision,
  story: MODEL_SOURCE_LABELS.story,
  configuration: MODEL_SOURCE_LABELS.configuration,
  phase_table: MODEL_SOURCE_LABELS.phase_table,
  model_default: "Model's own",
};

/** True when the API value names one of the four model slots. */
export function isModelSlot(value: string): value is ModelSlot {
  return MODEL_SLOTS.some((slot) => slot === value);
}

/**
 * The crew name for a slot, falling back to the free-text agent the API sent (G14) and, when that is empty, to the
 * slot name itself.
 */
export function crewLabel(slotOrPhase: string, apiAgent?: string): string {
  if (isModelSlot(slotOrPhase)) return CREW[slotOrPhase];
  const agent = apiAgent?.trim() ?? '';
  return agent.length > 0 ? agent : slotOrPhase;
}
