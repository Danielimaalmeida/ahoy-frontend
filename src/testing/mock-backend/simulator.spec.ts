import type { MockAhoyServer } from "./server";
import { call, field, problemCode, testServer } from "./spec-helpers";
import { spentSoFar } from "./simulator";

const AIU = 1_000_000_000;

/** The story as the API answers it now. */
function story(server: MockAhoyServer, key: string): Record<string, unknown> {
  return call(server, "GET", `/stories/${key}`).body as Record<string, unknown>;
}

/** The types of a story's events after `after`. */
function eventTypes(server: MockAhoyServer, key: string, after = 0): string[] {
  const page = call(server, "GET", `/stories/${key}/events?after=${after}&limit=500`).body as {
    items: { type: string }[];
  };
  return page.items.map((e) => e.type);
}

/** The last event id of the whole mock. */
function lastId(server: MockAhoyServer): number {
  return server.state.lastEventId;
}

/** Sends a decision at the story's current version. */
function decide(server: MockAhoyServer, key: string, gate: string, decision: string, reason?: string) {
  const version = story(server, key)["version"];
  return call(server, "POST", `/stories/${key}/decisions`, {
    gate,
    decision,
    expectedVersion: version,
    ...(reason !== undefined ? { reason } : {}),
  });
}

describe("Simulator · a voyage from set sail to done", () => {
  it("runs intake, asks, plans, takes a send-back, revises, and docks after both gates", () => {
    const { server, clock } = testServer({ seed: false });
    call(server, "POST", "/stories", { key: "DEMO-1", title: "Show order totals", budgetNanoAiu: 30 * AIU });
    expect(story(server, "DEMO-1")["status"]).toBe("ready");

    clock.advance(1_000); // the reconciler queues the intake run
    expect(story(server, "DEMO-1")).toMatchObject({ status: "running", phase: "intake" });
    const intakeRun = String(story(server, "DEMO-1")["currentRunId"]);
    expect(intakeRun).toMatch(/^demo-1-intake-001-[0-9a-f]{4}$/);
    clock.advance(1_000); // dispatched
    expect(call(server, "GET", `/runs/${intakeRun}`).body).toMatchObject({
      status: "running",
      model: "claude-haiku-4.5",
    });
    clock.advance(2_000); // two batches: intake is done
    expect(story(server, "DEMO-1")).toMatchObject({ status: "ready", phase: "planning", spentNanoAiu: 400_000_000 });
    expect(call(server, "GET", `/runs/${intakeRun}`).body).toMatchObject({
      status: "succeeded",
      gate: { gate: "intake", result: "pass", code: 0 },
    });

    clock.advance(6_000); // planning run 1: queue, dispatch, four batches, questions
    expect(story(server, "DEMO-1")).toMatchObject({ status: "awaiting_input", phase: "planning" });
    const questions = call(server, "GET", "/stories/DEMO-1/questions").body as {
      items: { id: string; consumed: boolean }[];
    };
    expect(questions.items.map((q) => q.id)).toEqual(["Q1", "Q2"]);

    for (const q of questions.items) {
      const answer = call(server, "POST", `/stories/DEMO-1/questions/${q.id}/answer`, {
        answer: "POC test answer, not a product decision",
        expectedVersion: story(server, "DEMO-1")["version"],
      });
      expect(answer.status).toBe(202);
    }
    expect(story(server, "DEMO-1")["status"]).toBe("ready");

    clock.advance(6_000); // planning run 2 writes the plan; then the human gate opens
    clock.advance(1_000);
    expect(story(server, "DEMO-1")).toMatchObject({ status: "awaiting_decision", phase: "plan_review" });
    const consumed = call(server, "GET", "/stories/DEMO-1/questions").body as { items: { consumed: boolean }[] };
    expect(consumed.items.every((q) => q.consumed)).toBe(true);
    const plan1 = String(call(server, "GET", "/stories/DEMO-1/artifacts/content?path=implementation-plan.md").body);
    expect(plan1).toContain("# Implementation plan: DEMO-1 Show order totals");

    const sentBack = decide(server, "DEMO-1", "plan_accepted", "send_back", "Add the empty state.");
    expect(sentBack.status).toBe(202);
    expect(field(sentBack, "story")).toMatchObject({ phase: "planning", status: "ready" });
    const state = field(call(server, "GET", "/stories/DEMO-1/state"), "state") as Record<string, unknown>;
    expect(state["revisions"]).toEqual({ plan_accepted: 1 });
    expect(state["human_gates"]).toEqual({});

    clock.advance(7_000); // planning run 3 answers the send-back
    expect(story(server, "DEMO-1")).toMatchObject({ status: "awaiting_decision", phase: "plan_review" });
    const plan2 = String(call(server, "GET", "/stories/DEMO-1/artifacts/content?path=implementation-plan.md").body);
    expect(plan2).toContain("Answers the review: Add the empty state.");
    const archived = call(server, "GET", "/stories/DEMO-1/artifacts/content?path=implementation-plan.round1.md");
    expect(archived.body).toBe(plan1);

    expect(decide(server, "DEMO-1", "plan_accepted", "approve").status).toBe(202);
    clock.advance(30_000); // implementation, two reviews, the delivery gate
    expect(story(server, "DEMO-1")).toMatchObject({ status: "awaiting_decision", phase: "delivery_gate" });
    const runs = call(server, "GET", "/stories/DEMO-1/runs").body as { items: { phase: string; model: string }[] };
    const reviews = runs.items.filter((r) => r.phase === "pr_review");
    expect(reviews.map((r) => r.model)).toEqual(["claude-sonnet-5", "gpt-5.6-terra"]);

    const done = decide(server, "DEMO-1", "delivery_accepted", "approve");
    expect(field(done, "story")).toMatchObject({ phase: "done", status: "terminal" });
    expect(clock.waiting).toBe(0);
    expect(story(server, "DEMO-1")["spentNanoAiu"]).toBe(
      400_000_000 + 3 * 1_800_000_000 + 4_200_000_000 + 2 * 900_000_000,
    );
  });

  it("writes the events of a run in the reconciler's order, with one spend closing each batch", () => {
    const { server, clock } = testServer({ seed: false });
    call(server, "POST", "/stories", { key: "DEMO-2", budgetNanoAiu: 30 * AIU });
    clock.advance(4_000);
    expect(eventTypes(server, "DEMO-2")).toEqual([
      "story.started",
      "run.queued",
      "run.dispatched",
      "run.progress",
      "run.progress",
      "run.progress",
      "run.progress",
      "run.progress",
      "run.progress",
      "run.finished",
      "gate.evaluated",
      "artifacts.updated",
      "story.phase_changed",
    ]);
    const page = call(server, "GET", "/stories/DEMO-2/events?limit=500").body as {
      items: { type: string; payload: Record<string, unknown> }[];
    };
    const progress = page.items.filter((e) => e.type === "run.progress").map((e) => e.payload);
    expect(progress.map((p) => p["kind"])).toEqual(["message", "tool", "spend", "tool", "message", "spend"]);
    expect(progress.map((p) => p["line"])).toEqual([2, 3, 3, 4, 5, 5]);
    expect(progress.at(-1)).toMatchObject({ steps: 4, omitted: 0, events: 6, nanoAiu: 400_000_000 });
  });

  it("rejects to blocked, and refuses a sixth round at the ceiling of four", () => {
    const { server, clock } = testServer();
    expect(field(decide(server, "PROJ-123", "plan_accepted", "reject", "Out of scope."), "story")).toMatchObject({
      phase: "blocked",
      status: "terminal",
    });
    expect(clock.waiting).toBeGreaterThan(0); // the other seeds still move

    const other = testServer();
    for (let round = 2; round <= 4; round++) {
      expect(decide(other.server, "PROJ-123", "plan_accepted", "send_back", `Round ${round}.`).status).toBe(202);
      other.clock.advance(7_000);
      expect(story(other.server, "PROJ-123")["status"]).toBe("awaiting_decision");
    }
    const ceiling = decide(other.server, "PROJ-123", "plan_accepted", "send_back", "Once more.");
    expect([ceiling.status, problemCode(ceiling), field(ceiling, "detail")]).toEqual([
      409,
      "revision_ceiling_reached",
      "plan_accepted has already been revised 4 time(s), at the ceiling of 4",
    ]);
  });

  it("stops a running story, cancels its run a moment later, and resumes it once the run has ended", () => {
    const { server, clock } = testServer();
    const before = story(server, "PROJ-140");
    const runId = String(before["currentRunId"]);
    const stopped = call(server, "POST", "/stories/PROJ-140/stop", {
      expectedVersion: before["version"],
      reason: "Wrong repo",
    });
    expect(stopped.body).toMatchObject({ status: "halted", haltReason: "stopped_by_user", currentRunId: runId });
    const early = call(server, "POST", "/stories/PROJ-140/resume", { expectedVersion: field(stopped, "version") });
    expect([problemCode(early), field(early, "detail")]).toEqual([
      "invalid_state",
      `Run ${runId} is still stopping; resume once it has ended`,
    ]);
    clock.advance(500);
    expect(call(server, "GET", `/runs/${runId}`).body).toMatchObject({ status: "cancelled", exitReason: "cancelled" });
    const now = story(server, "PROJ-140");
    expect(now["currentRunId"]).toBeNull();
    const resumed = call(server, "POST", "/stories/PROJ-140/resume", { expectedVersion: now["version"] });
    expect(resumed.body).toMatchObject({ status: "ready", haltReason: null });
    clock.advance(2_000);
    expect(story(server, "PROJ-140")["currentRunId"]).toMatch(/^proj-140-planning-002-/);
  });

  it("lets the seeded PROJ-140 run finish into plan review, after the steps it had logged", () => {
    const { server, clock } = testServer();
    const lastSeeded = lastId(server);
    clock.advance(10_000);
    expect(story(server, "PROJ-140")).toMatchObject({ status: "awaiting_decision", phase: "plan_review" });
    const page = call(server, "GET", `/stories/PROJ-140/events?after=${lastSeeded}&limit=500`).body as {
      items: { type: string; payload: Record<string, unknown> }[];
    };
    const lines = page.items.filter((e) => e.type === "run.progress").map((e) => Number(e.payload["line"]));
    expect(lines[0]).toBe(44);
    expect(page.items.find((e) => e.type === "run.progress" && e.payload["kind"] === "spend")?.payload["omitted"]).toBe(
      38,
    );
  });

  it("halts on budget_exhausted when a run costs more than the story has left", () => {
    const { server, clock } = testServer({ seed: false });
    call(server, "POST", "/stories", { key: "DEMO-3", budgetNanoAiu: 300_000_000 });
    clock.advance(4_000);
    const halted = story(server, "DEMO-3");
    expect(halted).toMatchObject({ status: "halted", haltReason: "budget_exhausted", spentNanoAiu: 300_000_000 });
    const runs = call(server, "GET", "/stories/DEMO-3/runs").body as { items: Record<string, unknown>[] };
    expect(runs.items[0]).toMatchObject({ status: "budget_exceeded", budgetNanoAiu: 300_000_000 });
    const raised = call(server, "POST", "/stories/DEMO-3/budget", {
      expectedVersion: halted["version"],
      budgetNanoAiu: 5 * AIU,
      reason: "More room",
    });
    expect(raised.body).toMatchObject({ status: "halted" }); // the budget alone does not resume
    const resumed = call(server, "POST", "/stories/DEMO-3/resume", { expectedVersion: field(raised, "version") });
    expect(resumed.body).toMatchObject({ status: "ready" });
    clock.advance(4_000);
    expect(story(server, "DEMO-3")).toMatchObject({ phase: "planning" });
  });

  it("increases the story's version on every change, the reconciler's included", () => {
    const { server, clock } = testServer({ seed: false });
    call(server, "POST", "/stories", { key: "DEMO-4", budgetNanoAiu: 30 * AIU });
    const versions: number[] = [];
    for (let i = 0; i < 6; i++) {
      versions.push(Number(story(server, "DEMO-4")["version"]));
      clock.advance(1_000);
    }
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions.at(-1)).toBeGreaterThan(versions[0] ?? 0);
  });

  it("reset brings the seeds back and forgets every change", () => {
    const { server } = testServer();
    call(server, "POST", "/stories", { key: "DEMO-5", budgetNanoAiu: AIU });
    server.switches.latencyMs = 300;
    server.reset();
    expect(call(server, "GET", "/stories/DEMO-5").status).toBe(404);
    expect(server.switches.latencyMs).toBe(0);
    expect(story(server, "PROJ-123")["version"]).toBe(9);
  });
});

describe("spentSoFar", () => {
  it("gives a run's share of its cost after its ticks, rounded down in integers", () => {
    expect(spentSoFar({ cost: 7, ticks: 1, totalTicks: 3 })).toBe(2);
    expect(spentSoFar({ cost: 4_200_000_001, ticks: 3, totalTicks: 4 })).toBe(3_150_000_000);
    expect(spentSoFar({ cost: 1_800_000_000, ticks: 4, totalTicks: 4 })).toBe(1_800_000_000);
  });
});
