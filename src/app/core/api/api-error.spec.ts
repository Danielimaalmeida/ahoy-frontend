import problems from "@testing/fixtures/problems.json";
import {
  fail,
  fieldErrors,
  formControlPath,
  hasProblemCode,
  invalidResponse,
  isAlreadyAnswered,
  isDecisionAlreadyRecorded,
  isForbidden,
  isInvalidState,
  isLegacyStory,
  isNotFound,
  isRevisionCeilingReached,
  isStale,
  isStoryExists,
  isUnauthenticated,
  isUnreachable,
  isUnsupportedGate,
  isValidationFailed,
  mapResult,
  ok,
  problemToError,
  type ApiError,
  type ProblemError,
} from "./api-error";
import { isProblem } from "./guards";
import { PROBLEM_CODES } from "./types";

/** The problem error the API's own example of `code` becomes. */
function problemOf(code: string): ProblemError {
  const body = problems.find((p) => p.code === code);
  if (!isProblem(body)) throw new Error(`no problem fixture for ${code}`);
  return problemToError(body.status, body);
}

describe("ApiResult", () => {
  it("ok and fail build the two shapes", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(fail({ kind: "network" })).toEqual({ ok: false, error: { kind: "network" } });
  });

  it("mapResult changes the value of a success and passes a failure through unchanged", () => {
    expect(mapResult(ok(2), (n) => n * 10)).toEqual({ ok: true, value: 20 });
    const failed = fail({ kind: "network", status: 502 });
    expect(mapResult(failed, () => "never")).toBe(failed);
  });
});

describe("problemToError", () => {
  it("keeps the HTTP status of the answer and every part the body has", () => {
    const stale = problemOf("stale_version");
    expect(stale).toEqual({
      kind: "problem",
      status: 409,
      code: "stale_version",
      title: "stale version",
      detail: "Story PROJ-123 is at version 9, not 8",
      currentVersion: 9,
    });
  });

  it("leaves out what the body leaves out, instead of setting it to undefined", () => {
    const notFound = problemOf("not_found");
    for (const absent of ["errors", "currentVersion", "instance"]) expect(absent in notFound).toBe(false);
  });

  it("carries the request id and the field errors", () => {
    expect(problemOf("internal_error").instance).toBe("req-7c1e5a90");
    expect(problemOf("validation_failed").errors).toEqual([
      { path: "body/budgetNanoAiu", message: "must be >= 1" },
      { path: "/reason", message: "required" },
    ]);
  });

  it("takes the status from the argument, not from the body", () => {
    const body = problems[0]!;
    expect(problemToError(503, body).status).toBe(503);
  });
});

describe("predicates", () => {
  const PREDICATES = [
    ["stale_version", isStale],
    ["decision_already_recorded", isDecisionAlreadyRecorded],
    ["already_answered", isAlreadyAnswered],
    ["story_exists", isStoryExists],
    ["invalid_state", isInvalidState],
    ["revision_ceiling_reached", isRevisionCeilingReached],
    ["legacy_story", isLegacyStory],
    ["unsupported_gate", isUnsupportedGate],
    ["validation_failed", isValidationFailed],
    ["not_found", isNotFound],
    ["unauthenticated", isUnauthenticated],
    ["forbidden", isForbidden],
  ] as const;

  it.each(PREDICATES)("%s is recognised, and only that code", (code, predicate) => {
    expect(predicate(problemOf(code))).toBe(true);
    for (const other of PROBLEM_CODES.filter((c) => c !== code)) expect(predicate(problemOf(other))).toBe(false);
  });

  it("is false for the errors that are not problems", () => {
    const others: readonly ApiError[] = [{ kind: "network" }, invalidResponse("getStory", "x")];
    for (const [, predicate] of PREDICATES) for (const error of others) expect(predicate(error)).toBe(false);
  });

  it("a code the contract does not list still reads as a problem with that code", () => {
    const future = problemToError(429, { type: "urn:x", title: "slow", status: 429, code: "rate_limited" });
    expect(hasProblemCode(future, "rate_limited")).toBe(true);
    expect(future.code).toBe("rate_limited");
  });

  it("isUnreachable is the 'lost contact' case: a network failure or unavailable", () => {
    expect(isUnreachable({ kind: "network" })).toBe(true);
    expect(isUnreachable({ kind: "network", status: 502 })).toBe(true);
    expect(isUnreachable(problemOf("unavailable"))).toBe(true);
    expect(isUnreachable(problemOf("internal_error"))).toBe(false);
    expect(isUnreachable(invalidResponse("getStory", "x"))).toBe(false);
  });

  it("an invalid response says which call and why, and is not a problem", () => {
    const error = invalidResponse("listStories", "StoryPage.items[0].version must be a version");
    expect(error).toEqual({
      kind: "invalid_response",
      what: "listStories: StoryPage.items[0].version must be a version",
    });
    expect(hasProblemCode(error, "gate_rejected")).toBe(false);
  });
});

describe("formControlPath", () => {
  const CASES: readonly (readonly [string | undefined, readonly string[] | null])[] = [
    ["body/budgetNanoAiu", ["budgetNanoAiu"]],
    ["body/models/review-defect", ["models", "review-defect"]],
    ["body/models/review-defect/model", ["models", "review-defect", "model"]],
    ["/reason", ["reason"]],
    ["/models", ["models"]],
    ["/models/review-defect", ["models", "review-defect"]],
    ["/packages/0", ["packages", "0"]],
    ["/a~1b/c~0d", ["a/b", "c~d"]],
    ["/a~01", ["a~1"]],
    // Not a control: the whole body, a parameter, a header, or nothing.
    [undefined, null],
    ["body", null],
    ["query.limit", null],
    ["query.colour", null],
    ["path.key", null],
    ["header.If-None-Match", null],
    ["", null],
    ["/", null],
    ["body/", null],
    ["/a//b", null],
    ["reason", null],
  ];

  it.each(CASES)("%s gives %o", (path, expected) => {
    expect(formControlPath(path)).toEqual(expected);
  });
});

describe("fieldErrors", () => {
  it("turns each entry of the errors of a problem into a path and a message", () => {
    expect(fieldErrors(problemOf("validation_failed"))).toEqual([
      { path: ["budgetNanoAiu"], message: "must be >= 1" },
      { path: ["reason"], message: "required" },
    ]);
  });

  it("keeps an error with no control path, for the form as a whole", () => {
    const error = problemToError(400, {
      type: "urn:x",
      title: "t",
      status: 400,
      code: "validation_failed",
      errors: [{ path: "body", message: "title contains a NUL character" }, { message: "no path" }],
    });
    expect(fieldErrors(error)).toEqual([
      { path: null, message: "title contains a NUL character" },
      { path: null, message: "no path" },
    ]);
  });

  it("gives none for a problem without errors and for errors that are not problems", () => {
    expect(fieldErrors(problemOf("not_found"))).toEqual([]);
    expect(fieldErrors({ kind: "network" })).toEqual([]);
    expect(fieldErrors(invalidResponse("x", "y"))).toEqual([]);
  });
});
