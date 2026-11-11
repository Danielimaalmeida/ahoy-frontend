/**
 * Pure rules for user stories drafted from meeting topics (slices 2 and 3): which draft a topic shows, how a draft is
 * described, the Jira target of a series, and the answers to a grill's questions. No Angular, no clock: time comes in
 * as a parameter.
 */

/** The most AIU one story draft may be capped at (50 AIU, in nano-AIU), as the API's `budgetNanoAiu` maximum. */
export const STORY_DRAFT_MAX_NANO_AIU = 50_000_000_000;

/** How often the page reads a draft again while the agent is writing it, in milliseconds. */
export const DRAFT_POLL_MS = 3000;

/** A Jira project key as the API takes it (`JiraProjectKey`): a capital letter, then capitals, digits or `_`. */
const PROJECT_KEY = /^[A-Z][A-Z0-9_]+$/;

/** The longest project key the API takes. */
export const PROJECT_KEY_MAX = 50;

/**
 * Where a draft stands: the agent is writing it (or a grill's questions), a grill's questions wait for answers, it can
 * be checked, it failed, or it is in Jira.
 */
export type DraftStatusLike =
  'drafting' | 'asking' | 'ready' | 'failed' | 'created';

/** The parts of a draft these rules read; the API's `MeetingStoryDraft` has them all. */
export interface DraftLike {
  readonly id: string;
  readonly topicId: string;
  readonly status: DraftStatusLike;
  readonly createdAt: string;
}

/** The parts of a story these rules read; the API's `StoryTemplate` has them all. */
export interface StoryLike {
  readonly role: string;
  readonly want: string;
  readonly soThat: string;
}

/** A series' Jira target, as a draft carries it. */
export interface TargetLike {
  readonly projectKey: string | null;
  readonly issueType: string | null;
}

/** The draft each topic shows: its newest one (the API leaves discarded drafts out), by topic id. */
export function latestDraftByTopic<D extends DraftLike>(
  drafts: readonly D[]
): ReadonlyMap<string, D> {
  const latest = new Map<string, D>();
  for (const draft of drafts) {
    const seen = latest.get(draft.topicId);
    if (seen === undefined || draft.createdAt > seen.createdAt)
      latest.set(draft.topicId, draft);
  }
  return latest;
}

/** Whether any draft is still being written, so the page keeps reading them. */
export function anyDrafting(drafts: Iterable<DraftLike>): boolean {
  for (const draft of drafts) if (draft.status === 'drafting') return true;
  return false;
}

/** The short label a topic card shows for its draft; `askingFirst` for a grill whose agent is finding its questions. */
export function draftChip(
  status: DraftStatusLike,
  askingFirst = false
): string {
  switch (status) {
    case 'drafting':
      return askingFirst ? 'Finding questions…' : 'Writing the story…';
    case 'asking':
      return 'Questions to answer';
    case 'ready':
      return 'Story ready to check';
    case 'failed':
      return 'Story not written';
    case 'created':
      return 'In Jira';
  }
}

/** "As a finance user, I want …, so that …." */
export function storySentence(story: StoryLike): string {
  const end = (text: string) => text.trim().replace(/[.!]+$/, '');
  return `As ${end(story.role)}, I want ${end(story.want)}, so that ${end(story.soThat)}.`;
}

/** The longest story title the API takes: Jira's summary limit. */
export const STORY_TITLE_MAX = 255;
/** The longest role, want, so-that, criterion, out-of-scope item, dependency, test note or open question. */
export const STORY_TEXT_MAX = 1000;
/** The longest context or implemented feature. */
export const STORY_PROSE_MAX = 2000;
/** The most items one of a story's lists holds. */
export const STORY_LIST_MAX = 20;

/** A list typed one item per line, as the API takes it: each line trimmed, blank lines left out. */
export function storyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** A story's list as the text of its field, one item per line. */
export function linesText(items: readonly string[]): string {
  return items.join('\n');
}

/** The fields of a story in the template, as the API's `StoryTemplate` has them. */
export interface StoryTemplateLike {
  readonly title: string;
  readonly role: string;
  readonly want: string;
  readonly soThat: string;
  readonly context: string | null;
  readonly implementedFeature: string | null;
  readonly acceptanceCriteria: readonly string[];
  readonly outOfScope: readonly string[];
  readonly dependencies: readonly string[];
  readonly testNotes: readonly string[];
  readonly openQuestions: readonly string[];
}

