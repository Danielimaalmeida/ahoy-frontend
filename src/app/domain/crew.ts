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

/** The last working day of a sprint (its release day), as `YYYY-MM-DD`; its last day when it has no working day. */
export function lastWorkday(startsOn: string, endsOn: string): string {
  const a = dayNumber(startsOn);
  const b = dayNumber(endsOn);
  if (Number.isNaN(a) || Number.isNaN(b)) return endsOn;
  for (let n = b; n >= a; n--)
    if (workday(n)) return new Date(n * DAY_MS).toISOString().slice(0, 10);
  return endsOn;
}

/** "42" for "PROJ Sprint 42": the number Jira ends a sprint's name with, or the whole title when there is none. */
export function sprintShortTitle(sprint: {
  readonly name: string | null;
  readonly startsOn: string;
}): string {
  const number = sprint.name === null ? null : /(\d+)\s*$/.exec(sprint.name);
  return number?.[1] ?? sprintTitle(sprint);
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

/** A sprint's labels: the short one for the Upcoming table ("42") and the title ("PROJ Sprint 42", "Sprint 43"). */
export interface SprintLabels {
  readonly short: string;
  readonly title: string;
}

/**
 * The labels of sprints in order. A projected sprint takes the number after the sprint before it when that one has a
 * number ("43" after "PROJ Sprint 42"); otherwise it is named by its first day.
 */
export function sprintLabels(
  sprints: readonly {
    readonly name: string | null;
    readonly startsOn: string;
  }[]
): SprintLabels[] {
  let last: number | null = null;
  return sprints.map((sprint) => {
    if (sprint.name === null && last !== null) {
      last += 1;
      return { short: String(last), title: `Sprint ${last}` };
    }
    const short = sprintShortTitle(sprint);
    last = /^\d{1,6}$/.test(short) ? Number(short) : null;
    return { short, title: sprintTitle(sprint) };
  });
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

/** The first time off that overlaps the days from `startsOn` to `endsOn`, or null. */
export function timeOffDuring<T extends DaySpan>(
  spans: readonly T[],
  startsOn: string,
  endsOn: string
): T | null {
  return (
    upcomingTimeOff(spans, startsOn).find((s) => s.startsOn <= endsOn) ?? null
  );
}

/** What `crewToTeams` reads of a sprint: its title as the page shows it, its days and who is on for each role. */
export interface TeamsSprint {
  readonly title: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly assignments: readonly {
    readonly role: Role;
    readonly memberName: string;
    readonly dueMemberName: string;
    readonly change: unknown;
    readonly away: boolean;
  }[];
}

/** The crew as a Teams message: HTML, which Teams keeps when pasted (bold names, a list), and the same as plain text. */
export interface TeamsMessage {
  readonly html: string;
  readonly text: string;
}

const ROLE_EMOJI: Readonly<Record<Role, string>> = {
  sprint_person: '🚀',
  lunch_host: '🍕',
};

/** Escapes text for HTML: names are typed by people. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The crew as a Teams message: who is on this sprint, with the release and lunch day (the sprint's last working day),
 * then who is up in the sprints after it. The first sprint is the current one.
 */
export function crewToTeams(sprints: readonly TeamsSprint[]): TeamsMessage {
  const [now, ...next] = sprints;
  if (now === undefined) return { html: '', text: '' };
  const day = dayLabel(lastWorkday(now.startsOn, now.endsOn));
  const heading = `Crew · ${now.title} (${spanLabel(now.startsOn, now.endsOn)})`;
  const onNow = now.assignments.map((a) => ({
    lead: `${ROLE_EMOJI[a.role]} ${ROLE_WORDS[a.role].name}: `,
    name: a.memberName,
    tail: `${a.change !== null ? ` (in for ${a.dueMemberName})` : ''} · ${
      a.role === 'sprint_person' ? 'release' : 'lunch'
    } ${day}`,
  }));
  const upNext = next.map((sprint) => {
    const who = sprint.assignments
      .map(
        (a) =>
          `${ROLE_EMOJI[a.role]} ${a.memberName}${a.away ? ' (away part of it)' : ''}`
      )
      .join(' · ');
    return `${sprint.title} (${spanLabel(sprint.startsOn, sprint.endsOn)}): ${who || 'nobody yet'}`;
  });
  const text = [
    heading,
    ...onNow.map((l) => l.lead + l.name + l.tail),
    ...(upNext.length > 0
      ? ['', 'Up next', ...upNext.map((l) => `• ${l}`)]
      : []),
  ].join('\n');
  const html = [
    `<p><b>${escapeHtml(heading)}</b></p>`,
    `<p>${onNow
      .map(
        (l) =>
          `${escapeHtml(l.lead)}<b>${escapeHtml(l.name)}</b>${escapeHtml(l.tail)}`
      )
      .join('<br>')}</p>`,
    ...(upNext.length > 0
      ? [
          `<p>Up next</p><ul>${upNext.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
        ]
      : []),
  ].join('');
  return { html, text };
}
