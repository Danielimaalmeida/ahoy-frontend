import { IN_PORT, statusPresentation } from "./status";
import type { StatusModifier } from "./status";
import type { Phase, StoryStatus } from "./types";

describe("statusPresentation", () => {
  const CASES: readonly (readonly [StoryStatus, Phase | null, string, StatusModifier, string])[] = [
    ["ready", null, "Queued", "queued", "ready"],
    ["running", null, "Under way", "running", "running"],
    ["awaiting_input", null, "Crew asks", "input", "awaiting_input"],
    ["awaiting_decision", null, "Your orders", "decision", "awaiting_decision"],
    ["halted", null, "Anchored", "halted", "halted"],
    ["terminal", "done", "Docked", "done", "terminal"],
    ["terminal", "blocked", "Aground", "blocked", "terminal"],
  ];

  for (const [status, phase, label, modifier, api] of CASES) {
    it(`shows ${status}${phase === null ? "" : ` · ${phase}`} as "${label}"`, () => {
      expect(statusPresentation(status, phase)).toEqual({ label, modifier, api });
    });
  }

  it("falls back to Docked for a terminal voyage whose phase is not blocked", () => {
    expect(statusPresentation("terminal", null).label).toBe("Docked");
    expect(statusPresentation("terminal", "done").modifier).toBe("done");
  });
});

describe("IN_PORT", () => {
  it("is the API status that groups Docked and Aground", () => {
    expect(IN_PORT).toBe("terminal");
  });
});
