/**
 * Wire types of the Ahoy API, as `openapi/ahoy-v1.yaml` (1.0.0-poc) describes them and as `guards.ts` checks them.
 *
 * These are written by hand while `schema.d.ts` cannot be generated (`openapi-typescript` is not installed yet). When it
 * is, this is the only file that changes: each type becomes an alias of `components["schemas"][...]`, and the lists of
 * values below get a type-level check against the generated enums. Nothing else imports the generated file.
 *
 * Every field is `readonly`. AIU amounts are integer nano-AIU (1 AIU = 1_000_000_000).
 */

/** The states a story can be in (`StoryStatus`). */
export const STORY_STATUSES = [
  "ready",
  "running",
  "awaiting_input",
  "awaiting_decision",
  "halted",
  "terminal",
] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

/** The states a run can be in (`RunStatus`). */
export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "awaiting_input",
  "failed",
  "budget_exceeded",
  "timed_out",
  "cancelled",
  "output_violation",
  "auth_failed",
  "lost",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** The reasoning efforts of the Copilot SDK (`ReasoningEffort`). A model may take fewer, or none. */
export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** The parts of a story that run on one model (`ModelSlot`). */
export const MODEL_SLOTS = ["intake", "planning", "implementation", "review-design", "review-defect"] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

/** The reviewer lens of a `pr_review` slot. */
export const REVIEW_LENSES = ["design-fit", "defect-failure"] as const;
export type ReviewLens = (typeof REVIEW_LENSES)[number];

/** Where a slot's model comes from (`SlotModel.modelSource`). */
export const MODEL_SOURCES = ["revision", "story", "configuration", "phase_table", "agent_profile"] as const;
export type ModelSource = (typeof MODEL_SOURCES)[number];

/** Where a slot's reasoning effort comes from (`SlotModel.effortSource`). */
export const EFFORT_SOURCES = ["revision", "story", "configuration", "phase_table", "model_default"] as const;
export type EffortSource = (typeof EFFORT_SOURCES)[number];

/** What an automated gate said about a run (`GateVerdict.result`). */
export const GATE_RESULTS = ["pass", "fail", "error", "branch", "halt", "reject"] as const;
export type GateResult = (typeof GATE_RESULTS)[number];

/** Who made a gate record: an automated gate, or a person (`GateRecord.source`). */
export const GATE_SOURCES = ["gate", "human"] as const;
export type GateSource = (typeof GATE_SOURCES)[number];

/** What a gate record says: an automated result, or a person's decision (`GateRecord.outcome`). */
export const GATE_OUTCOMES = ["pass", "fail", "error", "branch", "halt", "reject", "approve", "send_back"] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];

/** What a person can decide at a human gate (`DecisionRequest.decision`). */
export const HUMAN_DECISIONS = ["approve", "send_back", "reject"] as const;
export type HumanDecision = (typeof HUMAN_DECISIONS)[number];

