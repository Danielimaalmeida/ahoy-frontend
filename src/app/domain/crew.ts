/**
 * The crew page (who is the sprint person and who hosts the sprint's lunch and retro): the words for each role, a
 * sprint's days, how far into it the team is and a member's time off. Pure: no Angular, no clock (today comes in as a
 * parameter). Days are `YYYY-MM-DD` and read as calendar days, never shifted by the browser's time zone.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The two roles, as the API names them. */
export type Role = 'sprint_person' | 'lunch_host';

/** What the page says about a role: its name, who takes it, what it means and the question its change dialog asks. */
export interface RoleWords {
  readonly name: string;
  readonly who: string;
  readonly duty: string;
  readonly question: string;
}

/** The words for each role. */
export const ROLE_WORDS: Readonly<Record<Role, RoleWords>> = {
  sprint_person: {
    name: 'Sprint person',
    who: 'Devs',
    duty: 'Runs the sprint’s release.',
    question: 'Who is the sprint person?',
  },
  lunch_host: {
    name: 'Lunch & retro host',
    who: 'Everyone',
    duty: 'Picks the restaurant and moderates the retro.',
    question: 'Who hosts lunch and the retro?',
  },
};

/** The days of a time off, both included. */
export interface DaySpan {
  readonly startsOn: string;
  readonly endsOn: string;
}

/** The UTC day number of a `YYYY-MM-DD` day, or NaN when it is not one. */
function dayNumber(day: string): number {
  const m = DAY.exec(day);
  if (m === null) return Number.NaN;
  const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(time).toISOString().slice(0, 10) === day
    ? time / DAY_MS
    : Number.NaN;
}

/** Whether `value` is a real `YYYY-MM-DD` day. */
export function isDay(value: string): boolean {
  return !Number.isNaN(dayNumber(value));
}

/** "Mon 19 Oct"; "—" for a day it cannot read. */
export function dayLabel(day: string): string {
  const n = dayNumber(day);
  if (Number.isNaN(n)) return '—';
  const date = new Date(n * DAY_MS);
  return `${WEEKDAYS[date.getUTCDay()] ?? ''} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''}`;
}

/** "19 – 30 Oct", "30 Nov – 11 Dec", or one day ("16 Nov"); "—" for days it cannot read. */
export function spanLabel(startsOn: string, endsOn: string): string {
  const a = dayNumber(startsOn);
  const b = dayNumber(endsOn);
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const start = new Date(a * DAY_MS);
  const end = new Date(b * DAY_MS);
  const month = (d: Date) => MONTHS[d.getUTCMonth()] ?? '';
  if (a === b) return `${end.getUTCDate()} ${month(end)}`;
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  return sameMonth
    ? `${start.getUTCDate()} – ${end.getUTCDate()} ${month(end)}`
    : `${start.getUTCDate()} ${month(start)} – ${end.getUTCDate()} ${month(end)}`;
}

/** Whether a day is Monday to Friday. */
function workday(n: number): boolean {
  const weekday = new Date(n * DAY_MS).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/**
 * How far into a sprint `today` is, in working days ("day 7 of 10"); null when today is outside the sprint or the days
 * cannot be read. A weekend day counts as the working day before it.
 */
export function sprintProgress(
  startsOn: string,
  endsOn: string,
  today: string
): { readonly day: number; readonly of: number } | null {
  const a = dayNumber(startsOn);
  const b = dayNumber(endsOn);
  const t = dayNumber(today);
  if ([a, b, t].some(Number.isNaN) || t < a || t > b) return null;
  let day = 0;
  let of = 0;
  for (let n = a; n <= b; n++) {
    if (!workday(n)) continue;
    of++;
    if (n <= t) day++;
  }
  return of === 0 ? null : { day: Math.max(day, 1), of };
}

/** "Sprint 42", or for a sprint Jira does not have yet, "Sprint of 30 Nov". */
export function sprintTitle(sprint: {
  readonly name: string | null;
  readonly startsOn: string;
}): string {
  return (
    sprint.name ?? `Sprint of ${spanLabel(sprint.startsOn, sprint.startsOn)}`
  );
}

/** The letter in a member's avatar. */
export function initial(name: string): string {
  return (name.trim().charAt(0) || '?').toLocaleUpperCase('en');
}

/** "Away 9 – 20 Nov" or "Away 16 Nov". */
export function awayLabel(span: DaySpan): string {
  return `Away ${spanLabel(span.startsOn, span.endsOn)}`;
}

/** The time off that has not ended by `today`, earliest first. */
export function upcomingTimeOff<T extends DaySpan>(
  spans: readonly T[],
  today: string
): T[] {
  return spans
    .filter((s) => s.endsOn >= today)
    .sort((x, y) =>
      x.startsOn < y.startsOn ? -1 : x.startsOn > y.startsOn ? 1 : 0
    );
}

/** Why a time off cannot be saved, or null: real days, the end not before the start, at most a year. */
export function timeOffRefusal(
  startsOn: string,
  endsOn: string
): string | null {
  const a = dayNumber(startsOn);
  const b = dayNumber(endsOn);
  if (Number.isNaN(a) || Number.isNaN(b))
    return 'Pick the first and the last day.';
  if (b < a) return 'The last day is before the first.';
  if (b - a > 366) return 'A time off is at most a year.';
  return null;
}

/** A member's name, trimmed with its spaces collapsed; empty when there is none. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
