import { fieldErrors, type ApiError } from "@core/api/api-error";
import type {
  ModelChoice,
  ModelPlan,
  ModelPlanChange,
  ModelSlot,
  Run,
  SetStoryModelsRequest,
  SlotModel,
  Story,
} from "@core/api/types";
import { EFFORT_SOURCE_LABELS, MODEL_SLOTS, MODEL_SOURCE_LABELS, isModelSlot } from "@domain/models";
import type { EffortChoice, ModelChoiceRowSpec } from "@ui/model-choice/model-choice";

/** What one slot's two controls hold: a model as typed (blank is the default) and an effort (`""` is the default). */
export interface SlotDraft {
  readonly model: string;
  readonly effort: EffortChoice;
}

/** The drafts of the five slots. */
export type SlotDrafts = Readonly<Record<ModelSlot, SlotDraft>>;

function slotOf(plan: ModelPlan | null, name: ModelSlot): SlotModel | undefined {
  return plan?.slots.find((s) => s.slot === name);
}

/** What a slot's controls start from: what a person chose for the voyage, else blank (the default). */
export function draftOf(slot: SlotModel | undefined): SlotDraft {
  return { model: slot?.chosen?.model ?? "", effort: slot?.chosen?.reasoningEffort ?? "" };
}

/** The drafts of all five slots, from the plan as it stands. */
export function draftsOf(plan: ModelPlan | null): SlotDrafts {
  return {
    intake: draftOf(slotOf(plan, "intake")),
    planning: draftOf(slotOf(plan, "planning")),
    implementation: draftOf(slotOf(plan, "implementation")),
    "review-design": draftOf(slotOf(plan, "review-design")),
    "review-defect": draftOf(slotOf(plan, "review-defect")),
  };
}

/**
 * The choice a draft stands for. Blank is the default (`null`); a model without an effort is `{model}` (it runs at its
 * own default effort). Never an empty object: the API wants at least one property (`minProperties: 1`).
 */
export function choiceOf(draft: SlotDraft): ModelChoice | null {
  const model = draft.model.trim();
  if (model === "" && draft.effort === "") return null;
  return {
    ...(model !== "" ? { model } : {}),
    ...(draft.effort !== "" ? { reasoningEffort: draft.effort } : {}),
  };
}

function sameChoice(a: ModelChoice | null, b: ModelChoice | null): boolean {
  return a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
}

/**
 * The `models` of a `setStoryModels` request: **only the slots whose choice changed**; `null` gives a slot back to the
 * default. Empty when nothing changed (nothing is sent then).
 */
export function changedModels(plan: ModelPlan | null, drafts: SlotDrafts): ModelPlanChange {
  const changes: Partial<Record<ModelSlot, ModelChoice | null>> = {};
  for (const name of MODEL_SLOTS) {
    const now = choiceOf(drafts[name]);
    const before = choiceOf(draftOf(slotOf(plan, name)));
    if (!sameChoice(now, before)) changes[name] = now;
  }
  return changes;
}

/** The change that gives one slot back to the default: `{slot: null}`. */
export function resetChange(slot: ModelSlot): ModelPlanChange {
  const changes: Partial<Record<ModelSlot, ModelChoice | null>> = {};
  changes[slot] = null;
  return changes;
}

/** The body of `setStoryModels`: the version the user saw, the changes and, when there is one, the reason. */
export function modelsRequest(expectedVersion: number, models: ModelPlanChange, reason: string): SetStoryModelsRequest {
  return { expectedVersion, models, ...(reason !== "" ? { reason } : {}) };
}

/** The model a slot falls back to when no model is chosen for it; unknown once one is (the plan shows the chosen one). */
function defaultModelOf(slot: SlotModel): string | null {
  return slot.chosen?.model === undefined ? slot.model : null;
}

/** The effort a slot falls back to when none is chosen for it. */
function defaultEffortOf(slot: SlotModel): SlotModel["reasoningEffort"] {
  return slot.chosen?.reasoningEffort === undefined ? slot.reasoningEffort : null;
}

