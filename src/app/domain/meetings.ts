/**
 * Meetings with stakeholders (the Meetings page): grouping meetings into now, next and past, the words for who raised a
 * topic and where it came from, and which topics to suggest carrying over when a meeting ends. Pure: no Angular, no
 * clock (times come in as parameters).
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

/** What the grouping reads of a meeting. */
export interface MeetingLike {
  readonly id: string;
  readonly status: 'planned' | 'in_progress' | 'ended';
  readonly startsAt: string;
}

/** What the topic helpers read of a topic. */
export interface TopicLike {
  readonly id: string;
  readonly status: 'open' | 'moved';
  readonly raisedBy: 'us' | 'them';
  readonly raisedByEmail: string | null;
  readonly origin: 'planned' | 'in_meeting';
  readonly createdAt: string;
  readonly notes: readonly unknown[];
}

/** The meetings of the left column: the ones running now, the planned ones soonest first, the ended ones latest first. */
export interface MeetingGroups<T extends MeetingLike> {
  readonly now: readonly T[];
  readonly next: readonly T[];
  readonly past: readonly T[];
}

const startOf = (m: MeetingLike): number => {
  const ms = Date.parse(m.startsAt);
  return Number.isNaN(ms) ? 0 : ms;
};

/** Splits meetings into now, next and past, each in the order the page lists them. */
export function groupMeetings<T extends MeetingLike>(
  meetings: readonly T[]
): MeetingGroups<T> {
  const byStart = (a: T, b: T) =>
    startOf(a) - startOf(b) || (a.id < b.id ? -1 : 1);
  return {
    now: meetings.filter((m) => m.status === 'in_progress').sort(byStart),
    next: meetings.filter((m) => m.status === 'planned').sort(byStart),
    past: meetings
      .filter((m) => m.status === 'ended')
      .sort((a, b) => byStart(b, a)),
  };
}

/**
 * The meeting to open when the page has none in its URL: the one running now, else the next planned one, else the
 * latest that ended; null when there is no meeting at all.
 */
export function defaultMeeting<T extends MeetingLike>(
  meetings: readonly T[]
): T | null {
  const groups = groupMeetings(meetings);
  return groups.now[0] ?? groups.next[0] ?? groups.past[0] ?? null;
}

/** The part of an e-mail before the `@`, with the `@` ("maria@"), so a tag stays short; the text itself otherwise. */
export function shortEmail(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at + 1) : email;
}

/** Who raised a topic, for its tag: "Us", "Them" or "Them · maria@". */
export function raisedByLabel(topic: TopicLike): string {
  if (topic.raisedBy === 'us') return 'Us';
  return topic.raisedByEmail === null
    ? 'Them'
    : `Them · ${shortEmail(topic.raisedByEmail)}`;
}

/** A day as the page writes it: "Tue 13 Oct", in the browser's time zone; "—" for a date it cannot read. */
export function meetingDay(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  return `${WEEKDAYS[date.getDay()] ?? ''} ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
}

/** A time of day: "09:30", in the browser's time zone; "—" for a date it cannot read. */
export function meetingTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** When a topic came up: "planned" before the meeting, "raised at 10:24" during it. */
export function topicWhen(topic: TopicLike): string {
  return topic.origin === 'planned'
    ? 'planned'
    : `raised at ${meetingTime(topic.createdAt)}`;
}

/**
 * The open topics to tick by default when a meeting ends: those with no notes, which most likely were not reached.
 * A person changes the choice before ending; moved topics are never offered.
 */
export function suggestedCarryOver(topics: readonly TopicLike[]): string[] {
  return topics
    .filter((t) => t.status === 'open' && t.notes.length === 0)
    .map((t) => t.id);
}

/** The open topics a person may carry over when the meeting ends, in their order. */
export function carryOverCandidates<T extends TopicLike>(
  topics: readonly T[]
): T[] {
  return topics.filter((t) => t.status === 'open');
}

/** The order of a meeting's topics with one moved `by` places (-1 up, +1 down); the same order when it cannot move. */
export function moveInOrder(
  ids: readonly string[],
  id: string,
  by: -1 | 1
): string[] {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** The e-mails in a typed list, split on commas, semicolons and spaces, in order, each once. */
export function parseEmails(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (email !== '') seen.add(email);
  }
  return [...seen];
}

/** A date as an `<input type="date">` takes it ("2026-10-22"), in the browser's time zone. */
export function dateInputValue(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * The instant a meeting starts, from a date ("2026-10-22") and a time ("09:30") in the browser's time zone, as an ISO
 * timestamp; null when either cannot be read.
 */
export function startsAtFrom(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const at = new Date(`${date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
