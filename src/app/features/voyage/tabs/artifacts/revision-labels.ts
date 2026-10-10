import type { AhoyEvent } from '@core/api/types';

/** One revision of the artifact set, as the two selectors list it. */
export interface RevisionOption {
  readonly revision: number;
  readonly current: boolean;
  /** What made it: the run's id, "send-back", or null when the events do not say. */
  readonly note: string | null;
  /** "Revision 5 · current (r-04)", "Revision 4 (send-back)", "Revision 3 (r-03)" or "Revision 2". */
  readonly label: string;
}

/** A payload field that is a non-blank string. */
function field(event: AhoyEvent, name: string): string | null {
  const value: unknown = event.payload[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The revision number an `artifacts.updated` announces, when its payload says one. */
function revisionOf(event: AhoyEvent): number | null {
  const value: unknown = event.payload['revision'];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

/**
 * What made the revision an `artifacts.updated` announces, read from **the nearest producer before it**, back to the
 * previous update: a `run.finished` gives its run id, a `decision.recorded` with `send_back` gives "send-back", and any
 * other decision (an approval, a rejection) gives no note. What a producer leaves behind on its way to the update (a
 * `gate.evaluated`, a `story.phase_changed`) is stepped over: the API sends the run's gate verdict before its files, so
 * reading only the event just before would never find the run. A `runId` on the update's own payload is not read: the
 * contract does not fix one there.
 */
function noteFor(events: readonly AhoyEvent[], index: number): string | null {
  for (let at = index - 1; at >= 0; at--) {
    const previous = events[at];
    if (previous === undefined || previous.type === 'artifacts.updated')
      return null;
    if (previous.type === 'run.finished') return field(previous, 'runId');
    if (previous.type === 'decision.recorded')
      return field(previous, 'decision') === 'send_back' ? 'send-back' : null;
  }
  return null;
}

/**
 * The revisions `current` down to 1 (newest first), each with its label. The API lists only the current set, so what made
 * an older revision comes from the story's events: every `artifacts.updated {revision}` with the event just before it. A
 * revision with no match is plain "Revision N". `events` are oldest first, without `run.progress`.
 */
export function revisionOptions(
  events: readonly AhoyEvent[],
  current: number
): RevisionOption[] {
  const notes = new Map<number, string | null>();
  events.forEach((event, index) => {
    if (event.type !== 'artifacts.updated') return;
    const revision = revisionOf(event);
    if (revision !== null && !notes.has(revision))
      notes.set(revision, noteFor(events, index));
  });
  const options: RevisionOption[] = [];
  for (let revision = Math.max(0, current); revision >= 1; revision--) {
    const note = notes.get(revision) ?? null;
    const isCurrent = revision === current;
    options.push({
      revision,
      current: isCurrent,
      note,
      label: `Revision ${revision}${isCurrent ? ' · current' : ''}${note !== null ? ` (${note})` : ''}`,
    });
  }
  return options;
}
