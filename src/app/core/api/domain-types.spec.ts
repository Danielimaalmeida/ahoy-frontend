import { IN_PORT, statusPresentation } from "@domain/status";
import { outcomePresentation } from "@domain/outcome";
import { CREW, EFFORT_SOURCE_LABELS, MODEL_SOURCE_LABELS, reviewersConflict } from "@domain/models";
import type * as Domain from "@domain/types";
import getStoryModels from "@testing/fixtures/getStoryModels.json";
import { isModelPlan } from "./guards";
import * as Api from "./types";

/**
 * `domain/` may not import `core/`, so `@domain/types` repeats the shapes of the contract. The contract is sovereign:
 * these tests fail, at `npm run typecheck` or here, when the two drift apart, instead of a screen failing later.
 */
describe("@domain/types is the contract", () => {
  it("has the same enums as the generated types", () => {
    expectTypeOf<Domain.StoryStatus>().toEqualTypeOf<Api.StoryStatus>();
    expectTypeOf<Domain.RunStatus>().toEqualTypeOf<Api.RunStatus>();
    expectTypeOf<Domain.GateOutcome>().toEqualTypeOf<Api.GateOutcome>();
    expectTypeOf<Domain.ModelSlot>().toEqualTypeOf<Api.ModelSlot>();
    expectTypeOf<Domain.ReasoningEffort>().toEqualTypeOf<Api.ReasoningEffort>();
    expectTypeOf<Domain.ModelSource>().toEqualTypeOf<Api.ModelSource>();
    expectTypeOf<Domain.EffortSource>().toEqualTypeOf<Api.EffortSource>();
  });

  it("has the same resources as the generated types, field for field", () => {
    expectTypeOf<Domain.Story>().toEqualTypeOf<Api.Story>();
    expectTypeOf<Domain.Usage>().toEqualTypeOf<Api.Usage>();
    expectTypeOf<Domain.GateVerdict>().toEqualTypeOf<Api.GateVerdict>();
    expectTypeOf<Domain.Run>().toEqualTypeOf<Api.Run>();
    expectTypeOf<Domain.Question>().toEqualTypeOf<Api.Question>();
    expectTypeOf<Domain.GateRecord>().toEqualTypeOf<Api.GateRecord>();
    expectTypeOf<Domain.Artifact>().toEqualTypeOf<Api.Artifact>();
    expectTypeOf<Domain.AhoyEvent>().toEqualTypeOf<Api.AhoyEvent>();
    expectTypeOf<Domain.ModelChoice>().toEqualTypeOf<Api.ModelChoice>();
    expectTypeOf<Domain.SlotModel>().toEqualTypeOf<Api.SlotModel>();
    expectTypeOf<Domain.ModelPlan>().toEqualTypeOf<Api.ModelPlan>();
  });

  it("takes a phase as the contract does: any string", () => {
    expectTypeOf<Domain.Phase>().toEqualTypeOf<string>();
    expectTypeOf<Api.Story["phase"]>().toEqualTypeOf<string>();
  });
});

describe("the domain functions take real API values", () => {
  it("statusPresentation takes a Story's status and phase as the API sends them", () => {
    const story: Api.Story = {
      key: "PROJ-102",
      title: null,
      owner: "jordan@example.com",
      phase: "blocked",
      status: "terminal",
      haltReason: null,
      budgetNanoAiu: 25_000_000_000,
      spentNanoAiu: 12_400_000_000,
      controlSha: "1890d5aa84819480275f79060cae5d529be21ee8",
      currentRunId: null,
      version: 7,
      createdAt: "2026-10-06T09:00:00.000Z",
      updatedAt: "2026-10-06T09:48:00.000Z",
    };
    expect(statusPresentation(story.status, story.phase).label).toBe("Aground");
  });

  it("reviewersConflict takes the plan getStoryModels answers (the fixture): a list of slots", () => {
    const plan: unknown = getStoryModels;
    if (!isModelPlan(plan)) throw new Error("getStoryModels.json is not a ModelPlan");
    expect(Array.isArray(plan.slots)).toBe(true);
    expect(reviewersConflict(plan)).toBeNull();
    const design = plan.slots.find((slot) => slot.slot === "review-design");
    const sameModel = {
      ...plan,
      slots: plan.slots.map((slot) =>
        slot.slot === "review-defect" ? { ...slot, model: design?.model ?? null } : slot,
      ),
    };
    expect(reviewersConflict(sameModel)).toBe(design?.model);
  });

  it("every status, outcome and effort source of the contract has a presentation, and none is neutral by accident", () => {
    const neutralOnPurpose = new Set(["queued", "cancelled"]);
    for (const value of [...Api.RUN_STATUSES, ...Api.GATE_OUTCOMES])
      if (!neutralOnPurpose.has(value)) expect(outcomePresentation(value).modifier, value).not.toBe("queued");
    for (const status of Api.STORY_STATUSES) expect(statusPresentation(status, "done").label, status).not.toBe("");
    expect(Object.keys(CREW).sort()).toEqual([...Api.MODEL_SLOTS].sort());
    expect(Object.keys(MODEL_SOURCE_LABELS).sort()).toEqual([...Api.MODEL_SOURCES].sort());
    expect(Object.keys(EFFORT_SOURCE_LABELS).sort()).toEqual([...Api.EFFORT_SOURCES].sort());
    expect(IN_PORT).toBe("terminal");
  });
});
