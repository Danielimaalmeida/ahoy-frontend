import { isRecord } from "./http";
import { encodeCursor } from "./server";
import { ACTOR, call, field, problemCode, testServer } from "./spec-helpers";

const AIU = 1_000_000_000;

/** A field of each item of a list answer. */
function pluck(body: unknown, name: string): unknown[] {
  if (!isRecord(body) || !Array.isArray(body["items"])) throw new Error("not a list answer");
  return body["items"].map((item: unknown) => (isRecord(item) ? item[name] : undefined));
}

describe("MockAhoyServer · routing and checks", () => {
  it("answers /health without an actor, and everything else only with X-Ahoy-Actor", () => {
    const { server } = testServer();
    expect(call(server, "GET", "/health", undefined, { "X-Ahoy-Actor": "" }).body).toEqual({
      status: "ok",
      database: "ok",
    });
    const refused = call(server, "GET", "/stories", undefined, { "X-Ahoy-Actor": " " });
    expect([refused.status, problemCode(refused), field(refused, "title")]).toEqual([
      401,
      "unauthenticated",
      "unauthenticated",
    ]);
    expect(field(refused, "type")).toBe("urn:ahoy:problem:unauthenticated");
  });

  it("answers an unknown path 404 and an unsupported method 400 with Allow", () => {
    const { server } = testServer();
    const missing = call(server, "GET", "/nowhere");
    expect([missing.status, problemCode(missing)]).toEqual([404, "not_found"]);
    const method = call(server, "DELETE", "/stories/PROJ-123");
    expect([method.status, problemCode(method), method.headers["Allow"]]).toEqual([400, "bad_request", "GET"]);
  });

  it("checks parameters and bodies against the contract, listing every difference", () => {
    const { server } = testServer();
    const query = call(server, "GET", "/stories?limit=0&limit=2&colour=red&status=lost");
    expect(problemCode(query)).toBe("validation_failed");
    expect(field(query, "errors")).toEqual([
      { path: "query.status", message: "must be equal to one of the allowed values" },
      { path: "query.limit", message: "must be given once" },
      { path: "query.limit", message: "must be >= 1" },
      { path: "query.colour", message: "is not a parameter of this operation" },
    ]);
    const key = call(server, "GET", "/stories/proj-123");
    expect(field(key, "errors")).toEqual([
      { path: "path.key", message: 'must match pattern "^[A-Z][A-Z0-9]+-[0-9]+$"' },
    ]);
    const body = call(server, "POST", "/stories/PROJ-123/budget", { expectedVersion: 9, budgetNanoAiu: 0.5 });
    expect(field(body, "errors")).toEqual([
      { path: "body", message: "must have required property 'reason'" },
      { path: "body/budgetNanoAiu", message: "must be integer" },
    ]);
    const none = call(server, "POST", "/stories/PROJ-123/stop");
    expect(field(none, "errors")).toEqual([{ path: "body", message: "is required" }]);
    const nul = call(server, "POST", "/stories/PROJ-123/stop", { expectedVersion: 9, reason: "a\u0000b" });
    expect(field(nul, "errors")).toEqual([
      { path: "body", message: "contains a NUL character, which Postgres cannot store" },
    ]);
  });

  it("answers a body that is not JSON with 400 bad_request", () => {
    const { server } = testServer();
    const response = server.handle({
      method: "POST",
      path: "/stories",
      query: new URLSearchParams(),
      headers: { "x-ahoy-actor": ACTOR },
      body: "{oops",
      bodyIsInvalidJson: true,
    });
    expect(response.status).toBe(400);
    expect(response.kind === "json" && isRecord(response.body) ? response.body["code"] : null).toBe("bad_request");
  });

  it("answers the operations of phase 7 with 500 internal_error, which any operation may", () => {
    const { server } = testServer();
    const answer = call(server, "POST", "/stories/PROJ-118/unblock", { reason: "Try again", expectedVersion: 14 });
    expect([answer.status, problemCode(answer)]).toEqual([500, "internal_error"]);
    expect(String(field(answer, "detail"))).toContain("unblockStory");
  });
});

