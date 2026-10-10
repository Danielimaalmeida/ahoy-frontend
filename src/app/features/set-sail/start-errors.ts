import type { ApiError } from '@core/api/api-error';
import {
  fieldErrors,
  isStoryExists,
  isUnreachable,
  isValidationFailed,
} from '@core/api/api-error';
import { isModelSlot } from '@domain/models';
import type { ModelSlot } from '@domain/types';

/** A callout for what no field can show: the heading, the plain-words text and the technical line. */
export interface FeedbackBanner {
  readonly heading: string;
  readonly text: string;
  readonly tech: string;
  /** The harbour could not be reached: the banner offers "Try again". */
  readonly retry: boolean;
}

/** Where the answer to `startStory` says the form is wrong. Nothing in it replaces what the user typed. */
export interface StartFeedback {
  readonly key?: string;
  /** The key of the voyage that already exists, to link to ("Open PROJ-145"). */
  readonly existingKey?: string;
  readonly title?: string;
  readonly budget?: string;
  /** An error under each model row. */
  readonly models: Readonly<Partial<Record<ModelSlot, string>>>;
  readonly banner?: FeedbackBanner;
}

/** A field of the form that can carry a server error. */
export type FeedbackField = 'key' | 'title' | 'budget' | ModelSlot;

/** No feedback: the form as the user left it. */
export const NO_FEEDBACK: StartFeedback = { models: {} };

/** `status · code · request id`, the technical line of a problem. */
function techLine(error: ApiError): string {
  if (error.kind === 'invalid_response')
    return `invalid_response · ${error.what}`;
  if (error.kind === 'network')
    return error.status !== undefined ? `network · ${error.status}` : 'network';
  return [
    String(error.status),
    error.code,
    ...(error.instance !== undefined ? [error.instance] : []),
  ].join(' · ');
}

/**
 * The banner for an error no field shows: "Can't reach Ahoy", "Ahoy sent something unexpected" and
 * "Sign-in needed" in the plan's words (§5.5), otherwise the problem's title and detail, with `extra` (messages of
 * `validation_failed` that name no field) after the detail.
 */
function bannerOf(
  error: ApiError,
  extra: readonly string[] = []
): FeedbackBanner {
  const tech = techLine(error);
  if (isUnreachable(error))
    return {
      heading: "Can't reach Ahoy",
      text: 'Ahoy could not reach the API. Nothing you typed was lost; try again in a moment.',
      tech,
      retry: true,
    };
  if (error.kind === 'invalid_response')
    return {
      heading: 'Ahoy sent something unexpected',
      text: 'The voyage may or may not have been created. Check All voyages before trying again.',
      tech,
      retry: false,
    };
  // Not `isUnauthenticated`: as a type guard, its false branch would narrow `ProblemError` out of `error` below.
  if (error.kind === 'problem' && error.code === 'unauthenticated')
    return {
      heading: 'Sign-in needed',
      text: 'The API wants you signed in. Sign in the way your team usually does, then try again.',
      tech,
      retry: false,
    };
  const detail = error.kind === 'problem' ? (error.detail ?? '') : '';
  return {
    heading: error.kind === 'problem' ? error.title : 'Something went wrong',
    text: [detail, extra.join('; ')].filter((part) => part !== '').join(': '),
    tech,
    retry: false,
  };
}

/**
 * Turns a refused `startStory` into what the form shows: `story_exists` an error on the key with a link, validation
 * paths beside their fields, anything else in a banner. `key` is the key the user tried.
 */
export function startFeedback(error: ApiError, key: string): StartFeedback {
  if (isStoryExists(error))
    return {
      models: {},
      key: `${key} already has a voyage.`,
      existingKey: key,
    };
  if (!isValidationFailed(error))
    return { models: {}, banner: bannerOf(error) };

  const fields: { key?: string; title?: string; budget?: string } = {};
  const models: Partial<Record<ModelSlot, string>> = {};
  const unplaced: string[] = [];
  for (const { path, message } of fieldErrors(error)) {
    const [head, slot] = path ?? [];
    if (head === 'key') fields.key ??= message;
    else if (head === 'title') fields.title ??= message;
    else if (head === 'budgetNanoAiu') fields.budget ??= message;
    else if (head === 'models' && slot !== undefined && isModelSlot(slot))
      models[slot] ??= message;
    else unplaced.push(message);
  }
  const placed =
    Object.keys(fields).length > 0 || Object.keys(models).length > 0;
  return {
    ...fields,
    models,
    ...(unplaced.length > 0 || !placed
      ? { banner: bannerOf(error, unplaced) }
      : {}),
  };
}

/** The feedback without the error of `field`: the user edited it, so the server's word on it is out of date. */
export function withoutField(
  feedback: StartFeedback,
  field: FeedbackField
): StartFeedback {
  const next: { -readonly [K in keyof StartFeedback]: StartFeedback[K] } = {
    ...feedback,
  };
  if (field === 'key') {
    delete next.key;
    delete next.existingKey;
  } else if (field === 'title') delete next.title;
  else if (field === 'budget') delete next.budget;
  else {
    next.models = Object.fromEntries(
      Object.entries(feedback.models).filter(([slot]) => slot !== field)
    );
  }
  return next;
}