/** One field of a story. */
export type StoryFieldKey = keyof StoryTemplateLike;

/** How a field is typed: one line, prose that may be left empty, or a list one item per line. */
export type StoryFieldKind = 'text' | 'prose' | 'lines';

/** The kind of each field of the template. */
export const STORY_FIELD_KINDS: Readonly<
  Record<StoryFieldKey, StoryFieldKind>
> = {
  title: 'text',
  role: 'text',
  want: 'text',
  soThat: 'text',
  context: 'prose',
  implementedFeature: 'prose',
  acceptanceCriteria: 'lines',
  outOfScope: 'lines',
  dependencies: 'lines',
  testNotes: 'lines',
  openQuestions: 'lines',
};

/** A field of a story as the text it is edited in: lists one item per line, an empty section as empty text. */
export function storyFieldText(
  story: StoryTemplateLike,
  key: StoryFieldKey
): string {
  const value = story[key];
  return value === null
    ? ''
    : typeof value === 'string'
      ? value
      : linesText(value);
}

/**
 * The story with the edited fields put back in the template: text trimmed, empty prose as null, lists one item per line
 * without blank lines. Fields not given keep their value.
 */
export function withStoryEdit(
  story: StoryTemplateLike,
  edits: Readonly<Partial<Record<StoryFieldKey, string>>>
): StoryTemplateLike {
  const text = (key: 'title' | 'role' | 'want' | 'soThat'): string =>
    edits[key]?.trim() ?? story[key];
  const prose = (key: 'context' | 'implementedFeature'): string | null => {
    const edit = edits[key];
    if (edit === undefined) return story[key];
    const trimmed = edit.trim();
    return trimmed === '' ? null : trimmed;
  };
  const lines = (
    key:
      | 'acceptanceCriteria'
      | 'outOfScope'
      | 'dependencies'
      | 'testNotes'
      | 'openQuestions'
  ): readonly string[] => {
    const edit = edits[key];
    return edit === undefined ? story[key] : storyLines(edit);
  };
  return {
    title: text('title'),
    role: text('role'),
    want: text('want'),
    soThat: text('soThat'),
    context: prose('context'),
    implementedFeature: prose('implementedFeature'),
    acceptanceCriteria: lines('acceptanceCriteria'),
    outOfScope: lines('outOfScope'),
    dependencies: lines('dependencies'),
    testNotes: lines('testNotes'),
    openQuestions: lines('openQuestions'),
  };
}

/**
 * Why a list typed one item per line cannot be saved, or null: fewer than `min` items, more than
 * {@link STORY_LIST_MAX}, or an item longer than {@link STORY_TEXT_MAX}.
 */
export function storyLinesProblem(text: string, min: number): string | null {
  const lines = storyLines(text);
  if (lines.length < min)
    return min === 1
      ? 'Write at least one, one per line.'
      : `Write at least ${min}.`;
  if (lines.length > STORY_LIST_MAX)
    return `At most ${STORY_LIST_MAX}, one per line; this has ${lines.length}.`;
  const long = lines.findIndex((line) => line.length > STORY_TEXT_MAX);
  return long === -1
    ? null
    : `Line ${long + 1} is longer than ${STORY_TEXT_MAX} characters.`;
}

/** "PROJ · Story", or null when the series has no Jira project (a one-off meeting never has one). */
export function targetText(target: TargetLike): string | null {
  if (target.projectKey === null) return null;
  return `${target.projectKey} · ${target.issueType ?? 'Story'}`;
}

/** The typed project key in the form the API takes: trimmed and in capitals. */
export function normaliseProjectKey(text: string): string {
  return text.trim().toUpperCase();
}

/** Whether `key` (already normalised) is a project key the API takes. */
export function isProjectKey(key: string): boolean {
  return key.length <= PROJECT_KEY_MAX && PROJECT_KEY.test(key);
}

/** "1 note", "3 notes", "no notes". */
export function notesCount(n: number): string {
  return n === 0 ? 'no notes' : n === 1 ? '1 note' : `${n} notes`;
}