describe("MockAhoyServer · seeds", () => {
  it("starts with the eight voyages of the wireframes, most recently updated first", () => {
    const { server } = testServer();
    const list = call(server, "GET", "/stories");
    expect(pluck(list.body, "key")).toEqual([
      "PROJ-109",
      "PROJ-123",
      "PROJ-140",
      "PROJ-131",
      "PROJ-126",
      "PROJ-118",
      "PROJ-102",
      "PROJ-097",
    ]);
    const byKey = new Map(pluck(list.body, "key").map((key, i) => [key, i]));
    const story = (key: string) => (list.body as { items: Record<string, unknown>[] }).items[byKey.get(key) ?? -1];
    expect([story("PROJ-123")?.["status"], story("PROJ-123")?.["phase"]]).toEqual(["awaiting_decision", "plan_review"]);
    expect([story("PROJ-131")?.["status"], story("PROJ-131")?.["phase"]]).toEqual(["awaiting_input", "planning"]);
    expect(story("PROJ-140")?.["status"]).toBe("running");
    expect([story("PROJ-118")?.["status"], story("PROJ-118")?.["haltReason"]]).toEqual(["halted", "run_failed"]);
    expect([story("PROJ-126")?.["status"], story("PROJ-126")?.["haltReason"]]).toEqual(["halted", "stopped_by_user"]);
    expect([story("PROJ-109")?.["status"], story("PROJ-109")?.["phase"]]).toEqual(["ready", "intake"]);
    expect([story("PROJ-097")?.["status"], story("PROJ-097")?.["phase"]]).toEqual(["terminal", "done"]);
    expect([story("PROJ-102")?.["status"], story("PROJ-102")?.["phase"]]).toEqual(["terminal", "blocked"]);
    expect(story("PROJ-123")?.["spentNanoAiu"]).toBe(12_400_000_000);
    expect(story("PROJ-123")?.["version"]).toBe(9);
  });

  it("gives PROJ-123 round 2 of 4: two answered questions, jordan's send-back and plan revision 2", () => {
    const { server } = testServer();
    expect(pluck(call(server, "GET", "/stories/PROJ-123/questions").body, "answeredBy")).toEqual([ACTOR, ACTOR]);
    const gates = call(server, "GET", "/stories/PROJ-123/gates").body;
    expect(pluck(gates, "outcome")).toEqual(["pass", "branch", "pass", "send_back", "pass"]);
    expect(pluck(gates, "actor")[3]).toBe("jordan@example.com");
    const state = field(call(server, "GET", "/stories/PROJ-123/state"), "state");
    expect(isRecord(state) && state["revisions"]).toEqual({ plan_accepted: 1 });
    const plan = call(server, "GET", "/stories/PROJ-123/artifacts/content?path=implementation-plan.md");
    expect(plan.headers["ETag"]).toBe('"c2debe2a81f6da5198e2f6df010cfbbb81d561b1c7a17a8b8e9b509ae42e135d"');
    expect(String(plan.body)).toContain("AC5 Overdue invoices");
    const archived = call(server, "GET", "/stories/PROJ-123/artifacts/content?path=implementation-plan.round1.md");
    expect(String(archived.body)).not.toContain("AC5");
  });

  it("gives PROJ-131 one answered question of three and PROJ-140 a run with a gap of 38 and a redacted line", () => {
    const { server } = testServer();
    expect(pluck(call(server, "GET", "/stories/PROJ-131/questions").body, "answer").map((a) => a !== null)).toEqual([
      true,
      false,
      false,
    ]);
    const events = call(server, "GET", "/stories/PROJ-140/events?limit=500").body;
    const payloads = (events as { items: { type: string; payload: Record<string, unknown> }[] }).items
      .filter((e) => e.type === "run.progress")
      .map((e) => e.payload);
    expect(payloads.some((p) => p["kind"] === "spend" && p["omitted"] === 38)).toBe(true);
    expect(payloads.some((p) => String(p["summary"] ?? "").includes("[REDACTED]"))).toBe(true);
    const story = call(server, "GET", "/stories/PROJ-140").body as Record<string, unknown>;
    const run = call(server, "GET", `/runs/${String(story["currentRunId"])}`);
    expect([run.status, field(run, "status"), field(run, "phase")]).toEqual([200, "running", "planning"]);
  });

  it("gives PROJ-118's halt a workerLog, and PROJ-102 jordan's rejection", () => {
    const { server } = testServer();
    const events = (
      call(server, "GET", "/stories/PROJ-118/events?limit=500").body as {
        items: { type: string; payload: Record<string, unknown> }[];
      }
    ).items;
    const halted = events.find((e) => e.type === "story.halted");
    expect(halted?.payload["reason"]).toBe("run_failed");
    expect(String(halted?.payload["workerLog"])).toContain("[REDACTED]");
    const gates = call(server, "GET", "/stories/PROJ-102/gates").body;
    expect(pluck(gates, "outcome").at(-1)).toBe("reject");
    expect(pluck(gates, "actor").at(-1)).toBe("jordan@example.com");
  });

  it("is deterministic: two servers at the same instant answer byte for byte alike", () => {
    const a = testServer().server;
    const b = testServer().server;
    for (const path of [
      "/stories",
      "/stories/PROJ-123/events?limit=500",
      "/stories/PROJ-140/runs",
      "/stories/PROJ-097/artifacts",
    ])
      expect(JSON.stringify(call(a, "GET", path).body)).toBe(JSON.stringify(call(b, "GET", path).body));
  });

  it("can start empty", () => {
    const { server } = testServer({ seed: false });
    expect(call(server, "GET", "/stories").body).toEqual({ items: [], nextCursor: null });
  });
});

