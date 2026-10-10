const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Milliseconds from `at` to `now`, clamped at zero; `null` when a date is invalid. */
function elapsedMs(at: Date | string, now: Date): number | null {
  const from = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const to = now.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, to - from);
}

/** Hours and minutes of a duration in milliseconds. */
function hoursAndMinutes(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / HOUR_MS);
  return { hours, minutes: Math.floor((ms % HOUR_MS) / MINUTE_MS) };
}

/** Relative time for lists: "just now", "22 m ago", "2 h 10 m ago", "3 d ago". */
export function relativeTime(at: Date | string, now: Date): string {
  const ms = elapsedMs(at, now);
  if (ms === null) return '—';
  if (ms < MINUTE_MS) return 'just now';
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} m ago`;
  if (ms < DAY_MS) {
    const { hours, minutes } = hoursAndMinutes(ms);
    return minutes > 0 ? `${hours} h ${minutes} m ago` : `${hours} h ago`;
  }
  return `${Math.floor(ms / DAY_MS)} d ago`;
}

/** Absolute time for logs: "Tue 09:48", in the browser's time zone. */
export function absoluteTime(at: Date | string): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  const day = WEEKDAYS[date.getDay()] ?? '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${hours}:${minutes}`;
}

/** How long a voyage has waited, for the "Waiting" column: "just now", "48 m", "2 h 10 m", "9 d". */
export function waitingTime(at: Date | string, now: Date): string {
  const ms = elapsedMs(at, now);
  if (ms === null) return '—';
  if (ms < MINUTE_MS) return 'just now';
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} m`;
  if (ms < DAY_MS) {
    const { hours, minutes } = hoursAndMinutes(ms);
    return minutes > 0 ? `${hours} h ${minutes} m` : `${hours} h`;
  }
  return `${Math.floor(ms / DAY_MS)} d`;
}

/** Duration between two instants, for run detail: "16 m 12 s", "1 h 04 m". */
export function formatDuration(from: Date | string, to: Date | string): string {
  const start =
    from instanceof Date ? from.getTime() : new Date(from).getTime();
  const end = to instanceof Date ? to.getTime() : new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const ms = Math.max(0, end - start);
  if (ms < MINUTE_MS) return `${Math.floor(ms / 1000)} s`;
  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);
    const seconds = Math.floor((ms % MINUTE_MS) / 1000);
    return seconds > 0 ? `${minutes} m ${seconds} s` : `${minutes} m`;
  }
  const { hours, minutes } = hoursAndMinutes(ms);
  return minutes > 0 ? `${hours} h ${minutes} m` : `${hours} h`;
}
