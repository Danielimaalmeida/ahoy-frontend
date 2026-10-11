/**
 * What an API call gives back: a value, or an error that is also a value. Nothing in `core/api` throws for an expected
 * outcome (plan §5.5), and a tooling failure is never shown as a domain verdict: an answer the app cannot read is
 * `invalid_response`, which is not `gate_rejected`.
 */
import type { Problem, ProblemFieldError } from './types';

/**
 * The API answered with problem details (`application/problem+json`). `status` is the HTTP status of the answer. `code` is
 * a string, not a union of `PROBLEM_CODES`: an error is never refused because the API grew a code this version lacks.
 */
export interface ProblemError {
  readonly kind: 'problem';
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: readonly ProblemFieldError[];
  /** On `stale_version`: the story's version now. */
  readonly currentVersion?: number;
  /** The request id, when the API sends one. */
  readonly instance?: string;
}

/**
 * There was no usable answer from the API: the request failed on the way (no `status`), or a gateway answered for it
 * (`status` 502, 503 or 504 without problem details). The UI shows "Can't reach Ahoy" for it, as it does
 * for `isUnreachable`.
 */
export interface NetworkError {
  readonly kind: 'network';
  readonly status?: number;
}

/**
 * The answer is not what the contract says: the body is not JSON, a field is missing or of the wrong type, an enum value is
 * unknown, or an error status came without problem details. It is a failure of tooling, never a verdict about the story.
 * `what` says which call and which field, for the technical line and the console; it is not meant for end users.
 */
export interface InvalidResponseError {
  readonly kind: 'invalid_response';
  readonly what: string;
}

/** Why an API call gave no value. */
export type ApiError = ProblemError | NetworkError | InvalidResponseError;

/** The outcome of an API call. */
export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError };

/** A successful result. */
export function ok<T>(value: T): ApiResult<T> {
  return { ok: true, value };
}

/** A failed result. */
export function fail(error: ApiError): ApiResult<never> {
  return { ok: false, error };
}

/** Applies `f` to the value of a successful result; a failed one passes through. */
export function mapResult<T, U>(
  result: ApiResult<T>,
  f: (value: T) => U
): ApiResult<U> {
  return result.ok ? ok(f(result.value)) : result;
}

/** An `invalid_response` for the call `op`. */
export function invalidResponse(op: string, why: string): InvalidResponseError {
  return { kind: 'invalid_response', what: `${op}: ${why}` };
}

/** The error for a problem body the API sent with HTTP status `status`. Fields the body leaves out stay absent. */
export function problemToError(status: number, problem: Problem): ProblemError {
  return {
    kind: 'problem',
    status,
    code: problem.code,
    title: problem.title,
    ...(problem.detail !== undefined ? { detail: problem.detail } : {}),
    ...(problem.errors !== undefined ? { errors: problem.errors } : {}),
    ...(problem.currentVersion !== undefined
      ? { currentVersion: problem.currentVersion }
      : {}),
    ...(problem.instance !== undefined ? { instance: problem.instance } : {}),
  };
}

/** Whether an error is problem details with this `code`. */
export function hasProblemCode(
  error: ApiError,
  code: string
): error is ProblemError {
  return error.kind === 'problem' && error.code === code;
}

/** `stale_version`: the story changed since the user opened it (`currentVersion` says to what). */
export const isStale = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'stale_version');

/** `decision_already_recorded`: someone decided that gate first. */
export const isDecisionAlreadyRecorded = (
  error: ApiError
): error is ProblemError => hasProblemCode(error, 'decision_already_recorded');

/** `already_answered`: someone answered that question first. */
export const isAlreadyAnswered = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'already_answered');

/** `story_exists`: a story with that key already exists. */
export const isStoryExists = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'story_exists');

/** `invalid_state`: the story is not in a state that takes that command. */
export const isInvalidState = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'invalid_state');

/** `revision_ceiling_reached`: the plan was sent back as often as the gate allows. */
export const isRevisionCeilingReached = (
  error: ApiError
): error is ProblemError => hasProblemCode(error, 'revision_ceiling_reached');

/** `legacy_story`: the story predates the relational state model and cannot be changed or have its state read. */
export const isLegacyStory = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'legacy_story');

/** `unsupported_gate`: the phase has no human gate with that key. */
export const isUnsupportedGate = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'unsupported_gate');

/** `validation_failed`: the request does not match the contract; `errors` say where. */
export const isValidationFailed = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'validation_failed');

/** `not_found`: there is no such story, run, question or artifact. */
export const isNotFound = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'not_found');

/** `unauthenticated`: the API wants a sign-in the app does not do. */
export const isUnauthenticated = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'unauthenticated');

/** `forbidden`: the user may not do that. */
export const isForbidden = (error: ApiError): error is ProblemError =>
  hasProblemCode(error, 'forbidden');

/** Whether the API could not be reached or reported itself unavailable: the "Can't reach Ahoy" case. */
export function isUnreachable(error: ApiError): boolean {
  return error.kind === 'network' || hasProblemCode(error, 'unavailable');
}

/** Undoes the two escapes of a JSON pointer segment (RFC 6901), `~1` first. */
function unescapePointer(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/**
 * Turns the `path` of an entry of a problem's `errors` into the path of a form control, such as
 * `["models", "review", "model"]` for `form.get([...])`. Returns null when the error names no control: it has no
 * path, it is about the whole body, or about a query parameter, path parameter or header.
 *
 * The API words these paths in two ways, and both are read: `body/models/review` (the contract check, with a
 * `body` prefix) and `/models/review` (a rule of the story, a JSON pointer). Segments are strings, array indexes
 * included.
 */
export function formControlPath(
  path: string | undefined
): readonly string[] | null {
  if (path === undefined) return null;
  const pointer = path.startsWith('body/') ? path.slice('body'.length) : path;
  if (!pointer.startsWith('/')) return null;
  const segments = pointer.slice(1).split('/').map(unescapePointer);
  return segments.every((segment) => segment !== '') ? segments : null;
}

/** An entry of a problem's `errors`, with its path turned into a form control path (null: not a control). */
export interface FieldError {
  readonly path: readonly string[] | null;
  readonly message: string;
}

/** The server's messages for one field of the request, joined; "" when there are none (or there is no error). */
export function fieldMessage(error: ApiError | null, field: string): string {
  if (error === null) return '';
  return fieldErrors(error)
    .filter((e) => e.path?.[0] === field)
    .map((e) => e.message)
    .join(' ');
}

/** The `errors` of a problem as field errors; none for an error that is not a problem or has no `errors`. */
export function fieldErrors(error: ApiError): readonly FieldError[] {
  if (error.kind !== 'problem') return [];
  return (error.errors ?? []).map((e) => ({
    path: formControlPath(e.path),
    message: e.message,
  }));
}
