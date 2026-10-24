/**
 * Meetings with stakeholders (the Meetings page): grouping meetings into now, next and past, the words for who raised a
 * topic and where it came from, which topics to suggest carrying over when a meeting ends, and what each note is (a
 * decision, an action with an owner and a due day, a question). Pure: no Angular, no clock (times come in as
 * parameters).
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

/**
 * Who wrote or edited something, for a byline: the person's name, or the shortened actor (`createdBy`, the q-number)
 * while the name is not known yet (`null`).
 */
export function authorLabel(actor: string, name: string | null): string {
  return name !== null && name.trim() !== '' ? name.trim() : shortEmail(actor);
}

/**
 * The names the page shows for the two sides of a meeting. The API keeps `us` and `them`; the page never shows those
 * words: our side is OTHER_COMPANY, the stakeholders' side is ACME.
 */
export const RAISED_BY_LABELS = { us: 'OTHER_COMPANY', them: 'ACME' } as const;

/** Who raised a topic, for its tag: "OTHER_COMPANY", "ACME" or "ACME · maria@". */
export function raisedByLabel(topic: TopicLike): string {
  if (topic.raisedBy === 'us') return RAISED_BY_LABELS.us;
  return topic.raisedByEmail === null
    ? RAISED_BY_LABELS.them
    : `${RAISED_BY_LABELS.them} · ${shortEmail(topic.raisedByEmail)}`;
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

/** What a note is (`MeetingNoteKind`): what was said, what was agreed, something to do next, or what is still open. */
export type NoteKind = 'note' | 'decision' | 'action' | 'question';

/** The word for each kind of note, as its tag and the composer's choice show it. */
export const NOTE_KIND_LABELS: Readonly<Record<NoteKind, string>> = {
  note: 'Note',
  decision: 'Decision',
  action: 'Action',
  question: 'Question',
};

/** A note's kind and, for an action, its owner and due day (`YYYY-MM-DD`). */
export interface NoteKindFields {
  readonly kind: NoteKind;
  readonly owner: string | null;
  readonly dueOn: string | null;
}

/** A change to a note's kind and action fields: absent keeps the current value, null clears it. */
export interface NoteKindChange {
  readonly kind?: NoteKind;
  readonly owner?: string | null;
  readonly dueOn?: string | null;
}

/**
 * A note's kind and action fields after `change`, or the reason it is refused, as the API decides it: only an action
 * has an owner or a due day, so naming either for another kind is refused, and a note that stops being an action loses
 * them. An owner is trimmed; a blank one is none.
 */
export function noteKindFields(
  current: NoteKindFields,
  change: NoteKindChange
): NoteKindFields | string {
  const kind = change.kind ?? current.kind;
  const owner =
    change.owner === undefined ? undefined : change.owner?.trim() || null;
  if (kind !== 'action') {
    if (owner || change.dueOn)
      return 'owner and dueOn are only for a note of kind action';
    return { kind, owner: null, dueOn: null };
  }
  const wasAction = current.kind === 'action';
  return {
    kind,
    owner: owner !== undefined ? owner : wasAction ? current.owner : null,
    dueOn:
      change.dueOn !== undefined
        ? change.dueOn
        : wasAction
          ? current.dueOn
          : null,
  };
}

/** How often an open meeting in progress is read again, so notes others take show up without a refresh. */
export const LIVE_POLL_MS = 5000;

const SHORTCUTS: Readonly<Record<string, NoteKind>> = {
  n: 'note',
  d: 'decision',
  a: 'action',
  q: 'question',
};

/**
 * A typed note that starts with a shortcut (`/d`, `/a`, `/q`, `/n`, then a space) as its kind and the rest of the text;
 * null when it does not start with one, so the kind chosen on screen stands.
 */
export function noteShortcut(
  typed: string
): { readonly kind: NoteKind; readonly text: string } | null {
  const [, letter, rest] =
    /^\/([ndaq])\s+([\s\S]*)$/i.exec(typed.trimStart()) ?? [];
  const kind =
    letter === undefined ? undefined : SHORTCUTS[letter.toLowerCase()];
  return kind === undefined || rest === undefined
    ? null
    : { kind, text: rest.trim() };
}

/**
 * When an action is due, from the day it is due and today (both `YYYY-MM-DD`, in the browser's time zone): "due Fri
 * 30 Oct", "due today" or "overdue since Fri 30 Oct"; null for no due day.
 */
export function dueLabel(
  dueOn: string | null,
  today: string
): { readonly text: string; readonly overdue: boolean } | null {
  if (dueOn === null) return null;
  const day = meetingDay(`${dueOn}T12:00:00`);
  if (dueOn === today) return { text: 'due today', overdue: false };
  return dueOn < today
    ? { text: `overdue since ${day}`, overdue: true }
    : { text: `due ${day}`, overdue: false };
}

/** What the Confluence export reads of a note; a note without a kind is a plain note. */
export interface NoteDoc {
  readonly text: string;
  readonly kind?: NoteKind;
  readonly owner?: string | null;
  readonly dueOn?: string | null;
  readonly doneAt?: string | null;
  readonly createdBy: string;
  readonly createdByName: string | null;
  readonly createdAt: string;
}

/** What the Confluence export reads of a topic. */
export interface TopicDoc extends TopicLike {
  readonly title: string;
  readonly notes: readonly NoteDoc[];
  readonly movedTo: { readonly meetingStartsAt: string } | null;
}

/** What the Confluence export reads of a meeting. */
export interface MeetingDoc extends MeetingLike {
  readonly title: string;
  readonly seriesName: string | null;
  readonly endsAt: string | null;
  readonly stakeholders: readonly string[];
  readonly topics: readonly TopicDoc[];
}

const STATUS_NAMES = {
  planned: 'Planned',
  in_progress: 'In progress',
  ended: 'Ended',
} as const;

/** Escapes what Confluence wiki markup would read as formatting; line breaks become `\\`. */
function wiki(text: string): string {
  return text
    .trim()
    .replace(/[{}[\]|*_^~!+?#-]/g, (c) => `\\${c}`)
    .replace(/\s*\r?\n\s*/g, ' \\\\ ');
}

/**
 * A meeting as Confluence wiki markup (Insert → Markup → Confluence Wiki in the editor): its title, when, who, and
 * each topic with who raised it, where it went and its notes. Text from people is escaped, so it never formats.
 */
export function meetingToConfluence(meeting: MeetingDoc): string {
  const end = meeting.endsAt === null ? '' : `–${meetingTime(meeting.endsAt)}`;
  const lines = [
    `h1. ${wiki(meeting.title)}`,
    `*When:* ${meetingDay(meeting.startsAt)} · ${meetingTime(meeting.startsAt)}${end}`,
    `*Status:* ${STATUS_NAMES[meeting.status]}`,
  ];
  if (meeting.seriesName !== null)
    lines.push(`*Series:* ${wiki(meeting.seriesName)}`);
  if (meeting.stakeholders.length > 0)
    lines.push(`*With:* ${meeting.stakeholders.map(wiki).join(', ')}`);
  const { decisions, actions } = decisionsAndActions(meeting);
  if (decisions.length > 0)
    lines.push(
      '',
      'h2. Decisions',
      ...decisions.map((n) => `* ${wiki(n.text)}`)
    );
  if (actions.length > 0)
    lines.push(
      '',
      'h2. Actions',
      ...actions.map((n) => `* ${wiki(n.text)}${actionSuffix(n)}`)
    );
  lines.push('', 'h2. Topics');
  if (meeting.topics.length === 0) lines.push('_No topics._');
  meeting.topics.forEach((topic, index) => {
    const moved =
      topic.movedTo === null
        ? ''
        : ` · moved to ${meetingDay(topic.movedTo.meetingStartsAt)}`;
    lines.push(
      '',
      `h3. ${index + 1}. ${wiki(topic.title)}`,
      `_${wiki(raisedByLabel(topic))} · ${topicWhen(topic)}${moved}_`
    );
    for (const note of topic.notes)
      lines.push(
        `* ${notePrefix(note)}${wiki(note.text)}${actionSuffix(note)} _(${wiki(authorLabel(note.createdBy, note.createdByName))}, ${meetingTime(note.createdAt)})_`
      );
  });
  return `${lines.join('\n')}\n`;
}

/** "*Decision:* " before a decision, action or question; nothing before a plain note. */
function notePrefix(note: NoteDoc): string {
  const kind = note.kind ?? 'note';
  return kind === 'note' ? '' : `*${NOTE_KIND_LABELS[kind]}:* `;
}

/** " — Ana, due Fri 30 Oct, done" after an action: whatever of its owner, due day and done mark it has. */
function actionSuffix(note: NoteDoc): string {
  if (note.kind !== 'action') return '';
  const parts = [
    ...(note.owner ? [wiki(note.owner)] : []),
    ...(note.dueOn ? [`due ${meetingDay(`${note.dueOn}T12:00:00`)}`] : []),
    ...(note.doneAt ? ['done'] : []),
  ];
  return parts.length === 0 ? '' : ` — ${parts.join(', ')}`;
}

/**
 * The decisions and the actions of a meeting, in topic order, for the summary above its topics: what a person who
 * missed the meeting reads first.
 */
export function decisionsAndActions<N extends NoteDoc>(meeting: {
  readonly topics: readonly { readonly notes: readonly N[] }[];
}): { readonly decisions: N[]; readonly actions: N[] } {
  const notes = meeting.topics.flatMap((t) => t.notes);
  return {
    decisions: notes.filter((n) => n.kind === 'decision'),
    actions: notes.filter((n) => n.kind === 'action'),
  };
}
