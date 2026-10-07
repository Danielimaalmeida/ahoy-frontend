/**
 * Provisional shapes for the API resources the UI reads, with domain names.
 *
 * Lane 2A re-exports the generated `schema.d.ts` under these names; until it lands this file defines the minimum
 * locally (only the fields the domain layer needs), so the swap is a replacement, not a redesign. See "Needs from
 * lane 2A" in `docs/progress.md`.
 */

/** Lifecycle status of a voyage (`Story` in the API). */
export type StoryStatus = "ready" | "running" | "awaiting_input" | "awaiting_decision" | "halted" | "terminal";

/** Delivery phases, in order, plus `blocked` for a voyage that ran aground (G12). */
export type Phase =
  "intake" | "planning" | "plan_review" | "implementation" | "pr_review" | "delivery_gate" | "done" | "blocked";

/** Status of a crew member's run. */
export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "lost"
  | "cancelled"
  | "timed_out"
  | "auth_failed"
  | "output_violation"
  | "budget_exceeded";

/** Result of an automated check or a human gate. */
export type GateOutcome =
  "pass" | "approve" | "branch" | "send_back" | "fail" | "error" | "reject" | "halt" | "waiting";

/** Slot that holds the model for a phase; the two review slots are the two Lookouts. */
export type ModelSlot = "intake" | "planning" | "implementation" | "review-design" | "review-defect";

/** Reasoning effort a model can be asked for; absent means the model's own default. */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** Where the model a phase will use comes from. */
export type ModelSource = "revision" | "story" | "configuration" | "phase_table" | "agent_profile";

/** Where the reasoning effort comes from. */
export type EffortSource = ModelSource | "model_default";

/** Why a voyage anchored (the API enum). */
export type HaltReason =
  | "stopped_by_user"
  | "gate_rejected"
  | "budget_exhausted"
  | "run_failed"
  | "run_lost"
  | "run_result_invalid"
  | "dispatch_failed"
  | "revision_ceiling_reached"
  | "reconciler_error";

export interface Story {
  readonly key: string;
  readonly title: string;
  readonly status: StoryStatus;
  readonly phase: Phase;
  readonly version: number;
  readonly owner: string;
  readonly budgetNanoAiu: number;
  readonly spentNanoAiu: number;
  readonly updatedAt: string;
  readonly haltReason?: HaltReason | string;
}

export interface Run {
  readonly id: string;
  readonly phase: Phase;
  readonly agent: string;
  readonly status: RunStatus;
  readonly model: string;
  readonly reasoningEffort?: ReasoningEffort | null;
  readonly budgetNanoAiu: number;
  readonly spentNanoAiu: number;
  readonly startedAt?: string | null;
  readonly endedAt?: string | null;
}

export interface Question {
  readonly id: string;
  readonly storyKey: string;
  readonly round: number;
  readonly text: string;
  readonly answered: boolean;
}

export interface GateRecord {
  readonly id: string;
  readonly gate: string;
  readonly phase: Phase;
  readonly source: "gate" | "human";
  readonly outcome: GateOutcome;
  readonly at: string;
  readonly actor?: string;
  readonly runId?: string;
}

export interface Artifact {
  readonly path: string;
  readonly revision: number;
  readonly size: number;
}

export interface AhoyEvent {
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly storyKey?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface SlotModel {
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly modelSource: ModelSource;
  readonly effortSource: EffortSource;
}

export interface ModelPlan {
  readonly slots: Readonly<Partial<Record<ModelSlot, SlotModel>>>;
}
