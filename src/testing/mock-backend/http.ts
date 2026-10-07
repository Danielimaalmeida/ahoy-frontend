/**
 * The mock's own request and answer shapes, which every adapter (the `fetch` stand-in, the `HttpClient` interceptor and
 * the `node:http` server of `npm run mock:api`) translates to and from. Problems are written the way the real API writes
 * them (`apps/api/src/server.ts` of `ahoy-hosted`): `type` `urn:ahoy:problem:<code>`, `title` the code with spaces.
 */
import type { ProblemCode } from "@core/api/types";

/** A request as the mock reads it. */
export interface MockRequest {
  readonly method: string;
  /** The path under the API base, such as `/stories/PROJ-123/stop` (still percent-encoded). */
  readonly path: string;
  readonly query: URLSearchParams;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string>>;
  /** The body: parsed JSON, `undefined` for none, or the raw text when it was not JSON. */
  readonly body: unknown;
  /** Whether a body was sent that is not JSON (`bad_request`). */
  readonly bodyIsInvalidJson?: boolean;
}

/** An event stream the mock keeps open: the bytes, and a way to break it from outside (an aborted request). */
export interface MockStream {
  readonly body: ReadableStream<Uint8Array>;
  /** Ends the stream with an error, as a dropped connection would. */
  abort(reason?: unknown): void;
}

/** An answer of the mock. */
export type MockResponse =
  | {
      readonly kind: "json";
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: unknown;
    }
  | {
      readonly kind: "text";
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
    }
  | { readonly kind: "empty"; readonly status: number; readonly headers: Readonly<Record<string, string>> }
  | {
      readonly kind: "stream";
      readonly status: 200;
      readonly headers: Readonly<Record<string, string>>;
      readonly stream: MockStream;
    };

/** One entry of a problem's `errors`. */
export interface FieldError {
  readonly path: string;
  readonly message: string;
}

/** The HTTP status the real API gives each problem code (`packages/core/src/store/errors.ts`). */
export const PROBLEM_STATUS: Readonly<Record<ProblemCode, number>> = {
  bad_request: 400,
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  story_exists: 409,
  stale_version: 409,
  invalid_state: 409,
  already_answered: 409,
  decision_already_recorded: 409,
  revision_ceiling_reached: 409,
  unsupported_gate: 422,
  legacy_story: 409,
  internal_error: 500,
  unavailable: 503,
};

/** Extra members of a problem body. */
export interface ProblemExtra {
  readonly errors?: readonly FieldError[];
  readonly currentVersion?: number;
  /** Response headers, such as `Allow` for a method the path does not support. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Thrown inside the mock to answer with a problem; the server turns it into the answer. */
export class MockProblem extends Error {
  readonly code: ProblemCode;
  readonly extra: ProblemExtra;

  constructor(code: ProblemCode, detail: string, extra: ProblemExtra = {}) {
    super(detail);
    this.code = code;
    this.extra = extra;
  }
}

/** The `application/problem+json` answer for a problem. */
export function problemResponse(problem: MockProblem): MockResponse {
  const status = PROBLEM_STATUS[problem.code];
  return {
    kind: "json",
    status,
    headers: { "Content-Type": "application/problem+json; charset=utf-8", ...problem.extra.headers },
    body: {
      type: `urn:ahoy:problem:${problem.code}`,
      title: problem.code.replaceAll("_", " "),
      status,
      code: problem.code,
      detail: problem.message,
      ...(problem.extra.errors !== undefined ? { errors: problem.extra.errors } : {}),
      ...(problem.extra.currentVersion !== undefined ? { currentVersion: problem.extra.currentVersion } : {}),
    },
  };
}

/** A JSON answer. The body is copied, so the caller can never reach the mock's own records. */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): MockResponse {
  return {
    kind: "json",
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    body: structuredClone(body),
  };
}

/** The body of a JSON answer as text, as it goes over the wire. */
export function responseText(response: MockResponse): string | null {
  switch (response.kind) {
    case "json":
      return JSON.stringify(response.body);
    case "text":
      return response.body;
    case "empty":
    case "stream":
      return null;
  }
}

/** Whether a value is a plain JSON object. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