/** The `code` of a problem, as the contract lists them. A newer API may send others: see {@link Problem.code}. */
export const PROBLEM_CODES = [
  "bad_request",
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "story_exists",
  "stale_version",
  "invalid_state",
  "already_answered",
  "decision_already_recorded",
  "revision_ceiling_reached",
  "unsupported_gate",
  "legacy_story",
  "internal_error",
  "unavailable",
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

/** Answer of `getHealth`. */
export interface Health {
  readonly status: "ok" | "degraded";
  readonly database: "ok" | "unavailable";
}

/** What a run or a story has used so far. */
export interface Usage {
  readonly requests: number;
  readonly nanoAiu: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** A story (a voyage in the UI). `version` is what every command sends back as `expectedVersion`. */
export interface Story {
  /** Jira-shaped key, such as `PROJ-123`. */
  readonly key: string;
  readonly title: string | null;
  /** Who started it; runs bill this person's token. */
  readonly owner: string;
  /** A phase of the pinned `phases.tsv`, or `blocked`. */
  readonly phase: string;
  readonly status: StoryStatus;
  /** Why a `halted` story stopped; free text from the API, so the UI needs a fallback for codes it does not know. */
  readonly haltReason: string | null;
  readonly budgetNanoAiu: number;
  readonly spentNanoAiu: number;
  /** The control-repo commit pinned for the story's life (40 hex characters). */
  readonly controlSha: string;
  readonly currentRunId: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The envelope of the lists that are not paged: `listStoryRuns`, `listQuestions` and `listGateRecords`. */
export interface ItemList<T> {
  readonly items: readonly T[];
}

/** One page of `listStories`, most recently updated first. `nextCursor` is null on the last page. */
export interface StoryPage {
  readonly items: readonly Story[];
  readonly nextCursor: string | null;
}

/** The verdict of the gate that judged a run's output. */
export interface GateVerdict {
  readonly gate: string;
  readonly code: number;
  readonly result: GateResult;
  readonly message: string;
}

/** A worker run of one agent. */
export interface Run {
  readonly id: string;
  readonly storyKey: string;
  readonly phase: string;
  /** Free text; the UI maps it to a crew name and falls back to this. */
  readonly agent: string;
  /** Null leaves the model to the agent's profile. */
  readonly model: string | null;
  /** Null is the model's own default. */
  readonly reasoningEffort: ReasoningEffort | null;
  readonly status: RunStatus;
  /** Where the worker ran: `docker`, `k8s`, `replay`, `fake`... */
  readonly runtime: string;
  readonly controlSha: string;
  readonly budgetNanoAiu: number;
  readonly usage: Usage;
  /** For runtime `replay`, the recorded run whose outputs were re-used. */
  readonly replayOf: string | null;
  readonly exitReason: string | null;
  readonly gate: GateVerdict | null;
  readonly startedBy: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

/** A question an agent asked, and the answer if there is one. */
export interface Question {
  /** `Q1`, `Q2`... */
  readonly id: string;
  readonly round: number;
  readonly runId: string;
  readonly text: string;
  readonly recommendation: string | null;
  readonly answer: string | null;
  readonly answeredBy: string | null;
  readonly answeredAt: string | null;
  /** Whether a run has already read the answer. */
  readonly consumed: boolean;
}

/** An automated gate verdict or a person's decision. */
export interface GateRecord {
  readonly id: string;
  readonly source: GateSource;
  /** A gate name (`intake`, `plan`) or a human gate key (`plan_accepted`). */
  readonly gate: string;
  readonly phase: string;
  readonly outcome: GateOutcome;
  readonly message: string | null;
  readonly actor: string;
  readonly runId: string | null;
  readonly createdAt: string;
}

/** A file an agent wrote, at one revision of the story's artifact set. */
export interface Artifact {
  /** Story-relative path, such as `implementation-plan.md`. */
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly revision: number;
  readonly runId: string | null;
  readonly createdAt: string;
}

/** The current artifact set of a story. */
export interface ArtifactList {
  readonly revision: number;
  readonly items: readonly Artifact[];
}

/** Answer of `getArtifactContent`: the text, or "unchanged" when the `If-None-Match` ETag still matches. */
export type ArtifactContent =
  | {
      readonly kind: "content";
      readonly text: string;
      /** The quoted sha256 the API sent as `ETag`, to pass back as `ifNoneMatch`. */
      readonly etag: string | null;
      readonly mediaType: string | null;
    }
  | { readonly kind: "not_modified" };

/** An event of the story's log or of the live stream. `type` is open: new types may appear, and clients ignore them. */
export interface AhoyEvent {
  /** Increases monotonically; a decimal string. */
  readonly id: string;
  readonly storyKey: string;
  readonly type: string;
  readonly actor: string;
  /** Type-specific; never trust it beyond what the type's reader checks. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/** One page of `listStoryEvents`. Pass `lastEventId` as `after` to continue. */
export interface EventPage {
  readonly items: readonly AhoyEvent[];
  readonly lastEventId: string | null;
}

/** A model, a reasoning effort, or both, as a person chose them. */
export interface ModelChoice {
  readonly model?: string;
  readonly reasoningEffort?: ReasoningEffort;
}

/** What one slot of the model plan will run on, and where each value comes from. */
export interface SlotModel {
  readonly slot: ModelSlot;
  readonly phase: string;
  readonly lens: ReviewLens | null;
  /** What a person chose for the story; null when the slot runs on the defaults. */
  readonly chosen: ModelChoice | null;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly modelSource: ModelSource;
  readonly effortSource: EffortSource;
}

/** The model and reasoning effort each phase of a story runs on. */
export interface ModelPlan {
  readonly storyKey: string;
  readonly version: number;
  readonly slots: readonly SlotModel[];
}

/** Answer of `getStoryState`. `state` is the worker's `state.json`: read it with `readStoryState`. */
export interface StoryStateDocument {
  readonly key: string;
  readonly version: number;
  readonly state: Readonly<Record<string, unknown>>;
}

/** Answer of `answerQuestion`. */
export interface AnswerAccepted {
  readonly story: Story;
  readonly question: Question;
}

/** Answer of `decideHumanGate`. */
export interface DecisionAccepted {
  readonly story: Story;
  readonly record: GateRecord;
}

/** One entry of a problem's `errors`: a message, and where in the request it applies. */
export interface ProblemFieldError {
  /** `body/budgetNanoAiu`, `/models/review-defect`, `query.limit`... See `formControlPath`. */
  readonly path?: string;
  readonly message: string;
}

/** An RFC 9457 problem details body (`application/problem+json`). */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  /** One of {@link PROBLEM_CODES}, or a code a newer API added: errors must never fail on a code they do not know. */
  readonly code: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly errors?: readonly ProblemFieldError[];
  /** On `stale_version`: the story's version now. */
  readonly currentVersion?: number;
}

/** A choice per slot for a new story (`ModelPlanRequest`). */
export type ModelPlanRequest = Readonly<Partial<Record<ModelSlot, ModelChoice>>>;

/** A change per slot; `null` gives a slot back to the configured defaults (`ModelPlanChange`). */
export type ModelPlanChange = Readonly<Partial<Record<ModelSlot, ModelChoice | null>>>;

/** Body of `startStory`. */
export interface StartStoryRequest {
  readonly key: string;
  readonly title?: string;
  /** Hard AIU cap for every run of the story together; at least 1. */
  readonly budgetNanoAiu: number;
  /** A control-repo commit to pin; the server's HEAD when absent. */
  readonly controlRef?: string;
  readonly models?: ModelPlanRequest;
}

/** Body of `stopStory`. */
export interface StopStoryRequest {
  readonly expectedVersion: number;
  readonly reason: string;
}

/** Body of `resumeStory`. */
export interface ResumeStoryRequest {
  readonly expectedVersion: number;
  readonly reason?: string;
}

/** Body of `setStoryBudget`. The new cap includes what is already spent. */
export interface SetStoryBudgetRequest {
  readonly expectedVersion: number;
  readonly budgetNanoAiu: number;
  readonly reason: string;
}

/** Body of `setStoryModels`. */
export interface SetStoryModelsRequest {
  readonly expectedVersion: number;
  readonly models: ModelPlanChange;
  readonly reason?: string;
}

/** Body of `answerQuestion`. */
export interface AnswerRequest {
  readonly answer: string;
  readonly expectedVersion: number;
}

/** Body of `decideHumanGate`. `send_back` and `reject` need a `reason`. */
export interface DecisionRequest {
  /** The human gate key from the phase table, such as `plan_accepted`. */
  readonly gate: string;
  readonly decision: HumanDecision;
  readonly reason?: string;
  readonly expectedVersion: number;
}

/** Query of `listStories`. */
export interface ListStoriesQuery {
  readonly status?: StoryStatus;
  /** 1 to 500; the API's default is 100. */
  readonly limit?: number;
  /** The `nextCursor` of the previous page. */
  readonly cursor?: string;
}

/** Query of `listStoryEvents`. */
export interface ListEventsQuery {
  /** Only events with a greater id: the `lastEventId` of the previous page. */
  readonly after?: string;
  /** 1 to 500; the API's default is 100. */
  readonly limit?: number;
}

/** Query of `getArtifactContent`. */
export interface ArtifactContentQuery {
  /** Story-relative path, as `listArtifacts` lists it. */
  readonly path: string;
  /** An artifact-set revision; the current one when absent. */
  readonly revision?: number;
  /** An ETag from an earlier answer: a match answers `{ kind: "not_modified" }` without the text. */
  readonly ifNoneMatch?: string;
}
