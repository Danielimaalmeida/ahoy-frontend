import type { ApiError } from '@core/api/api-error';
import { techLine, type CommandErrorView } from '@core/commands/command-error';
import { meetingErrorView } from './meeting-errors';

/** What the person was doing with a story when the API refused. */
export type StoryAction = 'draft' | 'answer' | 'discard' | 'create' | 'target';

/** The API's own words for a problem, when it sent a `detail`; otherwise `fallback`. */
function detailOr(error: ApiError, fallback: string): string {
  return error.kind === 'problem' &&
    error.detail !== undefined &&
    error.detail.trim() !== ''
    ? error.detail.trim()
    : fallback;
}

/** Headings for a 409, by action: the draft or topic was not in a state that allows it. */
const NOT_NOW: Readonly<Record<StoryAction, string>> = {
  draft: "This topic can't be drafted now",
  answer: "These answers can't be sent now",
  discard: "This draft can't be discarded",
  create: "This story can't go to Jira yet",
  target: "The series can't take that",
};

/**
 * What the story dialogs show for an API error. A 503 on a draft or on answers means the server has no story agent; on Create it
 * means Jira refused or could not be reached, and the draft is kept. Anything else reads like the Meetings page.
 */
export function storyErrorView(
  error: ApiError,
  action: StoryAction
): CommandErrorView {
  if (error.kind !== 'problem') return meetingErrorView(error);
  const tech = techLine(error);
  if (error.status === 503 && action === 'create')
    return {
      variant: 'error',
      heading: "Jira didn't take the story",
      text: detailOr(
        error,
        "Jira refused it or couldn't be reached. The draft is kept: try again in a moment."
      ),
      tech,
    };
  if (error.status === 503 && (action === 'draft' || action === 'answer'))
    return {
      variant: 'error',
      heading: "Story drafts aren't set up on this server",
      text: detailOr(error, 'Ask an admin to turn them on.'),
      tech,
    };
  if (error.status === 409)
    return {
      variant: 'notice',
      heading: NOT_NOW[action],
      text: detailOr(error, 'It changed meanwhile. Close this and look again.'),
      tech,
    };
  if (error.status === 404 && action !== 'target')
    return {
      variant: 'error',
      heading: "This draft or topic doesn't exist any more",
      text: detailOr(
        error,
        'Someone may have discarded or removed it. Close this and look again.'
      ),
      tech,
    };
  return meetingErrorView(error);
}
