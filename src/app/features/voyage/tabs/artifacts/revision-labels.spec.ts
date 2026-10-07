import { describe, expect, it } from "vitest";
import type { AhoyEvent } from "@core/api/types";
import { revisionOptions } from "./revision-labels";

let nextId = 1;

/** An event with a loose payload (the API's is untrusted). */
function event(type: string, payload: Record<string, unknown> = {}): AhoyEvent {
  return {
    id: String(nextId++),
    storyKey: "PROJ-123",
    type,
    actor: "ahoy-reconciler",
    payload: payload as AhoyEvent["payload"],
    createdAt: "2026-10-06T09:48:00Z",
  };
}

const labels = (events: readonly AhoyEvent[], current: number): string[] =>
  revisionOptions(events, current).map((option) => option.label);

describe("revisionOptions", () => {
  it("lists the revisions from the current one down to 1, newest first", () => {
    expect(revisionOptions([], 3).map((option) => option.revision)).toEqual([3, 2, 1]);
  });

  it("lists nothing before the first revision", () => {
    expect(revisionOptions([], 0)).toEqual([]);
  });

  it("labels a revision with no matching event as plain Revision N, and the current one as current", () => {
    expect(labels([], 2)).toEqual(["Revision 2 · current", "Revision 1"]);
  });

  it("labels the revision a run made with the run's id, from the run.finished just before it", () => {
    const events = [event("run.finished", { runId: "r-04" }), event("artifacts.updated", { revision: 5 })];
    expect(labels(events, 5)[0]).toBe("Revision 5 · current (r-04)");
  });

  it("labels a revision made by a send-back from the decision.recorded just before it", () => {
    const events = [
      event("decision.recorded", { gate: "plan_accepted", decision: "send_back", round: 1 }),
      event("artifacts.updated", { revision: 4 }),
    ];
    expect(labels(events, 5)[1]).toBe("Revision 4 (send-back)");
  });

  it("leaves no note when a gate.evaluated sits between the run and the update (the mock's order)", () => {
    const events = [
      event("run.finished", { runId: "r-01" }),
      event("gate.evaluated", { runId: "r-01", gate: "intake", result: "pass" }),
      event("artifacts.updated", { revision: 1 }),
    ];
    expect(labels(events, 1)).toEqual(["Revision 1 · current"]);
  });

  it("leaves no note when a story.phase_changed sits between the send-back and the update", () => {
    const events = [
      event("decision.recorded", { decision: "send_back" }),
      event("story.phase_changed", { from: "plan_review", to: "planning" }),
      event("artifacts.updated", { revision: 3 }),
    ];
    expect(labels(events, 3)[0]).toBe("Revision 3 · current");
  });

  it("does not take a label from an event further back, nor from an approval", () => {
    const furtherBack = [
      event("run.finished", { runId: "r-01" }),
      event("gate.evaluated", { gate: "plan", result: "pass" }),
      event("artifacts.updated", { revision: 2 }),
    ];
    const approval = [
      event("run.finished", { runId: "r-01" }),
      event("decision.recorded", { decision: "approve" }),
      event("artifacts.updated", { revision: 2 }),
    ];
    expect(labels(furtherBack, 2)[0]).toBe("Revision 2 · current");
    expect(labels(approval, 2)[0]).toBe("Revision 2 · current");
  });

  it("does not read a runId from the update's own payload (the contract does not fix one there)", () => {
    expect(labels([event("artifacts.updated", { revision: 2, runId: "r-09" })], 2)[0]).toBe("Revision 2 · current");
  });

  it("ignores an update whose revision is not a positive whole number, and keeps the first for a repeated one", () => {
    const events = [
      event("run.finished", { runId: "r-01" }),
      event("artifacts.updated", { revision: "2" }),
      event("artifacts.updated", { revision: 1.5 }),
      event("artifacts.updated", { revision: 0 }),
      event("run.finished", { runId: "r-02" }),
      event("artifacts.updated", { revision: 1 }),
      event("run.finished", { runId: "r-03" }),
      event("artifacts.updated", { revision: 1 }),
    ];
    expect(labels(events, 2)).toEqual(["Revision 2 · current", "Revision 1 (r-02)"]);
  });

  it("reports the note on its own, for the selectors and the links", () => {
    const events = [event("run.finished", { runId: "r-04" }), event("artifacts.updated", { revision: 2 })];
    expect(revisionOptions(events, 2)[0]).toMatchObject({ revision: 2, current: true, note: "r-04" });
    expect(revisionOptions(events, 2)[1]).toMatchObject({ revision: 1, current: false, note: null });
  });
});
