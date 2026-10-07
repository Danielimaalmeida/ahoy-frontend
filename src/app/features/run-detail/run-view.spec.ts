import type { RunProgressSpend } from "@core/api/run-progress";
import type { AhoyEvent, GateRecord, Run } from "@core/api/types";
import type { ProgressEntry } from "@core/stores/run-progress-buffer";
import {
  effortSourceLabel,
  isRunActive,
  momentLabel,
  neighbours,
  oldestFirst,
  revisionRound,
  runTiles,
  toLiveSteps,
} from "./run-view";

function aRun(over: Partial<Run> = {}): Run {
  return {
    id: "r-04",
    storyKey: "PROJ-123",
    phase: "planning",
    agent: "cartographer",
    model: "claude-sonnet-5",
    reasoningEffort: "high",
    status: "succeeded",
    runtime: "k8s",
    controlSha: "a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302",
    budgetNanoAiu: 21_440_000_000,
    usage: { requests: 11, nanoAiu: 3_840_000_000, inputTokens: 164_000, outputTokens: 18_000 },
    replayOf: null,
    exitReason: "ok",
    gate: null,
    startedBy: "ahoy-reconciler",
    createdAt: "2026-10-06T09:00:00.000Z",
    startedAt: "2026-10-06T09:31:00.000Z",
    endedAt: "2026-10-06T09:47:12.000Z",
    ...over,
  };
}

function aGate(over: Partial<GateRecord> = {}): GateRecord {
  return {
    id: "g1",
    source: "human",
    gate: "plan_accepted",
    phase: "plan_review",
    outcome: "send_back",
    message: null,
    actor: "jordan@example.com",
    runId: null,
    createdAt: "2026-10-06T08:00:00.000Z",
    ...over,
  };
}

