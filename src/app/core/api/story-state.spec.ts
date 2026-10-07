import getStoryState from "@testing/fixtures/getStoryState.json";
import { DEFAULT_REVISION_CEILING, readStoryState } from "./story-state";

describe("readStoryState", () => {
  describe("on the state the API sent for PROJ-123", () => {
    const view = readStoryState(getStoryState.state);

    it("reads the acceptance criteria with their repository", () => {
      expect(view.criteria.map((c) => c.id)).toEqual(["AC1", "AC2", "AC3", "AC4", "AC5"]);
      expect(view.criteria[3]).toEqual({
        id: "AC4",
        text: "Due dates and overdue checks use the customer's timezone.",
        repo: "billing-api",
      });
    });

    it("reads the work packages, with pending for a status the state leaves unset", () => {
      expect(view.packages).toEqual([
        { id: "WP1", repo: "billing-api", agent: "implementer", status: "pending", openPr: true, dependsOn: [] },
        { id: "WP2", repo: "billing-web", agent: "implementer", status: "pending", openPr: true, dependsOn: ["WP1"] },
      ]);
    });

    it("reads the send-back rounds counted so far for each gate", () => {
      expect(view.revisions.get("plan_accepted")).toBe(1);
      expect(view.revisions.get("delivery_accepted")).toBeUndefined();
    });

    it("has no human gate entry: a send-back clears the gate's decision", () => {
      expect(view.humanGates.size).toBe(0);
    });

    it("uses the default ceiling when the state sets none", () => {
      expect(view.revisionCeiling).toBe(DEFAULT_REVISION_CEILING);
      expect(DEFAULT_REVISION_CEILING).toBe(4);
    });
  });

  it("reads a decided human gate: status, time and reason", () => {
    const view = readStoryState({
      human_gates: {
        plan_accepted: { status: "approved", timestamp: "2026-10-06T10:12:00Z", reason: "Looks right." },
        delivery_accepted: {},
      },
    });
    expect(view.humanGates.get("plan_accepted")).toEqual({
      status: "approved",
      decidedAt: "2026-10-06T10:12:00Z",
      reason: "Looks right.",
    });
    expect(view.humanGates.get("delivery_accepted")).toEqual({});
  });

  it("reads the ceiling the state sets, if it is a positive whole number", () => {
    expect(readStoryState({ revision_ceiling: 6 }).revisionCeiling).toBe(6);
    for (const bad of [0, -2, 2.5, "4", null, NaN]) {
      expect(readStoryState({ revision_ceiling: bad }).revisionCeiling).toBe(DEFAULT_REVISION_CEILING);
    }
  });

  it("keeps the status, agent and dependencies of a package that has moved on", () => {
    const view = readStoryState({
      work_packages: [
        {
          id: "WP1",
          repo: "svc",
          agent: "implementer",
          open_pr: false,
          status: "blocked",
          depends_on: ["WP0", 3, null],
        },
      ],
    });
    expect(view.packages[0]).toEqual({
      id: "WP1",
      repo: "svc",
      agent: "implementer",
      status: "blocked",
      openPr: false,
      dependsOn: ["WP0"],
    });
  });

  describe("on a state it cannot trust", () => {
    const EMPTY = {
      criteria: [],
      packages: [],
      humanGates: new Map(),
      revisions: new Map(),
      revisionCeiling: DEFAULT_REVISION_CEILING,
    };

    it.each([null, undefined, [], "state", 42, true])("reads %o as an empty state", (state) => {
      expect(readStoryState(state)).toEqual(EMPTY);
    });

    it("reads fields of the wrong type as empty", () => {
      expect(
        readStoryState({
          acceptance_criteria: "none",
          work_packages: { WP1: {} },
          human_gates: ["plan_accepted"],
          revisions: 3,
        }),
      ).toEqual(EMPTY);
    });

    it("skips entries that are not usable and keeps the others", () => {
      const view = readStoryState({
        acceptance_criteria: [
          { id: "AC1", text: "ok" },
          "AC2",
          { id: "", text: "no id" },
          { id: "AC3" },
          null,
          { id: "AC4", text: "" },
        ],
        work_packages: [{ repo: "svc" }, { id: "WP1" }, 7],
        human_gates: { a: "approved", b: { status: 3 } },
        revisions: { plan_accepted: 2, bad_fraction: 1.5, bad_negative: -1, bad_text: "2" },
      });
      expect(view.criteria).toEqual([
        { id: "AC1", text: "ok" },
        { id: "AC4", text: "" },
      ]);
      expect(view.packages).toEqual([
        { id: "WP1", repo: "", agent: "", status: "pending", openPr: false, dependsOn: [] },
      ]);
      expect(view.humanGates.get("a")).toBeUndefined();
      expect(view.humanGates.get("b")).toEqual({});
      expect([...view.revisions]).toEqual([["plan_accepted", 2]]);
    });

    it("does not let a key such as __proto__ change anything", () => {
      const state: unknown = JSON.parse(
        '{"revisions": {"__proto__": 5}, "human_gates": {"__proto__": {"status": "x"}}}',
      );
      const view = readStoryState(state);
      expect(view.revisions.get("__proto__")).toBe(5);
      expect(view.humanGates.get("__proto__")).toEqual({ status: "x" });
      expect(({} as Record<string, unknown>)["status"]).toBeUndefined();
    });

    it("ignores fields it does not know", () => {
      expect(
        readStoryState({ child_repos: [{ repo: "svc" }], lookout_reviews: [], gate_results: [], extra: 1 }),
      ).toEqual(EMPTY);
    });
  });
});
