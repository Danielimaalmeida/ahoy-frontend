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
 * What the Crew page shows for an API error: plain words first, the technical line last. A tooling failure
 * (`invalid_response`, a network error) never reads like something about the crew.
 */
export function crewErrorView(error: ApiError): CommandErrorView {
  const tech = techLine(error);
  if (isUnreachable(error))
    return {
      variant: 'error',
      heading: "Can't reach Ahoy",
      text: "Ahoy didn't answer. Try again in a moment.",
      tech,
    };
  if (error.kind === 'invalid_response')
    return {
      variant: 'error',
      heading: 'Ahoy sent something unexpected',
      text: "The answer couldn't be read, so we can't tell whether it went through. Refresh to see the crew as it is now.",
      tech,
    };
  if (isUnauthenticated(error))
    return {
      variant: 'error',
      heading: 'Sign-in needed',
      text: 'Sign in again, then retry.',
      tech,
    };
  if (isForbidden(error))
    return {
      variant: 'error',
      heading: "You can't do that here",
      text: detailOr(error, 'Ask an admin.'),
      tech,
    };
  if (isNotFound(error))
    return {
      variant: 'notice',
      heading: 'That is no longer there',
      text: detailOr(error, 'Someone may have changed it. Refresh the crew.'),
      tech,
    };
  if (isValidationFailed(error))
    return {
      variant: 'error',
      heading: 'Ahoy refused that',
      text: detailOr(error, 'Check what you typed and try again.'),
      tech,
    };
  if (isInvalidState(error))
    return {
      variant: 'notice',
      heading: 'The sprint moved on',
      text: detailOr(error, 'Refresh to see the crew as it is now.'),
      tech,
    };
  return {
    variant: 'error',
    heading: 'That did not go through',
    text: detailOr(error, 'Try again in a moment.'),
    tech,
  };
}
