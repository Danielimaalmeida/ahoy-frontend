/**
 * The event types this version of the app knows (`EventType` in the contract). The contract says new types may appear in a
 * minor version and that clients must ignore the ones they do not know: the stores react only to these.
 */
export const KNOWN_EVENT_TYPES = [
  'story.started',
  'story.halted',
  'story.resumed',
  'story.budget_changed',
  'story.models_changed',
  'story.phase_changed',
  'story.awaiting_input',
  'story.awaiting_decision',
  'run.queued',
  'run.dispatched',
  'run.finished',
  'gate.evaluated',
  'question.asked',
  'question.answered',
  'decision.recorded',
  'review.resolved',
  'run.waiting',
  'work_package.decided',
  'work.reopened',
  'story.unblocked',
  'artifacts.updated',
  'implementation.reported',
  'review.reported',
  'story.routed',
  'run.progress',
] as const;
export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

const KNOWN: ReadonlySet<string> = new Set(KNOWN_EVENT_TYPES);

/** Whether an event type is one this version knows. */
export function isKnownEventType(type: string): type is KnownEventType {
  return KNOWN.has(type);
}

/** The type of the progress events of a running agent: they never trigger a refetch (plan §5.4). */
export const RUN_PROGRESS = 'run.progress';
