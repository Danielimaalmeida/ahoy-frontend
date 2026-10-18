/**
 * Pure rules for user stories drafted from meeting topics (slice 2): which draft a topic shows, how a draft is
 * described, and the Jira target of a series. No Angular, no clock: time comes in as a parameter.
 */

/** The most AIU one story draft may be capped at (50 AIU, in nano-AIU), as the API's `budgetNanoAiu` maximum. */
export const STORY_DRAFT_MAX_NANO_AIU = 50_000_000_000;

/** How often the page reads a draft again while the agent is writing it, in milliseconds. */
export const DRAFT_POLL_MS = 3000;

/** A Jira project key as the API takes it (`JiraProjectKey`): a capital letter, then capitals, digits or `_`. */
const PROJECT_KEY = /^[A-Z][A-Z0-9_]+$/;

/** The longest project key the API takes. */
export const PROJECT_KEY_MAX = 50;

/** Where a draft stands: the agent is writing it, it can be checked, it failed, or it is in Jira. */
export type DraftStatusLike = 'drafting' | 'ready' | 'failed' | 'created';

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

/** The short label a topic card shows for its draft. */
export function draftChip(status: DraftStatusLike): string {
  switch (status) {
    case 'drafting':
      return 'Writing the story…';
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
