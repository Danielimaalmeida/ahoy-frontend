import {
  hasProblemCode,
  isForbidden,
  isInvalidState,
  isNotFound,
  isStale,
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
 * What the Team settings page shows for an API error: plain words first, the technical line last. A `503` that says
 * why (no `AHOY_SECRETS_KEY`) reads as that, not as Ahoy being down; a tooling failure never reads like a setting.
 */
export function settingsErrorView(error: ApiError): CommandErrorView {
  const tech = techLine(error);
  const why = hasProblemCode(error, 'unavailable') ? detailOr(error, '') : '';
  if (why !== '')
    return {
      variant: 'error',
      heading: "Ahoy can't do that now",
      text: why,
      tech,
    };
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
      text: "The answer couldn't be read, so we can't tell whether it went through. Refresh to see the settings as they are now.",
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
      heading: 'Only admins change team settings',
      text: detailOr(error, 'Ask an admin.'),
      tech,
    };
  if (isStale(error))
    return {
      variant: 'notice',
      heading: 'Someone changed this since you opened it',
      text: 'Close this, look at it as it is now, and make your change again.',
      tech,
    };
  if (isNotFound(error))
    return {
      variant: 'notice',
      heading: 'That is no longer there',
      text: detailOr(
        error,
        'Someone may have removed it. Refresh the settings.'
      ),
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
      heading: 'That cannot change now',
      text: detailOr(error, 'Refresh to see the settings as they are now.'),
      tech,
    };
  return {
    variant: 'error',
    heading: 'That did not go through',
    text: detailOr(error, 'Try again in a moment.'),
    tech,
  };
}