/**
 * The model both Lookouts would run on after the change, or `null`. Each side is the **effective** model: the typed one,
 * else the one it falls back to now. A side that goes back to the default (unknown) is not compared: the server decides
 * and its `400` shows on the right row. Compared as the server does, without case or spaces.
 */
export function lookoutsConflict(plan: ModelPlan | null, drafts: SlotDrafts): string | null {
  const effective = (name: "review-design" | "review-defect"): string => {
    const typed = drafts[name].model.trim();
    const slot = slotOf(plan, name);
    return (typed !== "" ? typed : slot === undefined ? "" : (defaultModelOf(slot) ?? "")).toLowerCase();
  };
  const design = effective("review-design");
  return design !== "" && design === effective("review-defect") ? design : null;
}

/** The rows of the model table, in the table's order, as `ah-model-choice-table` wants them. */
export function rowSpecs(plan: ModelPlan | null): readonly ModelChoiceRowSpec[] {
  return MODEL_SLOTS.flatMap((name) => {
    const slot = slotOf(plan, name);
    if (slot === undefined) return [];
    const chosen = slot.chosen !== null;
    const defaultModel = defaultModelOf(slot);
    const defaultEffort = defaultEffortOf(slot);
    return [
      {
        slot: name,
        ...(defaultModel !== null ? { defaultModel } : {}),
        ...(defaultEffort !== null ? { defaultEffort } : {}),
        ...(chosen ? { source: MODEL_SOURCE_LABELS[slot.modelSource] } : {}),
        chosen,
      },
    ];
  });
}

/** The words of a slot's source in the table: the crew's label for the model's and the effort's. */
export function sourceLabels(slot: SlotModel): { readonly model: string; readonly effort: string } {
  return { model: MODEL_SOURCE_LABELS[slot.modelSource], effort: EFFORT_SOURCE_LABELS[slot.effortSource] };
}

/** What a slot's choice reads as in "Chosen for this voyage": "claude-sonnet-5 · high", or null when nothing is chosen. */
export function chosenLabel(slot: SlotModel): string | null {
  const chosen = slot.chosen;
  if (chosen === null) return null;
  return `${chosen.model ?? "default model"} · ${chosen.reasoningEffort ?? "default"}`;
}

/**
 * The slots to mark "refused last run": the voyage is halted with `run_failed`, the last run of the slot's phase failed
 * and used the model the slot still has. A slot with no model (the agent's own) is never marked, nor is a run with none.
 */
export function refusedSlots(
  story: Story | null,
  runs: readonly Run[],
  plan: ModelPlan | null,
): ReadonlySet<ModelSlot> {
  const refused = new Set<ModelSlot>();
  if (story === null || plan === null || story.status !== "halted" || story.haltReason !== "run_failed") return refused;
  for (const slot of plan.slots) {
    let last: Run | null = null;
    for (const run of runs)
      if (run.phase === slot.phase && (last === null || run.createdAt > last.createdAt)) last = run;
    if (last !== null && last.status === "failed" && last.model !== null && last.model === slot.model) {
      refused.add(slot.slot);
    }
  }
  return refused;
}

/** The slot `?change=` names, or null: the query string is untrusted and anything but a slot is ignored. */
export function parseChangeSlot(value: string | null): ModelSlot | null {
  return value !== null && isModelSlot(value) ? value : null;
}

/** The server's messages for a `400`, by the row they are about (the rest shows in the dialog's banner). */
export type SlotErrors = Readonly<Partial<Record<ModelSlot, string>>>;

/**
 * Places the `errors` of a `400 validation_failed` on the rows. A path that names a slot (`/models/planning/model`) goes
 * to that row; a message about both reviewers (path `/models`) goes to both Lookout rows.
 */
export function slotErrors(error: ApiError): SlotErrors {
  const bySlot: Partial<Record<ModelSlot, string>> = {};
  for (const { path, message } of fieldErrors(error)) {
    const named = path?.find(isModelSlot);
    if (named !== undefined) {
      bySlot[named] = message;
    } else if (path?.[0] === "models" && message.includes("review-design") && message.includes("review-defect")) {
      bySlot["review-design"] = message;
      bySlot["review-defect"] = message;
    }
  }
  return bySlot;
}
