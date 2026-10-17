import {
  isForbidden,
  isInvalidState,
  isNotFound,
  isUnauthenticated,
  isUnreachable,
  isValidationFailed,
  type ApiError,
} from '@core/api/api-error';
import { techLine, type CommandErrorView } from '@core/commands/command-error';

/** The API's own words for a problem, when it sent a `detail`; otherwise `fallback`. */
function detailOr(error: ApiError, fallback: string): string {
  return error.kind === 'problem' &&
    error.detail !== undefined &&
    error.detail.trim() !== ''
    ? error.detail.trim()
    : fallback;
}

/**
 * What the Meetings page shows for an API error: plain words first, the technical line last. A tooling failure
 * (`invalid_response`, a network error) never reads like something about the meeting.
 */
export function meetingErrorView(error: ApiError): CommandErrorView {
  const tech = techLine(error);
  if (isUnreachable(error)) {
    return {
      variant: 'error',
      heading: "Can't reach Ahoy",
      text: "Ahoy didn't answer. Nothing you typed is lost: try again in a moment.",
      tech,
    };
  }
  if (error.kind === 'invalid_response') {
    return {
      variant: 'error',
      heading: 'Ahoy sent something unexpected',
      text: "The answer couldn't be read, so we can't tell whether it went through. Refresh to see the meeting as it is now.",
      tech,
    };
  }
  if (isUnauthenticated(error)) {
    return {
      variant: 'error',
      heading: 'Sign-in needed',
      text: 'Sign in again, then retry.',
      tech,
    };
  }
  if (isForbidden(error)) {
    return {
      variant: 'error',
      heading: "You can't do that here",
      text: detailOr(error, 'Ask an admin.'),
      tech,
    };
  }
  if (isNotFound(error)) {
    return {
      variant: 'error',
      heading: "This meeting doesn't exist",
      text: detailOr(
        error,
        'It may have been removed. Pick another meeting on the left.'
      ),
      tech,
    };
  }
  if (isValidationFailed(error)) {
    return {
      variant: 'error',
      heading: 'Ahoy refused that',
      text: detailOr(error, 'Check what you typed and try again.'),
      tech,
    };
  }
  if (isInvalidState(error)) {
    return {
      variant: 'notice',
      heading: 'The meeting changed',
      text: detailOr(
        error,
        'Someone may have started or ended it. Refresh to see it as it is now.'
      ),
      tech,
    };
  }
  return {
    variant: 'error',
    heading: 'That did not go through',
    text: detailOr(error, 'Try again in a moment.'),
    tech,
  };
}