function aSpend(nanoAiu: number, requests: number): RunProgressSpend {
  return {
    kind: "spend",
    runId: "r-04",
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

const NOW = new Date("2026-10-06T09:40:00.000Z");

describe("isRunActive and oldestFirst", () => {
  it("tells a run still on from one that ended", () => {
    expect(isRunActive(aRun({ status: "running" }))).toBe(true);
    expect(isRunActive(aRun({ status: "queued" }))).toBe(true);
    expect(isRunActive(aRun({ status: "failed" }))).toBe(false);
  });

  it("orders by creation, then id", () => {
    const runs = [
      aRun({ id: "c", createdAt: "2026-10-06T10:00:00.000Z" }),
      aRun({ id: "b", createdAt: "2026-10-06T09:00:00.000Z" }),
      aRun({ id: "a", createdAt: "2026-10-06T09:00:00.000Z" }),
    ];
    expect(oldestFirst(runs).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("neighbours", () => {
  const runs = [
    aRun({ id: "r-03", createdAt: "2026-10-06T08:00:00.000Z" }),
    aRun({ id: "r-04", createdAt: "2026-10-06T09:00:00.000Z" }),
    aRun({ id: "r-05", createdAt: "2026-10-06T10:00:00.000Z" }),
  ];

  it("gives the runs on either side, whatever order the list came in", () => {
    const { prev, next } = neighbours([...runs].reverse(), "r-04");
    expect([prev?.id, next?.id]).toEqual(["r-03", "r-05"]);
  });

  it("has no previous run at the first one and no next run at the last one", () => {
    expect(neighbours(runs, "r-03")).toMatchObject({ prev: null, next: { id: "r-04" } });
    expect(neighbours(runs, "r-05")).toMatchObject({ prev: { id: "r-04" }, next: null });
  });

  it("has neither for a run that is not in the list", () => {
    expect(neighbours(runs, "r-99")).toEqual({ prev: null, next: null });
  });
});

describe("revisionRound", () => {
  it("is 2 for a planning run queued after one human send-back at the plan gate", () => {
    expect(revisionRound(aRun(), [aGate()])).toBe(2);
  });

  it("counts every send-back before the run, and none after it", () => {
    const gates = [
      aGate({ id: "g1", createdAt: "2026-10-06T07:00:00.000Z" }),
      aGate({ id: "g2", createdAt: "2026-10-06T08:00:00.000Z" }),
      aGate({ id: "g3", createdAt: "2026-10-06T11:00:00.000Z" }),
    ];
    expect(revisionRound(aRun(), gates)).toBe(3);
  });

  it("is null for the first round, which the records cannot tell apart from an unrevised run", () => {
    expect(revisionRound(aRun(), [])).toBeNull();
    expect(revisionRound(aRun(), [aGate({ outcome: "approve" })])).toBeNull();
  });

  it("ignores automated verdicts and send-backs of other gates", () => {
    const gates = [aGate({ source: "gate", gate: "plan" }), aGate({ phase: "pr_review", gate: "pr_accepted" })];
    expect(revisionRound(aRun(), gates)).toBeNull();
  });

  it("is null for a phase that is not revised", () => {
    expect(revisionRound(aRun({ phase: "intake" }), [aGate()])).toBeNull();
  });

  it("counts review send-backs for an implementation run", () => {
    expect(revisionRound(aRun({ phase: "implementation" }), [aGate({ phase: "pr_review", gate: "pr_accepted" })])).toBe(
      2,
    );
  });
});

describe("effortSourceLabel", () => {
  function queued(runId: unknown, effortSource: unknown): AhoyEvent {
    return {
      id: "1",
      storyKey: "PROJ-123",
      type: "run.queued",
      actor: "ahoy-reconciler",
      payload: { runId, effortSource },
      createdAt: "2026-10-06T09:00:00.000Z",
    };
  }

  it("words the source of the run's own queue event", () => {
    expect(effortSourceLabel([queued("r-03", "configuration"), queued("r-04", "story")], "r-04")).toBe(
      "Chosen for this voyage",
    );
  });

  it("is null when the run has no queue event, or its source is missing or not one of the known words", () => {
    expect(effortSourceLabel([], "r-04")).toBeNull();
    expect(effortSourceLabel([queued("r-04", undefined)], "r-04")).toBeNull();
    expect(effortSourceLabel([queued("r-04", "toString")], "r-04")).toBeNull();
    expect(effortSourceLabel([queued("r-04", 3)], "r-04")).toBeNull();
  });
});

describe("momentLabel", () => {
  it("shows a moment with seconds", () => {
    const at = new Date(2026, 9, 6, 9, 30, 58).toISOString();
    expect(momentLabel(at)).toBe("Tue 09:30:58");
  });

  it("shows a dash for no moment or an invalid one", () => {
    expect(momentLabel(null)).toBe("—");
    expect(momentLabel("not a date")).toBe("—");
  });
});

describe("runTiles", () => {
  it("gives the four tiles of an ended run from what the API charged", () => {
    const tiles = runTiles(aRun(), aSpend(9_000_000_000, 40), NOW);
    expect(tiles).toMatchObject({
      spent: "3.84",
      cap: "21.44",
      requests: 11,
      tokens: "182k",
      tokensDetail: "164k in · 18k out",
    });
    expect(tiles.percent).toBeGreaterThan(17);
    expect(tiles.percent).toBeLessThan(19);
    expect(tiles.duration).toBe("16 m 12 s");
    expect(tiles.range).toMatch(/^\w{3} \d\d:\d\d → \d\d:\d\d$/);
  });

  it("follows the latest spend while the run is on, and runs the duration up to now", () => {
    const run = aRun({ status: "running", endedAt: null });
    const tiles = runTiles(run, aSpend(5_000_000_000, 15), NOW);
    expect(tiles.spent).toBe("5.00");
    expect(tiles.requests).toBe(15);
    expect(tiles.duration).toBe("9 m");
    expect(tiles.range).toMatch(/→ now$/);
  });

  it("uses the run's own usage while the run is on and no spend came yet", () => {
    expect(runTiles(aRun({ status: "running", endedAt: null }), null, NOW).spent).toBe("3.84");
  });

  it("says so when the run has not started", () => {
    const tiles = runTiles(aRun({ status: "queued", startedAt: null, endedAt: null }), null, NOW);
    expect(tiles.duration).toBe("—");
    expect(tiles.range).toBe("Not started yet");
  });
});

describe("toLiveSteps", () => {
  it("keeps steps and gaps in order, with each step's time", () => {
    const entries: ProgressEntry[] = [
      { kind: "gap", count: 29 },
      {
        kind: "step",
        step: { kind: "tool", runId: "r-04", line: 9, tool: "edit", summary: "plan.md" },
        at: "2026-10-06T09:46:40.000Z",
        eventId: "1",
      },
      {
        kind: "step",
        step: { kind: "message", runId: "r-04", line: 10, text: "Ready." },
        at: "2026-10-06T09:47:05.000Z",
        eventId: "2",
      },
    ];
    expect(toLiveSteps(entries)).toEqual([
      { kind: "gap", count: 29 },
      { kind: "tool", at: "2026-10-06T09:46:40.000Z", tool: "edit", summary: "plan.md" },
      { kind: "message", at: "2026-10-06T09:47:05.000Z", text: "Ready." },
    ]);
  });
});