describe("MockAhoyServer · reads", () => {
  it("pages stories with the real API's cursor, and refuses a cursor it did not issue", () => {
    const { server } = testServer();
    const all = pluck(call(server, "GET", "/stories").body, "key");
    const first = call(server, "GET", "/stories?limit=3");
    expect(pluck(first.body, "key")).toEqual(all.slice(0, 3));
    const cursor = String(field(first, "nextCursor"));
    expect(JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/")))).toEqual({
      t: (first.body as { items: { updatedAt: string }[] }).items[2]?.updatedAt,
      k: all[2],
    });
    const second = call(server, "GET", `/stories?limit=3&cursor=${cursor}`);
    expect(pluck(second.body, "key")).toEqual(all.slice(3, 6));
    const last = call(server, "GET", `/stories?limit=3&cursor=${String(field(second, "nextCursor"))}`);
    expect([pluck(last.body, "key"), field(last, "nextCursor")]).toEqual([all.slice(6), null]);
    expect(problemCode(call(server, "GET", "/stories?cursor=bm9wZQ"))).toBe("bad_request");
    expect(encodeCursor("2026-10-06T10:00:00.000Z", "PROJ-1")).not.toMatch(/[+/=]/);
  });

  it("filters stories by status", () => {
    const { server } = testServer();
    expect(pluck(call(server, "GET", "/stories?status=halted").body, "key").sort()).toEqual(["PROJ-118", "PROJ-126"]);
  });

  it("pages a story's events after an id, and echoes `after` when nothing is new", () => {
    const { server } = testServer();
    const page = call(server, "GET", "/stories/PROJ-123/events?limit=2");
    const ids = pluck(page.body, "id");
    expect(ids).toHaveLength(2);
    expect(field(page, "lastEventId")).toBe(ids[1]);
    const rest = call(server, "GET", `/stories/PROJ-123/events?after=${String(ids[1])}&limit=500`);
    const restIds = pluck(rest.body, "id").map(Number);
    expect(restIds.every((id, i) => i === 0 || id > (restIds[i - 1] ?? 0))).toBe(true);
    const end = String(field(rest, "lastEventId"));
    expect(call(server, "GET", `/stories/PROJ-123/events?after=${end}`).body).toEqual({ items: [], lastEventId: end });
    expect(call(server, "GET", "/stories/PROJ-109/events?after=999999").body).toEqual({
      items: [],
      lastEventId: "999999",
    });
    expect(problemCode(call(server, "GET", "/stories/PROJ-999/events"))).toBe("not_found");
  });

  it("serves artifact text with its ETag, a 304 for a match, older revisions, and 404s", () => {
    const { server } = testServer();
    const list = call(server, "GET", "/stories/PROJ-123/artifacts");
    const revision = Number(field(list, "revision"));
    expect(pluck(list.body, "path").sort()).toEqual([
      "implementation-plan.md",
      "implementation-plan.round1.md",
      "jira-snapshot.md",
    ]);
    const plan = call(server, "GET", "/stories/PROJ-123/artifacts/content?path=implementation-plan.md");
    expect([plan.status, plan.headers["Content-Type"]]).toEqual([200, "text/markdown"]);
    const same = call(server, "GET", "/stories/PROJ-123/artifacts/content?path=implementation-plan.md", undefined, {
      "If-None-Match": plan.headers["ETag"] ?? "",
    });
    expect([same.status, same.response.kind]).toEqual([304, "empty"]);
    const older = call(
      server,
      "GET",
      `/stories/PROJ-123/artifacts/content?path=implementation-plan.md&revision=${revision - 2}`,
    );
    expect(String(older.body)).not.toContain("AC5");
    expect(problemCode(call(server, "GET", "/stories/PROJ-123/artifacts/content?path=nothing.md"))).toBe("not_found");
    expect(
      problemCode(
        call(server, "GET", `/stories/PROJ-123/artifacts/content?path=jira-snapshot.md&revision=${revision + 1}`),
      ),
    ).toBe("not_found");
    expect(field(call(server, "GET", "/stories/PROJ-123/artifacts/content"), "errors")).toEqual([
      { path: "query.path", message: "is required" },
    ]);
  });

  it("answers 404 for a story, a run or a question that does not exist", () => {
    const { server } = testServer();
    expect(problemCode(call(server, "GET", "/stories/PROJ-999"))).toBe("not_found");
    expect(problemCode(call(server, "GET", "/runs/r-404"))).toBe("not_found");
    const q = call(server, "POST", "/stories/PROJ-131/questions/Q9/answer", { answer: "x", expectedVersion: 4 });
    expect([q.status, field(q, "detail")]).toEqual([404, "Story PROJ-131 has no question Q9"]);
  });

  it("renders the model plan with sources, and the state with the plan's fields", () => {
    const { server } = testServer();
    const plan = call(server, "GET", "/stories/PROJ-123/models");
    const slots = field(plan, "slots") as Record<string, unknown>[];
    expect(
      slots.map((s) => [s["slot"], s["model"], s["modelSource"], s["reasoningEffort"], s["effortSource"]]),
    ).toEqual([
      ["intake", "claude-haiku-4.5", "configuration", null, "model_default"],
      ["planning", "claude-sonnet-5", "story", "high", "story"],
      ["implementation", "gpt-5.6-terra", "phase_table", "medium", "phase_table"],
      ["review-design", "claude-sonnet-5", "configuration", "high", "configuration"],
      ["review-defect", "gpt-5.6-terra", "configuration", "xhigh", "story"],
    ]);
    expect(field(plan, "version")).toBe(9);
  });
});

