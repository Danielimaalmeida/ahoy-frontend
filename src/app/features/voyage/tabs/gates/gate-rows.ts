import type { GateRecord, GateSource, Story } from '@core/api/types';

/** The words of the Source column. */
export const SOURCE_LABELS: Readonly<Record<GateSource, string>> = {
  gate: 'Automated',
  human: 'Human',
};

/** The Source column's word for a record; an unknown source (a newer API) shows as it came. */
export function sourceLabel(source: string): string {
  return Object.hasOwn(SOURCE_LABELS, source)
    ? (SOURCE_LABELS[source as GateSource] ?? source)
    : source;
}

/**
 * The gate records, oldest first. The API already lists them so; this sorts by time anyway (the sort is stable, so the
 * API's order stands for records made in the same instant) and never changes the list it is given.
 */
export function oldestFirst(
  records: readonly GateRecord[]
): readonly GateRecord[] {
  return [...records].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || 0
  );
}

/** The last line of the table: a human gate nobody has decided yet. */
export interface WaitingRow {
  /** The voyage's phase, such as `plan_review`. */
  readonly phase: string;
  /** The human gate's key, such as `plan_accepted`. */
  readonly gate: string;
  /** "Round 2 of 4 is open." — as much of it as the state gives. */
  readonly message: string;
}

/**
 * The "waiting" line, only while the voyage is `awaiting_decision` and the open gate is known. `round` and `ceiling`
 * come from the state document and may be null while it is not read: the message then says less, never a guessed number.
 */
export function waitingRow(
  story: Pick<Story, 'status' | 'phase'> | null,
  gate: string | null,
  round: number | null,
  ceiling: number | null
): WaitingRow | null {
  if (story === null || story.status !== 'awaiting_decision' || gate === null)
    return null;
  let message = 'Waiting for a human decision.';
  if (round !== null)
    message =
      ceiling === null
        ? `Round ${round} is open.`
        : `Round ${round} of ${ceiling} is open.`;
  return { phase: story.phase, gate, message };
}
