import { HALT_REASONS, explainHalt, isHaltReason } from "./halt";
import type { HaltReason } from "./types";

/** The nine texts of `docs/design/design-system/vocabulary.md`, copied here so a rewrite fails the test. */
const VOCABULARY: readonly (readonly [HaltReason, string])[] = [
  ["stopped_by_user", "Someone on the crew stopped it. Show their reason."],
  ["gate_rejected", "An automated check rejected the crew's output, and it can't be retried automatically."],
  ["budget_exhausted", "The voyage has spent its whole AIU budget. Raise the budget, then resume."],
  ["run_failed", "A crew member's run failed, for example a refused model or a crash."],
  ["run_lost", "Ahoy lost contact with a run and can't tell how it ended."],
  ["run_result_invalid", "A run finished, but its result couldn't be read or broke the rules."],
  ["dispatch_failed", "Ahoy couldn't start the run at all. Nothing was spent."],
  ["revision_ceiling_reached", "The plan was sent back the maximum number of times (about 4)."],
  ["reconciler_error", "Something went wrong inside Ahoy while moving the voyage on."],
];

describe("HALT_REASONS", () => {
  for (const [reason, text] of VOCABULARY) {
    it(`says exactly what vocabulary.md says for ${reason}`, () => {
      expect(HALT_REASONS[reason].text).toBe(text);
    });

    it(`has a short form of ${reason} that is an exact prefix of its text`, () => {
      const info = HALT_REASONS[reason];
      expect(info.short.length).toBeGreaterThan(0);
      expect(info.text.startsWith(info.short)).toBe(true);
    });
  }

  it("covers exactly the nine API reasons", () => {
    expect(Object.keys(HALT_REASONS).sort()).toEqual(VOCABULARY.map(([reason]) => reason).sort());
  });
});

describe("isHaltReason", () => {
  it("accepts the nine API reasons", () => {
    for (const [reason] of VOCABULARY) expect(isHaltReason(reason)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHaltReason("nonsense")).toBe(false);
    expect(isHaltReason("")).toBe(false);
    expect(isHaltReason("Run_Failed")).toBe(false);
  });
});

describe("explainHalt", () => {
  it("returns the vocabulary text and the event detail, trimmed", () => {
    const explanation = explainHalt("stopped_by_user", "  Waiting for the Jira ticket to be split  ");
    expect(explanation.text).toBe("Someone on the crew stopped it. Show their reason.");
    expect(explanation.short).toBe("Someone on the crew stopped it.");
    expect(explanation.detail).toBe("Waiting for the Jira ticket to be split");
  });

  it("returns a null detail when the event has none or it is blank", () => {
    expect(explainHalt("run_failed").detail).toBeNull();
    expect(explainHalt("run_failed", "   ").detail).toBeNull();
  });

  it("shows the API code untouched for an unknown reason", () => {
    const explanation = explainHalt("some_new_reason", "detail");
    expect(explanation).toEqual({ short: "some_new_reason", text: "some_new_reason", detail: "detail" });
  });
});
