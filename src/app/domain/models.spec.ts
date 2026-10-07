import { CREW, EFFORT_SOURCE_LABELS, MODEL_SLOTS, MODEL_SOURCE_LABELS, crewLabel, reviewersConflict } from "./models";
import type { ModelPlan, ModelSlot, SlotModel } from "./types";

function slot(model: string | null): SlotModel {
  return { model, reasoningEffort: null, modelSource: "configuration", effortSource: "configuration" };
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
  function plan(slots: Partial<Record<ModelSlot, SlotModel>>): ModelPlan {
    return { slots };
  }

  it("returns the model both Lookouts would run on", () => {
    const conflict = plan({ "review-design": slot("claude-sonnet-5"), "review-defect": slot("claude-sonnet-5") });
    expect(reviewersConflict(conflict)).toBe("claude-sonnet-5");
  });

  it("returns null when the two Lookouts differ", () => {
    const ok = plan({ "review-design": slot("gpt-5.6-terra"), "review-defect": slot("claude-sonnet-5") });
    expect(reviewersConflict(ok)).toBeNull();
  });

  it("returns null when a slot is missing, blank or the server decides", () => {
    expect(reviewersConflict(plan({ "review-design": slot("gpt-5.6-terra") }))).toBeNull();
    expect(reviewersConflict(plan({ "review-design": slot(null), "review-defect": slot(null) }))).toBeNull();
    expect(reviewersConflict(plan({ "review-design": slot("  "), "review-defect": slot("  ") }))).toBeNull();
  });

  it("returns null when there is no plan yet", () => {
    expect(reviewersConflict(null)).toBeNull();
  });
});
