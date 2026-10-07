import { HALT_REASONS } from "@domain/halt";
import type { HaltReason } from "@domain/types";
import { haltGuidance } from "./halt-guidance";

const AIU = 1_000_000_000;
const CONTEXT = { phase: "planning", remainingNanoAiu: 10_200_000_000 };

/** What each reason's step must say: the action that gets the voyage moving again. */
const EXPECTED: Readonly<Record<HaltReason, RegExp>> = {
  stopped_by_user: /^read the reason above/,
  gate_rejected: /^open the run's gate verdict in Gates/,
  budget_exhausted: /^raise the budget, then resume/,
  run_failed: /^pick a model this account can use for planning/,
  run_lost: /^check the run in Runs/,
  run_result_invalid: /^look at the run's output in Runs and Artifacts/,
  dispatch_failed: /^resume to try starting the run again/,
  revision_ceiling_reached: /^the plan can't be sent back again/,
  reconciler_error: /^this is a fault inside Ahoy/,
};

describe("haltGuidance", () => {
  for (const reason of Object.keys(HALT_REASONS) as HaltReason[]) {
    it(`tells what to do for ${reason}`, () => {
      const text = haltGuidance(reason, CONTEXT);
      expect(text).toMatch(EXPECTED[reason]);
      expect(text.endsWith(".")).toBe(true);
    });
  }

  it("covers each of the nine reasons with its own step", () => {
    const texts = (Object.keys(HALT_REASONS) as HaltReason[]).map((reason) => haltGuidance(reason, CONTEXT));
    expect(texts).toHaveLength(9);
    expect(new Set(texts).size).toBe(9);
  });

  it("matches the Halted wireframe for a refused planning model", () => {
    expect(haltGuidance("run_failed", CONTEXT)).toBe(
      "pick a model this account can use for planning, or fix what the run's log points at, then resume. " +
        "Resuming retries planning and may spend from the remaining 10.2 AIU.",
    );
  });

  it("says what a resume may spend, from the remaining budget", () => {
    expect(haltGuidance("stopped_by_user", { phase: "implementation", remainingNanoAiu: 3 * AIU })).toContain(
      "Resuming retries implementation and may spend from the remaining 3.0 AIU.",
    );
  });

  it("does not promise spending when the budget is exhausted", () => {
    const text = haltGuidance("budget_exhausted", { phase: "planning", remainingNanoAiu: 0 });
    expect(text).not.toContain("may spend");
    expect(text).toContain("Raising it doesn't resume the voyage on its own.");
  });

  it("sends an unknown reason to the technical line instead of guessing", () => {
    const text = haltGuidance("worker_on_fire", CONTEXT);
    expect(text).toMatch(/^check the technical line below and the Ship's log/);
    expect(text).not.toContain("worker_on_fire");
  });
});
