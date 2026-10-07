import type { ModelPlan, Run, SlotModel } from "@core/api/types";
import { currentRunView, lastRun, modelLabel, runCrew, slotsForPhase } from "./crew";

function run(id: string, phase: string, status: Run["status"], createdAt: string, agent = "cartographer"): Run {
  return {
    id,
    storyKey: "PROJ-123",
    phase,
    agent,
    model: null,
    reasoningEffort: null,
    status,
    runtime: "fake",
    controlSha: "a41f9c2",
    budgetNanoAiu: 1,
    usage: { requests: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0 },
    replayOf: null,
    exitReason: null,
    gate: null,
    startedBy: "ahoy-reconciler",
    createdAt,
    startedAt: null,
    endedAt: null,
  };
}

function slot(
  name: SlotModel["slot"],
  phase: string,
  model: string | null,
  effort: SlotModel["reasoningEffort"],
): SlotModel {
  return {
    slot: name,
    phase,
    lens: null,
    chosen: null,
    model,
    reasoningEffort: effort,
    modelSource: "configuration",
    effortSource: "configuration",
  };
}

const PLAN: ModelPlan = {
  storyKey: "PROJ-123",
  version: 3,
  slots: [
    slot("intake", "intake", "gpt-5.6-terra", "medium"),
    slot("planning", "planning", "claude-sonnet-5", "high"),
    slot("implementation", "implementation", "claude-sonnet-5", null),
    slot("review-design", "pr_review", "gpt-5.6-terra", "high"),
    slot("review-defect", "pr_review", null, null),
  ],
};

describe("slotsForPhase", () => {
  it("finds the one slot of a phase, the two Lookouts of pr_review, and none for a phase without an agent", () => {
    expect(slotsForPhase(PLAN, "planning").map((s) => s.slot)).toEqual(["planning"]);
    expect(slotsForPhase(PLAN, "pr_review").map((s) => s.slot)).toEqual(["review-design", "review-defect"]);
    expect(slotsForPhase(PLAN, "plan_review")).toEqual([]);
    expect(slotsForPhase(null, "planning")).toEqual([]);
  });
});

describe("modelLabel", () => {
  it("words the model and effort as the Models table does", () => {
    expect(modelLabel(PLAN.slots[1]!)).toBe("claude-sonnet-5 · high");
    expect(modelLabel(PLAN.slots[2]!)).toBe("claude-sonnet-5 · default");
    expect(modelLabel(PLAN.slots[4]!)).toBe("the agent's own model · default");
  });
});

describe("runCrew", () => {
  it("names the crew member by phase, else by the API's agent", () => {
    expect(runCrew(run("r-1", "planning", "running", "2026-10-06T08:00:00Z"))).toBe("Cartographer");
    expect(runCrew(run("r-2", "pr_review", "running", "2026-10-06T08:00:00Z", "review-defect"))).toBe(
      "Lookout · defects",
    );
    expect(runCrew(run("r-3", "pr_review", "running", "2026-10-06T08:00:00Z", "lookout"))).toBe("lookout");
  });
});

describe("lastRun", () => {
  it("takes the run created last, whatever the order of the list", () => {
    const runs = [
      run("r-02", "planning", "succeeded", "2026-10-06T08:10:00Z"),
      run("r-03", "planning", "failed", "2026-10-06T08:30:00Z"),
      run("r-01", "intake", "succeeded", "2026-10-06T08:00:00Z"),
    ];
    expect(lastRun(runs)?.id).toBe("r-03");
    expect(lastRun([])).toBeNull();
  });
});

describe("currentRunView", () => {
  const runs = [
    run("r-01", "intake", "succeeded", "2026-10-06T08:00:00Z"),
    run("r-02", "planning", "running", "2026-10-06T08:10:00Z"),
  ];

  it("shows the active run and its crew member", () => {
    expect(currentRunView("r-02", runs)).toEqual({ prefix: "", runId: "r-02", suffix: " · Cartographer" });
  });

  it("shows the active run alone while the runs are not read", () => {
    expect(currentRunView("r-09", [])).toEqual({ prefix: "", runId: "r-09", suffix: "" });
  });

  it("shows none and the last run, marked when it failed", () => {
    expect(currentRunView(null, [runs[0]!])).toEqual({ prefix: "none · last", runId: "r-01", suffix: "" });
    expect(currentRunView(null, [run("r-03", "planning", "failed", "2026-10-06T09:00:00Z")])).toEqual({
      prefix: "none · last",
      runId: "r-03",
      suffix: " (failed)",
    });
    expect(currentRunView(null, [run("r-04", "planning", "cancelled", "2026-10-06T09:00:00Z")]).suffix).toBe(
      " (cancelled)",
    );
  });

  it("shows none without runs", () => {
    expect(currentRunView(null, [])).toEqual({ prefix: "none", runId: null, suffix: "" });
  });
});
