import type { RunProgressSpend } from "@core/api/run-progress";
import type { Run } from "@core/api/types";
import type { ProgressEntry } from "@core/stores/run-progress-buffer";
import { isRunActive, oldestFirst, runModelLabel, runRequests, runSpendNanoAiu, toLiveSteps } from "./run-rows";

function aRun(over: Partial<Run> = {}): Run {
  return {
    id: "proj-123-planning-001-ab12",
    storyKey: "PROJ-123",
    phase: "planning",
    agent: "cartographer",
    model: "claude-sonnet-5",
    reasoningEffort: "high",
    status: "running",
    runtime: "fake",
    controlSha: "a41f9c2",
    budgetNanoAiu: 8_000_000_000,
    usage: { requests: 9, nanoAiu: 600_000_000, inputTokens: 0, outputTokens: 0 },
    replayOf: null,
    exitReason: null,
    gate: null,
    startedBy: "ahoy-reconciler",
    createdAt: "2026-10-06T09:00:00.000Z",
    startedAt: "2026-10-06T09:00:05.000Z",
    endedAt: null,
    ...over,
  };
}

function aSpend(nanoAiu: number, requests: number): RunProgressSpend {
  return {
    kind: "spend",
    runId: "proj-123-planning-001-ab12",
    line: 3,
    offset: 720,
    nanoAiu,
    requests,
    steps: 2,
    omitted: 0,
    skipped: 0,
    events: 3,
  };
}

describe("isRunActive", () => {
  it("is true for queued and running runs and false once a run ended, whatever the way", () => {
    expect(isRunActive(aRun({ status: "queued" }))).toBe(true);
    expect(isRunActive(aRun({ status: "running" }))).toBe(true);
    for (const status of ["succeeded", "failed", "cancelled", "awaiting_input", "budget_exceeded"] as const) {
      expect(isRunActive(aRun({ status }))).toBe(false);
    }
  });
});

describe("oldestFirst", () => {
  it("orders by creation time, then by id, without touching the list it was given", () => {
    const later = aRun({ id: "b", createdAt: "2026-10-06T10:00:00.000Z" });
    const first = aRun({ id: "z", createdAt: "2026-10-06T09:00:00.000Z" });
    const tie = aRun({ id: "a", createdAt: "2026-10-06T09:00:00.000Z" });
    const input = [later, first, tie];
    expect(oldestFirst(input).map((run) => run.id)).toEqual(["a", "z", "b"]);
    expect(input.map((run) => run.id)).toEqual(["b", "z", "a"]);
  });
});

describe("runModelLabel", () => {
  it("joins the model and the effort", () => {
    expect(runModelLabel(aRun())).toBe("claude-sonnet-5 · high");
  });

  it("says the agent's own and default when the API left them null", () => {
    expect(runModelLabel(aRun({ model: null, reasoningEffort: null }))).toBe("agent's own · default");
  });
});

describe("runSpendNanoAiu and runRequests", () => {
  it("use the latest spend while the run is active", () => {
    const run = aRun();
    expect(runSpendNanoAiu(run, aSpend(1_840_000_000, 14))).toBe(1_840_000_000);
    expect(runRequests(run, aSpend(1_840_000_000, 14))).toBe(14);
  });

  it("never fall below what the list already shows", () => {
    const run = aRun();
    expect(runSpendNanoAiu(run, aSpend(100_000_000, 2))).toBe(600_000_000);
    expect(runRequests(run, aSpend(100_000_000, 2))).toBe(9);
  });

  it("use the run's own usage before the first spend", () => {
    expect(runSpendNanoAiu(aRun(), null)).toBe(600_000_000);
    expect(runRequests(aRun(), null)).toBe(9);
  });

  it("replace the live spend with the final usage once the run ended, even if the live one was higher", () => {
    const ended = aRun({
      status: "succeeded",
      usage: { requests: 12, nanoAiu: 1_790_000_000, inputTokens: 0, outputTokens: 0 },
    });
    expect(runSpendNanoAiu(ended, aSpend(1_840_000_000, 14))).toBe(1_790_000_000);
    expect(runRequests(ended, aSpend(1_840_000_000, 14))).toBe(12);
  });
});

describe("toLiveSteps", () => {
  it("keeps the order, each step's time and each gap's count, and leaves out an absent summary", () => {
    const entries: ProgressEntry[] = [
      {
        kind: "step",
        step: { kind: "message", runId: "r", line: 2, text: "Reading." },
        at: "2026-10-06T09:00:10.000Z",
        eventId: "1",
      },
      {
        kind: "step",
        step: { kind: "tool", runId: "r", line: 3, tool: "view" },
        at: "2026-10-06T09:00:11.000Z",
        eventId: "2",
      },
      { kind: "gap", count: 38 },
      {
        kind: "step",
        step: { kind: "tool", runId: "r", line: 42, tool: "bash", summary: "ls" },
        at: "2026-10-06T09:05:00.000Z",
        eventId: "3",
      },
    ];
    const steps = toLiveSteps(entries);
    expect(steps).toEqual([
      { kind: "message", at: "2026-10-06T09:00:10.000Z", text: "Reading." },
      { kind: "tool", at: "2026-10-06T09:00:11.000Z", tool: "view" },
      { kind: "gap", count: 38 },
      { kind: "tool", at: "2026-10-06T09:05:00.000Z", tool: "bash", summary: "ls" },
    ]);
    expect("summary" in (steps[1] ?? {})).toBe(false);
  });
});
