import {
  isForbidden,
  isInvalidState,
  isLegacyStory,
  isNotFound,
  isRevisionCeilingReached,
  isUnauthenticated,
  isUnreachable,
  isValidationFailed,
  type ApiError,
} from '@core/api/api-error';
import type { CommandOutcome } from './command-runner';

/**
 * What a form shows for a command that did not go through: a `notice` when the voyage changed meanwhile, an `error`
 * otherwise. It has the shape of the dialog's and the banner's inputs, so it passes straight to either.
 */
export interface CommandErrorView {
  readonly variant: 'notice' | 'error';
  readonly heading: string;
  readonly text?: string;
  /** The technical line: `status · code · request id`, as far as they are known. */
  readonly tech?: string;
}

/** The heading of the `stale_version` banner (`vocabulary.md`). */
export const STALE_HEADING = 'This voyage changed since you opened it';

/** The heading for network and `503` failures. */
export const UNREACHABLE_HEADING = "Can't reach Ahoy";

/** The technical line of an error: `409 · stale_version · req-7`, `network`, `invalid_response · getStory: …`. */
export function techLine(error: ApiError): string {
  switch (error.kind) {
    case 'problem':
      return [
        String(error.status),
        error.code,
        ...(error.instance !== undefined ? [error.instance] : []),
      ].join(' · ');
    case 'network':
      return error.status !== undefined
        ? `${error.status} · network`
        : 'network';
    case 'invalid_response':
      return `invalid_response · ${error.what}`;
  }
}

/** The API's own words for a problem, when it sent a `detail`; otherwise `fallback`. */
function detailOr(error: ApiError, fallback: string): string {
  return error.kind === 'problem' &&
    error.detail !== undefined &&
    error.detail.trim() !== ''
    ? error.detail.trim()
    : fallback;
}

/**
 * What to show for an API error a command or a page ran into (plan §5.5). The plain words come first, the technical
 * code last; a tooling failure (`invalid_response`) never reads like a verdict on the voyage.
 */
export function apiErrorView(error: ApiError): CommandErrorView {
  const tech = techLine(error);
  if (isUnreachable(error)) {
    return {
      variant: 'error',
      heading: UNREACHABLE_HEADING,
      text: "Ahoy didn't answer. Nothing you typed is lost: try again in a moment.",
      tech,
    };
  }
  if (error.kind === 'invalid_response') {
    return {
      variant: 'error',
      heading: 'Ahoy sent something unexpected',
      text: "The answer couldn't be read, so we can't tell whether it went through. Refresh to see the voyage as it is now.",
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
      text: detailOr(error, "Ask the voyage's owner."),
      tech,
    };
  }
  if (isNotFound(error)) {
    return {
      variant: 'error',
      heading: "This voyage doesn't exist",
      text: detailOr(error, 'It may have been removed.'),
      tech,
    };
  }
  if (isValidationFailed(error)) {
    return {
      variant: 'error',
      heading: 'Check the highlighted fields',
      text: detailOr(error, 'Ahoy refused some of the values.'),
      tech,
    };
  }
  if (isRevisionCeilingReached(error)) {
    return {
      variant: 'error',
      heading: 'No more revision rounds',
      text: detailOr(
        error,
        'The plan was sent back the maximum number of times.'
      ),
      tech,
    };
  }
  if (isLegacyStory(error)) {
    return {
      variant: 'error',
      heading: "This voyage can't be changed here",
      text: detailOr(error, 'It predates the current state model.'),
      tech,
    };
  }
  if (isInvalidState(error)) {
    return {
      variant: 'error',
      heading: "The voyage isn't in a state that allows this",
      text: detailOr(error, 'It may have moved on. It has been refreshed.'),
      tech,
    };
  }
  return {
    variant: 'error',
    heading: "That didn't go through",
    text: detailOr(error, 'Something went wrong. Try again.'),
    tech,
  };
}

/**
 * What a form shows after a command that did not go through, or null for `ok` and `skipped`. A `stale` outcome is the
 * `notice` "This voyage changed since you opened it": the story has been read again and the text is kept. `decided` and
 * `answered` get a plain banner here; the plan and questions tabs show their own panels for them.
 */
export function commandErrorView(
  outcome: CommandOutcome<unknown>
): CommandErrorView | null {
  switch (outcome.kind) {
    case 'ok':
    case 'skipped':
      return null;
    case 'stale':
      return {
        variant: 'notice',
        heading: STALE_HEADING,
        text: 'It has been refreshed with the latest changes. Your text is kept: check it and send again.',
        tech: techLine(outcome.error),
      };
    case 'decided':
      return {
        variant: 'error',
        heading: 'Someone already decided',
        text: detailOr(
          outcome.error,
          "Your decision wasn't recorded. Your text is kept."
        ),
        tech: techLine(outcome.error),
      };
    case 'answered':
      return {
        variant: 'error',
        heading: 'Someone already answered',
        text: detailOr(
          outcome.error,
          "Your answer wasn't recorded. Your text is kept."
        ),
        tech: techLine(outcome.error),
      };
    case 'other':
      return apiErrorView(outcome.error);
  }
}
