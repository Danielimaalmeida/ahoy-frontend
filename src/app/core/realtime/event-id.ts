/** The shape of an event id: a decimal string (`EventId` in the contract), at most 20 digits. */
const EVENT_ID = /^[0-9]{1,20}$/;

/** Whether a value is a well-formed event id, safe to send back as `Last-Event-ID` or `after`. */
export function isEventId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_ID.test(value);
}

/**
 * Orders two event ids as numbers, without converting them: ids may be beyond `Number.MAX_SAFE_INTEGER`. Negative when
 * `a` comes first, positive when `b` does, 0 when they are the same id. Both must pass {@link isEventId}.
 */
export function compareEventIds(a: string, b: string): number {
  const x = a.replace(/^0+(?=.)/, '');
  const y = b.replace(/^0+(?=.)/, '');
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The later of two ids; null counts as "before everything". */
export function laterEventId(
  a: string | null,
  b: string | null
): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareEventIds(a, b) >= 0 ? a : b;
}