/**
 * The note ids to send: none when every note is ticked (the API then takes all of them, including notes added
 * meanwhile), else the ticked ones in the topic's order. Null when the topic has notes and none is ticked: the API
 * reads an empty list as "all notes", so drafting from the title alone cannot be asked for.
 */
export function chosenNoteIds(
  allIds: readonly string[],
  ticked: ReadonlySet<string>
): string[] | null {
  const chosen = allIds.filter((id) => ticked.has(id));
  if (chosen.length === allIds.length) return [];
  return chosen.length === 0 ? null : chosen;
}

/** The longest answer in a person's own words the API takes. */
export const GRILL_OWN_ANSWER_MAX = 2000;

/** The parts of a grill's option these rules read; the API's `GrillOption` has them all. */
export interface GrillOptionLike {
  readonly label: string;
  readonly detail: string;
  readonly recommended: boolean;
}

/** The parts of a grill's question these rules read; the API's `GrillQuestion` has them all. */
export interface GrillQuestionLike {
  readonly id: string;
  readonly text: string;
  readonly options: readonly GrillOptionLike[];
}

/** How a person answers one question while going through a grill: an option (by index), left open, or own words. */
export type GrillPick =
  | { readonly choice: 'option'; readonly option: number }
  | { readonly choice: 'open' }
  | { readonly choice: 'own'; readonly text: string };

/** One answer as `answerMeetingStoryQuestions` takes it. */
export type GrillAnswerBody =
  | {
      readonly questionId: string;
      readonly choice: 'option';
      readonly option: number;
    }
  | { readonly questionId: string; readonly choice: 'open' }
  | {
      readonly questionId: string;
      readonly choice: 'own';
      readonly text: string;
    };

/** "A", "B", … for the options of a question. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Whether a pick can be sent: an option the question offers, left open, or own words that are not blank or too long. */
export function pickComplete(
  question: GrillQuestionLike,
  pick: GrillPick
): boolean {
  switch (pick.choice) {
    case 'option':
      return (
        Number.isSafeInteger(pick.option) &&
        pick.option >= 0 &&
        pick.option < question.options.length
      );
    case 'open':
      return true;
    case 'own': {
      const text = pick.text.trim();
      return text !== '' && text.length <= GRILL_OWN_ANSWER_MAX;
    }
  }
}

/** What an answered question shows: the option's label, "Left open in the story", or the person's words. */
export function pickSummary(
  question: GrillQuestionLike,
  pick: GrillPick
): string {
  switch (pick.choice) {
    case 'option':
      return question.options[pick.option]?.label ?? '';
    case 'open':
      return 'Left open in the story';
    case 'own':
      return pick.text.trim();
  }
}

/**
 * The answers to send, in the questions' order: one for each question with a complete pick (own words trimmed). A
 * question without one is left out, and the API leaves it open.
 */
export function grillAnswerBodies(
  questions: readonly GrillQuestionLike[],
  picks: ReadonlyMap<string, GrillPick>
): GrillAnswerBody[] {
  const bodies: GrillAnswerBody[] = [];
  for (const question of questions) {
    const pick = picks.get(question.id);
    if (pick === undefined || !pickComplete(question, pick)) continue;
    const questionId = question.id;
    if (pick.choice === 'option')
      bodies.push({ questionId, choice: 'option', option: pick.option });
    else if (pick.choice === 'open')
      bodies.push({ questionId, choice: 'open' });
    else bodies.push({ questionId, choice: 'own', text: pick.text.trim() });
  }
  return bodies;
}

/** The first question without a complete pick, or the last question when all have one; 0 for no questions. */
export function firstUnanswered(
  questions: readonly GrillQuestionLike[],
  picks: ReadonlyMap<string, GrillPick>
): number {
  const i = questions.findIndex((q) => {
    const pick = picks.get(q.id);
    return pick === undefined || !pickComplete(q, pick);
  });
  return i === -1 ? Math.max(questions.length - 1, 0) : i;
}

/** "Question 3 of 4". */
export function grillProgress(index: number, total: number): string {
  return `Question ${index + 1} of ${total}`;
}