describe("MockAhoyServer · commands", () => {
  it("refuses a stale expectedVersion with 409 stale_version and currentVersion", () => {
    const { server } = testServer();
    const answer = call(server, "POST", "/stories/PROJ-123/stop", { expectedVersion: 8, reason: "Wait" });
    expect([answer.status, problemCode(answer), field(answer, "currentVersion"), field(answer, "detail")]).toEqual([
      409,
      "stale_version",
      9,
      "Story PROJ-123 is at version 9, not 8",
    ]);
  });

  it("creates a story once (201 with Location), and answers 409 story_exists after", () => {
    const { server } = testServer();
    const created = call(server, "POST", "/stories", { key: "DEMO-1", title: "Demo", budgetNanoAiu: 5 * AIU });
    expect([created.status, created.headers["Location"], field(created, "owner"), field(created, "version")]).toEqual([
      201,
      "/api/v1/stories/DEMO-1",
      ACTOR,
      1,
    ]);
    expect(problemCode(call(server, "POST", "/stories", { key: "DEMO-1", budgetNanoAiu: 1 }))).toBe("story_exists");
  });

  it("refuses two reviewers on one model, at start and when changing models", () => {
    const { server } = testServer();
    const start = call(server, "POST", "/stories", {
      key: "DEMO-2",
      budgetNanoAiu: AIU,
      models: { "review-defect": { model: "Claude-Sonnet-5" } },
    });
    expect([start.status, field(start, "errors")]).toEqual([
      400,
      [{ path: "/models", message: "review-design and review-defect must run on different models" }],
    ]);
    expect(call(server, "GET", "/stories/DEMO-2").status).toBe(404);
    const change = call(server, "POST", "/stories/PROJ-123/models", {
      expectedVersion: 9,
      models: { "review-design": { model: "gpt-5.6-terra" } },
    });
    expect(problemCode(change)).toBe("validation_failed");
  });

  it("sets and clears model choices, at a new version, with story.models_changed", () => {
    const { server } = testServer();
    const set = call(server, "POST", "/stories/PROJ-123/models", {
      expectedVersion: 9,
      models: { planning: null, implementation: { model: "claude-opus-5" } },
      reason: "Try Opus",
    });
    expect(set.status).toBe(202);
    const slots = field(set, "slots") as Record<string, unknown>[];
    expect(slots[1]).toMatchObject({
      slot: "planning",
      chosen: null,
      model: "claude-sonnet-5",
      modelSource: "configuration",
    });
    expect(slots[2]).toMatchObject({
      chosen: { model: "claude-opus-5" },
      reasoningEffort: null,
      effortSource: "model_default",
    });
    expect(field(set, "version")).toBe(10);
    const events = (call(server, "GET", "/stories/PROJ-123/events?limit=500").body as { items: { type: string }[] })
      .items;
    expect(events.at(-1)?.type).toBe("story.models_changed");
  });

  it("changes the budget, but never below what is spent nor on a terminal story", () => {
    const { server } = testServer();
    const below = call(server, "POST", "/stories/PROJ-123/budget", {
      expectedVersion: 9,
      budgetNanoAiu: 12 * AIU,
      reason: "Less",
    });
    expect([problemCode(below), field(below, "detail")]).toEqual([
      "invalid_state",
      "Story PROJ-123 has already spent 12400000000 nano-AIU, more than 12000000000",
    ]);
    const ok = call(server, "POST", "/stories/PROJ-123/budget", {
      expectedVersion: 9,
      budgetNanoAiu: 40 * AIU,
      reason: "More",
    });
    expect([ok.status, field(ok, "budgetNanoAiu"), field(ok, "version")]).toEqual([202, 40 * AIU, 10]);
    expect(
      problemCode(
        call(server, "POST", "/stories/PROJ-097/budget", { expectedVersion: 21, budgetNanoAiu: 40 * AIU, reason: "x" }),
      ),
    ).toBe("invalid_state");
  });

  it("stops only what is not already halted or terminal, and resumes only what is halted", () => {
    const { server } = testServer();
    expect(problemCode(call(server, "POST", "/stories/PROJ-118/stop", { expectedVersion: 14, reason: "x" }))).toBe(
      "invalid_state",
    );
    expect(problemCode(call(server, "POST", "/stories/PROJ-123/resume", { expectedVersion: 9 }))).toBe("invalid_state");
    const resumed = call(server, "POST", "/stories/PROJ-118/resume", { expectedVersion: 14, reason: "Registry fixed" });
    expect([resumed.status, field(resumed, "status"), field(resumed, "haltReason")]).toEqual([202, "ready", null]);
  });

  it("records answers once, only while awaiting input, and makes the story ready after the last", () => {
    const { server } = testServer();
    expect(
      problemCode(
        call(server, "POST", "/stories/PROJ-131/questions/Q1/answer", { answer: "Again", expectedVersion: 4 }),
      ),
    ).toBe("already_answered");
    expect(
      problemCode(call(server, "POST", "/stories/PROJ-131/questions/Q2/answer", { answer: "  ", expectedVersion: 4 })),
    ).toBe("invalid_state");
    const q2 = call(server, "POST", "/stories/PROJ-131/questions/Q2/answer", {
      answer: "Receipt page only.",
      expectedVersion: 4,
    });
    expect([q2.status, (field(q2, "story") as Record<string, unknown>)["status"]]).toEqual([202, "awaiting_input"]);
    expect((field(q2, "question") as Record<string, unknown>)["answeredBy"]).toBe(ACTOR);
    const q3 = call(server, "POST", "/stories/PROJ-131/questions/Q3/answer", {
      answer: "On the total.",
      expectedVersion: 5,
    });
    expect((field(q3, "story") as Record<string, unknown>)["status"]).toBe("ready");
    expect(
      problemCode(call(server, "POST", "/stories/PROJ-123/questions/Q1/answer", { answer: "x", expectedVersion: 9 })),
    ).toBe("already_answered");
  });

  it("decides at a human gate only with the open gate's key and, to send back or reject, a reason", () => {
    const { server } = testServer();
    const wrong = call(server, "POST", "/stories/PROJ-123/decisions", {
      gate: "delivery_accepted",
      decision: "approve",
      expectedVersion: 9,
    });
    expect([wrong.status, problemCode(wrong)]).toEqual([422, "unsupported_gate"]);
    const bare = call(server, "POST", "/stories/PROJ-123/decisions", {
      gate: "plan_accepted",
      decision: "reject",
      expectedVersion: 9,
    });
    expect([problemCode(bare), field(bare, "errors")]).toEqual([
      "validation_failed",
      [{ path: "/reason", message: "required for send_back and reject" }],
    ]);
    expect(
      problemCode(
        call(server, "POST", "/stories/PROJ-131/decisions", {
          gate: "plan_accepted",
          decision: "approve",
          expectedVersion: 4,
        }),
      ),
    ).toBe("invalid_state");
    const approved = call(server, "POST", "/stories/PROJ-123/decisions", {
      gate: "plan_accepted",
      decision: "approve",
      expectedVersion: 9,
    });
    expect(approved.status).toBe(202);
    expect(field(approved, "record")).toMatchObject({
      source: "human",
      outcome: "approve",
      actor: ACTOR,
      message: null,
    });
    expect(field(approved, "story")).toMatchObject({ phase: "implementation", status: "ready", version: 10 });
  });
});
