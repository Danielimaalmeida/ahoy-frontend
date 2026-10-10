/**
 * The API resources the UI reads, with domain names. They have the shapes of `openapi/ahoy-v1.yaml`, which is sovereign:
 * a field, a name or an enum value is here because the contract has it. They are written out because `domain/` may not
 * import `core/`; `core/api/domain-types.spec.ts` fails when one stops being identical to the type generated from the
 * contract (`core/api/types.ts`), so a real value can always be passed to a domain function.
 *
 * Every field is `readonly`. AIU amounts are integer nano-AIU (1 AIU = 1_000_000_000).
 */

/** Lifecycle status of a voyage (`Story` in the API). */
export type StoryStatus =
  | 'ready'
  | 'running'
  | 'awaiting_input'
  | 'awaiting_decision'
  | 'halted'
  | 'terminal';

/**
 * A phase of the pinned `phases.tsv`, or `blocked` (G12). The API sends any string, so this is not a closed union: the
 * seven phases the UI knows are `PHASES` in `phases.ts`.
 */
export type Phase = string;

/** Status of a crew member's run. */
export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'awaiting_input'
  | 'failed'
  | 'budget_exceeded'
  | 'timed_out'
  | 'cancelled'
  | 'output_violation'
  | 'auth_failed'
  | 'lost';

/**
 * What a gate record says: an automated result or a person's decision. `waiting` is not one of them: the API has no
 * record for a human gate nobody has decided yet (see `outcomePresentation`).
 */
export type GateOutcome =
  | 'pass'
  | 'fail'
  | 'error'
  | 'branch'
  | 'halt'
  | 'reject'
  | 'approve'
  | 'send_back';

/** Slot that holds the model for a phase. */
export type ModelSlot = 'intake' | 'planning' | 'implementation' | 'review';

/** Reasoning effort a model can be asked for; null means the model's own default. */
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Where the model a phase will use comes from. */
export type ModelSource =
  'revision' | 'story' | 'configuration' | 'phase_table' | 'agent_profile';

/** Where the reasoning effort comes from. It has no `agent_profile`: an effort is never left to the agent's profile. */
export type EffortSource =
  'revision' | 'story' | 'configuration' | 'phase_table' | 'model_default';

/** Why a voyage anchored: the nine codes the UI explains. The API's `haltReason` is free text, so it is a `string`. */
export type HaltReason =
  | 'stopped_by_user'
  | 'gate_rejected'
  | 'budget_exhausted'
  | 'run_failed'
  | 'run_lost'
  | 'run_result_invalid'
  | 'dispatch_failed'
  | 'revision_ceiling_reached'
  | 'reconciler_error';

/** What a run or a story has used so far. */
export interface Usage {
  readonly requests: number;
  readonly nanoAiu: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** A voyage. `version` is what every command sends back as `expectedVersion`. */
export interface Story {
  readonly key: string;
  readonly title: string | null;
  readonly owner: string;
  readonly phase: Phase;
  readonly status: StoryStatus;
  readonly haltReason: string | null;
  readonly budgetNanoAiu: number;
  readonly spentNanoAiu: number;
  readonly controlSha: string;
  readonly currentRunId: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The verdict of the gate that judged a run's output. */
export interface GateVerdict {
  readonly gate: string;
  readonly code: number;
  readonly result: 'pass' | 'fail' | 'error' | 'branch' | 'halt' | 'reject';
  readonly message: string;
}

/** A worker run of one agent. What it spent is `usage.nanoAiu`. */
export interface Run {
  readonly id: string;
  readonly storyKey: string;
  readonly phase: Phase;
  readonly agent: string;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly status: RunStatus;
  readonly runtime: string;
  readonly controlSha: string;
  readonly budgetNanoAiu: number;
  readonly usage: Usage;
  readonly replayOf: string | null;
  readonly exitReason: string | null;
  readonly gate: GateVerdict | null;
  readonly startedBy: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

/** A question an agent asked. It is answered when `answer` is not null. */
export interface Question {
  readonly id: string;
  readonly round: number;
  readonly runId: string;
  readonly text: string;
  readonly recommendation: string | null;
  readonly answer: string | null;
  readonly answeredBy: string | null;
  readonly answeredAt: string | null;
  readonly consumed: boolean;
  /** Set when an intake refresh made the question history: shown, never answered, never counted as waiting. */
  readonly supersededAt: string | null;
}

/** An automated gate verdict or a person's decision. */
export interface GateRecord {
  readonly id: string;
  readonly source: 'gate' | 'human';
  readonly gate: string;
  readonly phase: Phase;
  readonly outcome: GateOutcome;
  readonly message: string | null;
  readonly actor: string;
  readonly runId: string | null;
  readonly createdAt: string;
}

/** A file an agent wrote, at one revision of the voyage's artifact set. */
export interface Artifact {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly revision: number;
  readonly runId: string | null;
  readonly createdAt: string;
}

/** An event of the voyage's log or of the live stream. `payload` is type-specific and untrusted. */
export interface AhoyEvent {
  readonly id: string;
  readonly storyKey: string;
  readonly type: string;
  readonly actor: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/** A model, a reasoning effort, or both, as a person chose them. */
export interface ModelChoice {
  readonly model?: string;
  readonly reasoningEffort?: ReasoningEffort;
}

/** What one slot of the model plan will run on, and where each value comes from. */
export interface SlotModel {
  readonly slot: ModelSlot;
  readonly phase: Phase;
  readonly chosen: ModelChoice | null;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly modelSource: ModelSource;
  readonly effortSource: EffortSource;
}

/** The model and reasoning effort each slot of a voyage runs on. `slots` is a list, one entry per slot. */
export interface ModelPlan {
  readonly storyKey: string;
  readonly version: number;
  readonly slots: readonly SlotModel[];
}
