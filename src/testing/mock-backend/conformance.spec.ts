import contract from "@testing/fixtures/openapi.json";
import { operations, responseViolations, schemaNamed, violations } from "@testing/fixtures/contract";
import { isRecord, type MockRequest, type MockResponse } from "./http";
import type { MockAhoyServer } from "./server";
import { call, testServer } from "./spec-helpers";

const AIU = 1_000_000_000;

/** Every request the mock answered, with its answer. */
interface Exchange {
  readonly request: MockRequest;
  readonly response: MockResponse;
}

/** Records every exchange of `server`. */
function record(server: MockAhoyServer): Exchange[] {
  const seen: Exchange[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request: MockRequest): MockResponse => {
    const response = handle(request);
    seen.push({ request, response });
    return response;
  };
  return seen;
}

/** The contract operation a request was for, by method and path template. */
function operationOf(
  request: MockRequest,
): { readonly operationId: string; readonly statuses: readonly string[] } | null {
  const paths = isRecord(contract.paths) ? (contract.paths as Readonly<Record<string, unknown>>) : {};
  for (const op of operations()) {
    const pattern = new RegExp(`^${op.path.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    if (op.method !== request.method.toUpperCase() || !pattern.test(request.path)) continue;
    const item = paths[op.path];
    const operation = isRecord(item) ? item[op.method.toLowerCase()] : undefined;
    const responses = isRecord(operation) && isRecord(operation["responses"]) ? operation["responses"] : {};
    return { operationId: op.operationId, statuses: Object.keys(responses) };
  }
  return null;
}

/** Drives every operation of phases 3 to 6, on every seed and through a whole voyage, happy and not. */
function exercise(server: MockAhoyServer, advance: (ms: number) => void): void {
  const get = (path: string) => call(server, "GET", path);
  const post = (path: string, body: unknown) => call(server, "POST", path, body);
  const version = (key: string) => (get(`/stories/${key}`).body as { version: number }).version;

  get("/health");
  get("/stories");
  get("/stories?limit=2");
  get("/stories?status=terminal&limit=500");
  const page = get("/stories?limit=3").body as { nextCursor: string };
  get(`/stories?limit=3&cursor=${page.nextCursor}`);
  for (const key of [...server.state.voyages.keys()]) {
    get(`/stories/${key}`);
    const runs = get(`/stories/${key}/runs`).body as { items: { id: string }[] };
    for (const run of runs.items) get(`/runs/${run.id}`);
    get(`/stories/${key}/questions`);
    get(`/stories/${key}/gates`);
    get(`/stories/${key}/models`);
    get(`/stories/${key}/state`);
    const artifacts = get(`/stories/${key}/artifacts`).body as { items: { path: string }[] };
    for (const a of artifacts.items) get(`/stories/${key}/artifacts/content?path=${a.path}`);
    get(`/stories/${key}/events?limit=500`);
    get(`/stories/${key}/events?after=5&limit=1`);
  }

  // A whole voyage, with every command.
  post("/stories", {
    key: "DEMO-1",
    title: "Conformance voyage",
    budgetNanoAiu: 40 * AIU,
    controlRef: "0123456789abcdef0123456789abcdef01234567",
    models: { planning: { model: "claude-sonnet-5", reasoningEffort: "max" } },
  });
  advance(12_000);
  for (const id of ["Q1", "Q2"])
    post(`/stories/DEMO-1/questions/${id}/answer`, {
      answer: "POC test answer, not a product decision",
      expectedVersion: version("DEMO-1"),
    });
  advance(8_000);
  post("/stories/DEMO-1/decisions", {
    gate: "plan_accepted",
    decision: "send_back",
    reason: "Add the empty state.",
    expectedVersion: version("DEMO-1"),
  });
  advance(8_000);
  post("/stories/DEMO-1/models", {
    expectedVersion: version("DEMO-1"),
    models: { planning: null, "review-design": { model: "claude-opus-5" } },
    reason: "Try another reviewer",
  });
  post("/stories/DEMO-1/budget", { expectedVersion: version("DEMO-1"), budgetNanoAiu: 50 * AIU, reason: "More room" });
  post("/stories/DEMO-1/decisions", { gate: "plan_accepted", decision: "approve", expectedVersion: version("DEMO-1") });
  advance(2_500);
  post("/stories/DEMO-1/stop", { expectedVersion: version("DEMO-1"), reason: "Pause" });
  advance(1_000);
  post("/stories/DEMO-1/resume", { expectedVersion: version("DEMO-1"), reason: "Go on" });
  advance(40_000);
  post("/stories/DEMO-1/decisions", {
    gate: "delivery_accepted",
    decision: "approve",
    reason: "Ship it",
    expectedVersion: version("DEMO-1"),
  });
  post("/stories/PROJ-123/decisions", {
    gate: "plan_accepted",
    decision: "reject",
    reason: "Out of scope",
    expectedVersion: version("PROJ-123"),
  });
  for (const key of ["DEMO-1", "PROJ-140", "PROJ-109"]) {
    get(`/stories/${key}/runs`);
    get(`/stories/${key}/state`);
    get(`/stories/${key}/events?limit=500`);
    const artifacts = get(`/stories/${key}/artifacts`).body as { items: { path: string }[] };
    for (const a of artifacts.items) get(`/stories/${key}/artifacts/content?path=${a.path}&revision=1`);
  }

  // Errors.
  call(server, "GET", "/stories", undefined, { "X-Ahoy-Actor": "" });
  get("/stories?limit=0");
  get("/stories?cursor=nope");
  get("/stories/PROJ-999");
  get("/runs/nothing");
  post("/stories", { key: "DEMO-1", budgetNanoAiu: 1 });
  post("/stories", {
    key: "DEMO-2",
    budgetNanoAiu: 1,
    models: { "review-design": { model: "x" }, "review-defect": { model: "X" } },
  });
  post("/stories/PROJ-131/stop", { expectedVersion: 1, reason: "Old" });
  post("/stories/PROJ-118/stop", { expectedVersion: version("PROJ-118"), reason: "Again" });
  post("/stories/PROJ-131/questions/Q1/answer", { answer: "Twice", expectedVersion: version("PROJ-131") });
  post("/stories/PROJ-131/decisions", {
    gate: "plan_accepted",
    decision: "approve",
    expectedVersion: version("PROJ-131"),
  });
  post("/stories/PROJ-140/decisions", {
    gate: "delivery_accepted",
    decision: "approve",
    expectedVersion: version("PROJ-140"),
  });
  post("/stories/PROJ-102/budget", { expectedVersion: version("PROJ-102"), budgetNanoAiu: 1, reason: "Less" });
  post("/stories/PROJ-118/unblock", { reason: "Phase 7", expectedVersion: version("PROJ-118") });
  get("/stories/PROJ-123/artifacts/content?path=missing.md");
  call(server, "PUT", "/stories/PROJ-123");
  server.switches.failNext = 503;
  get("/health");
  server.switches.conflictNext = "stale_version";
  post("/stories/PROJ-131/resume", { expectedVersion: version("PROJ-131") });
}

describe("the mock against openapi/ahoy-v1.yaml", () => {
  const { server, clock } = testServer();
  const exchanges = record(server);
  exercise(server, (ms) => clock.advance(ms));

  it("was exercised on every operation of phases 3 to 6", () => {
    const used = new Set(exchanges.map((e) => operationOf(e.request)?.operationId));
    for (const op of [
      "getHealth",
      "listStories",
      "startStory",
      "getStory",
      "stopStory",
      "resumeStory",
      "setStoryBudget",
      "getStoryModels",
      "setStoryModels",
      "listStoryRuns",
      "getRun",
      "listQuestions",
      "answerQuestion",
      "listGateRecords",
      "decideHumanGate",
      "getStoryState",
      "listArtifacts",
      "getArtifactContent",
      "listStoryEvents",
    ])
      expect(used.has(op), op).toBe(true);
    const statuses = new Set(exchanges.map((e) => e.response.status));
    for (const status of [200, 201, 202, 400, 401, 404, 409, 422, 500, 503])
      expect(statuses.has(status), String(status)).toBe(true);
  });

  it("answers every success with a body its operation's schema accepts", () => {
    const problems: string[] = [];
    for (const { request, response } of exchanges) {
      const op = operationOf(request);
      if (!op || response.status >= 300 || response.kind !== "json") continue;
      for (const v of responseViolations(op.operationId, response.body))
        problems.push(`${request.method} ${request.path} (${op.operationId}): ${v}`);
    }
    expect(problems).toEqual([]);
  });

  it("answers every success with a status its operation declares", () => {
    const problems: string[] = [];
    for (const { request, response } of exchanges) {
      const op = operationOf(request);
      if (op && response.status < 400 && !op.statuses.includes(String(response.status)))
        problems.push(`${op.operationId} answered ${response.status}`);
    }
    expect(problems).toEqual([]);
  });

  it("answers every error with a Problem, with a status its operation declares (or 500, which any may)", () => {
    const problems: string[] = [];
    const problem = schemaNamed("Problem");
    for (const { request, response } of exchanges) {
      if (response.status < 400) continue;
      if (response.kind !== "json") {
        problems.push(`${request.path}: ${response.status} is not problem+json`);
        continue;
      }
      expect(response.headers["Content-Type"]).toBe("application/problem+json; charset=utf-8");
      for (const v of violations(problem, response.body)) problems.push(`${request.path}: ${v}`);
      const body = response.body as { status: number; code: string; type: string; title: string };
      if (body.status !== response.status) problems.push(`${request.path}: body status ${body.status}`);
      if (body.type !== `urn:ahoy:problem:${body.code}` || body.title !== body.code.replaceAll("_", " "))
        problems.push(`${request.path}: type or title not as the real API writes them`);
      const op = operationOf(request);
      const declared = op === null || response.status === 500 || op.statuses.includes(String(response.status));
      if (!declared) problems.push(`${op?.operationId}: undeclared ${response.status}`);
    }
    expect(problems).toEqual([]);
  });

  it("serves artifact text whose ETag and media type match the listing", () => {
    const problems: string[] = [];
    for (const { request, response } of exchanges) {
      if (operationOf(request)?.operationId !== "getArtifactContent" || response.status !== 200) continue;
      const key = request.path.split("/")[2] ?? "";
      const path = request.query.get("path");
      const revision = request.query.get("revision");
      if (revision !== null) continue;
      const listed = (
        call(server, "GET", `/stories/${key}/artifacts`).body as {
          items: { path: string; sha256: string; mediaType: string }[];
        }
      ).items;
      const entry = listed.find((a) => a.path === path);
      if (response.kind !== "text") problems.push(`${request.path}: not text`);
      if (entry === undefined) continue; // a later change replaced the set; the earlier answer was for its own revision
      if (response.headers["ETag"] !== `"${entry.sha256}"` || response.headers["Content-Type"] !== entry.mediaType)
        problems.push(`${key} ${path}: ETag or media type differs from the listing`);
    }
    expect(problems).toEqual([]);
  });

  it("writes only events the Event schema accepts, and run.progress payloads RunProgressPayload accepts", () => {
    const event = schemaNamed("Event");
    const progress = schemaNamed("RunProgressPayload");
    const problems: string[] = [];
    for (const e of server.state.events) {
      for (const v of violations(event, e)) problems.push(`event ${e.id} (${e.type}): ${v}`);
      if (e.type === "run.progress")
        for (const v of violations(progress, e.payload)) problems.push(`event ${e.id}: ${v}`);
    }
    expect(server.state.events.length).toBeGreaterThan(300);
    expect(problems).toEqual([]);
  });

  it("gives every event a greater id than the one before, in time order", () => {
    const events = server.state.events;
    for (let i = 1; i < events.length; i++) {
      expect(Number(events[i]?.id)).toBe(Number(events[i - 1]?.id) + 1);
      expect((events[i]?.createdAt ?? "") >= (events[i - 1]?.createdAt ?? "")).toBe(true);
    }
  });
});
