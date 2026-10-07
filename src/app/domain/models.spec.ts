import { CREW, EFFORT_SOURCE_LABELS, MODEL_SLOTS, MODEL_SOURCE_LABELS, crewLabel, reviewersConflict } from "./models";
import type { ModelPlan, ModelSlot, SlotModel } from "./types";

/** A slot of a model plan, shaped as the API sends it. */
function slot(name: ModelSlot, model: string | null): SlotModel {
  return {
    slot: name,
    phase: name === "review-design" || name === "review-defect" ? "pr_review" : name,
    lens: name === "review-design" ? "design-fit" : name === "review-defect" ? "defect-failure" : null,
    chosen: null,
    model,
    reasoningEffort: null,
    modelSource: "configuration",
    effortSource: "configuration",
  };
}

describe("MODEL_SLOTS", () => {
  it("lists the five slots in table order", () => {
    expect(MODEL_SLOTS).toEqual(["intake", "planning", "implementation", "review-design", "review-defect"]);
  });
});

describe("CREW", () => {
  const CASES: readonly (readonly [ModelSlot, string])[] = [
    ["intake", "Navigator"],
    ["planning", "Cartographer"],
    ["implementation", "Implementer"],
    ["review-design", "Lookout · design"],
    ["review-defect", "Lookout · defects"],
  ];

  for (const [slotName, crew] of CASES) {
    it(`shows ${crew} for ${slotName}`, () => {
      expect(CREW[slotName]).toBe(crew);
    });
  }
});

describe("MODEL_SOURCE_LABELS", () => {
  it("uses the vocabulary tags", () => {
    expect(MODEL_SOURCE_LABELS).toEqual({
      revision: "This revision only",
      story: "Chosen for this voyage",
      configuration: "Server default",
      phase_table: "Agent config",
      agent_profile: "Agent's own",
    });
  });
});

describe("EFFORT_SOURCE_LABELS", () => {
  it("has exactly the contract's effort sources: no agent_profile", () => {
    expect(Object.keys(EFFORT_SOURCE_LABELS).sort()).toEqual([
      "configuration",
      "model_default",
      "phase_table",
      "revision",
      "story",
    ]);
  });

  it("keeps the model sources and adds the model's own default", () => {
    expect(EFFORT_SOURCE_LABELS["model_default"]).toBe("Model's own");
    expect(EFFORT_SOURCE_LABELS["configuration"]).toBe("Server default");
    expect(EFFORT_SOURCE_LABELS["story"]).toBe("Chosen for this voyage");
  });
});

describe("crewLabel", () => {
  it("names the crew member of a slot", () => {
    expect(crewLabel("review-design")).toBe("Lookout · design");
  });

  it("falls back to the free-text agent from the API (G14)", () => {
    expect(crewLabel("some_phase", "Cartographer")).toBe("Cartographer");
  });

  it("trims the API text and falls back to the slot name when it is empty", () => {
    expect(crewLabel("some_phase", "  Navigator  ")).toBe("Navigator");
    expect(crewLabel("some_phase", "   ")).toBe("some_phase");
    expect(crewLabel("some_phase")).toBe("some_phase");
  });
});

describe("reviewersConflict", () => {
  /** A plan as `getStoryModels` answers it: a list with one entry per slot. */
  function plan(...slots: SlotModel[]): ModelPlan {
    return { storyKey: "PROJ-123", version: 9, slots };
  }

  it("returns the model both Lookouts would run on", () => {
    const conflict = plan(slot("review-design", "claude-sonnet-5"), slot("review-defect", "claude-sonnet-5"));
    expect(reviewersConflict(conflict)).toBe("claude-sonnet-5");
  });

  it("finds the Lookouts wherever they are in the list", () => {
    const conflict = plan(
      slot("review-defect", "claude-sonnet-5"),
      slot("intake", "gpt-5.6-terra"),
      slot("review-design", "claude-sonnet-5"),
    );
    expect(reviewersConflict(conflict)).toBe("claude-sonnet-5");
  });

  it("returns null when the two Lookouts differ", () => {
    const ok = plan(slot("review-design", "gpt-5.6-terra"), slot("review-defect", "claude-sonnet-5"));
    expect(reviewersConflict(ok)).toBeNull();
  });

  it("does not take two other slots on one model for a conflict", () => {
    const other = plan(slot("planning", "claude-sonnet-5"), slot("implementation", "claude-sonnet-5"));
    expect(reviewersConflict(other)).toBeNull();
  });

  it("returns null when a slot is missing, blank or the server decides", () => {
    expect(reviewersConflict(plan(slot("review-design", "gpt-5.6-terra")))).toBeNull();
    expect(reviewersConflict(plan(slot("review-design", null), slot("review-defect", null)))).toBeNull();
    expect(reviewersConflict(plan(slot("review-design", "  "), slot("review-defect", "  ")))).toBeNull();
    expect(reviewersConflict(plan())).toBeNull();
  });

  it("returns null when there is no plan yet", () => {
    expect(reviewersConflict(null)).toBeNull();
  });
});
