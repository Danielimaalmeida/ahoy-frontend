/**
 * Wire types of the Ahoy API, as `openapi/ahoy-v1.yaml` (1.0.0-poc) describes them and as `guards.ts` checks them.
 *
 * Each type is an alias of what `openapi-typescript` generated into `schema.d.ts` (`npm run api:types`), so a new contract
 * changes them with no hand edit, and `guards.ts` stops compiling where a field was added, removed or renamed. This is the
 * only file that imports the generated one. Three things are not aliases, and say why where they are:
 *
 * - the lists of values (`STORY_STATUSES` and the others) are needed at run time, so they are written out and checked
 *   against the generated enums at compile time: a value the contract added or dropped fails `tsc` here;
 * - `Problem.code`, the `payload` of an event and the `state` of the story state are open on purpose (see each);
 * - client-side shapes that are not in the contract: `ItemList`, `ArtifactContent` and `ifNoneMatch`.
 *
 * Every field is `readonly`. AIU amounts are integer nano-AIU (1 AIU = 1_000_000_000).
 */
import type { components, operations } from './schema';

type Schemas = components['schemas'];

/** One model in the server's catalogue, not an account entitlement. */
export type CatalogModel = Schemas['CatalogModel'];
/** The effective default for a slot of a new story. */
export type SlotDefault = Schemas['SlotDefault'];
/** The server's model catalogue and defaults for a new story. */
export type ModelCatalog = Schemas['ModelCatalog'];

/** One Jira issue from the configured read-only backlog search. */
export type JiraBacklogIssue = Schemas['JiraBacklogIssue'];
/** The complete Jira backlog returned by `listJiraBacklog`. */
export type JiraBacklog = Schemas['JiraBacklog'];

/** `List` itself when it holds exactly the members of the generated union `Union`; otherwise a type that says what differs. */
type Exactly<Union extends string, List extends readonly string[]> = [
  Exclude<Union, List[number]>,
  Exclude<List[number], Union>,
] extends [never, never]
  ? List
  : {
      readonly missingFromList: Exclude<Union, List[number]>;
      readonly notInContract: Exclude<List[number], Union>;
    };

/** Keeps a list as a tuple of literals and fails to compile unless it is exactly the members of the union `Union`. */
function listOf<Union extends string>() {
  return <const List extends readonly Union[]>(
    list: List & Exactly<Union, List>
  ): List => list;
}

/** The states a story can be in (`StoryStatus`). */
export type StoryStatus = Schemas['StoryStatus'];
export const STORY_STATUSES = listOf<StoryStatus>()([
  'ready',
  'running',
  'awaiting_input',
  'awaiting_decision',
  'halted',
  'terminal',
]);

/** The states a run can be in (`RunStatus`). */
export type RunStatus = Schemas['RunStatus'];
export const RUN_STATUSES = listOf<RunStatus>()([
  'queued',
  'running',
  'succeeded',
  'awaiting_input',
  'failed',
  'budget_exceeded',
  'timed_out',
  'cancelled',
  'output_violation',
  'auth_failed',
  'lost',
]);

/** The states of a backlog item's refinement (`RefinementStatus`): queued, running, then how it ended. */
export type RefinementStatus = Schemas['RefinementStatus'];
export const REFINEMENT_STATUSES = listOf<RefinementStatus>()([
  'queued',
  'running',
  'succeeded',
  'failed',
  'budget_exceeded',
  'timed_out',
  'cancelled',
  'output_violation',
  'auth_failed',
  'lost',
]);

/** The causes the diagnosis of a halted story knows (`DiagnosisKind`); `other` is a halt no rule explains. */
export type DiagnosisKind = Schemas['DiagnosisKind'];
export const DIAGNOSIS_KINDS = listOf<DiagnosisKind>()([
  'copilot_auth',
  'gate_rejected',
  'configuration',
  'cluster_capacity',
  'pod_evicted',
  'out_of_memory',
  'image_pull',
  'runtime_deadline',
  'budget_exhausted',
  'run_timed_out',
  'output_violation',
  'run_lost',
  'agent_failed',
  'revision_ceiling',
  'reconciler_error',
  'stopped_by_user',
  'other',
]);

/** Who can act on a diagnosis finding: the story's owner, the operator or the maintainer of the agents' instructions. */
export type DiagnosisActor = DiagnosisFinding['actor'];
export const DIAGNOSIS_ACTORS = listOf<DiagnosisActor>()([
  'story_owner',
  'operator',
  'agent_maintainer',
]);

/** The reasoning efforts of the Copilot SDK (`ReasoningEffort`). A model may take fewer, or none. */
export type ReasoningEffort = Schemas['ReasoningEffort'];
export const REASONING_EFFORTS = listOf<ReasoningEffort>()([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

/** The parts of a story that run on one model (`ModelSlot`). */
export type ModelSlot = Schemas['ModelSlot'];
export const MODEL_SLOTS = listOf<ModelSlot>()([
  'intake',
  'planning',
  'implementation',
  'review',
]);

/** Where a slot's model comes from (`SlotModel.modelSource`). */
export type ModelSource = Schemas['SlotModel']['modelSource'];
export const MODEL_SOURCES = listOf<ModelSource>()([
  'revision',
  'story',
  'configuration',
  'phase_table',
  'agent_profile',
]);

/** Where a slot's reasoning effort comes from (`SlotModel.effortSource`). */
export type EffortSource = Schemas['SlotModel']['effortSource'];
export const EFFORT_SOURCES = listOf<EffortSource>()([
  'revision',
  'story',
  'configuration',
  'phase_table',
  'model_default',
]);

/** What an automated gate said about a run (`GateVerdict.result`). */
export type GateResult = Schemas['GateVerdict']['result'];
export const GATE_RESULTS = listOf<GateResult>()([
  'pass',
  'fail',
  'error',
  'branch',
  'halt',
  'reject',
]);

/** Who made a gate record: an automated gate, or a person (`GateRecord.source`). */
export type GateSource = Schemas['GateRecord']['source'];
export const GATE_SOURCES = listOf<GateSource>()(['gate', 'human']);

/** What a gate record says: an automated result, or a person's decision (`GateRecord.outcome`). */
export type GateOutcome = Schemas['GateRecord']['outcome'];
export const GATE_OUTCOMES = listOf<GateOutcome>()([
  'pass',
  'fail',
  'error',
  'branch',
  'halt',
  'reject',
  'approve',
  'send_back',
]);

/** What a person can decide at a human gate (`DecisionRequest.decision`). */
export type HumanDecision = Schemas['DecisionRequest']['decision'];
export const HUMAN_DECISIONS = listOf<HumanDecision>()([
  'approve',
  'send_back',
  'reject',
]);

/** The `code` of a problem, as the contract lists them. A newer API may send others: see {@link Problem.code}. */
export type ProblemCode = Schemas['Problem']['code'];
export const PROBLEM_CODES = listOf<ProblemCode>()([
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'story_exists',
  'stale_version',
  'invalid_state',
  'already_answered',
  'decision_already_recorded',
  'revision_ceiling_reached',
  'unsupported_gate',
  'legacy_story',
  'internal_error',
  'unavailable',
]);

/** Answer of `getHealth`. */
export type Health = Schemas['Health'];

/** What a run or a story has used so far. */
export type Usage = Schemas['Usage'];

/** A story (a voyage in the UI). `version` is what every command sends back as `expectedVersion`. */
export type Story = Schemas['Story'];

/** The envelope of the lists that are not paged: `listStoryRuns`, `listQuestions` and `listGateRecords`. */
export interface ItemList<T> {
  readonly items: readonly T[];
}

/** One page of `listStories`, most recently updated first. `nextCursor` is null on the last page. */
export type StoryPage = Schemas['StoryPage'];

/** The verdict of the gate that judged a run's output. */
export type GateVerdict = Schemas['GateVerdict'];

/** A worker run of one agent. */
export type Run = Schemas['Run'];

/**
 * A question an agent asked, and the answer if there is one. A non-null `supersededAt` means an intake refresh made it
 * history: it is shown, never answered, and never counts as waiting for an answer.
 */
export type Question = Schemas['Question'];

/** An automated gate verdict or a person's decision. */
export type GateRecord = Schemas['GateRecord'];

/** A file an agent wrote, at one revision of the story's artifact set. */
export type Artifact = Schemas['Artifact'];

/** The current artifact set of a story. */
export type ArtifactList =
  operations['listArtifacts']['responses'][200]['content']['application/json'];

/** Answer of `getArtifactContent`: the text, or "unchanged" when the `If-None-Match` ETag still matches. */
export type ArtifactContent =
  | {
      readonly kind: 'content';
      readonly text: string;
      /** The quoted sha256 the API sent as `ETag`, to pass back as `ifNoneMatch`. */
      readonly etag: string | null;
      readonly mediaType: string | null;
    }
  | { readonly kind: 'not_modified' };

/**
 * An event of the story's log or of the live stream. `type` is open: new types may appear, and clients ignore them.
 * The contract's `payload` is an object with no properties, which the generator types as `Record<string, never>`: nothing
 * could be read from it. It is type-specific and untrusted, so it is `unknown` per key until its reader has checked it.
 */
export interface AhoyEvent extends Omit<Schemas['Event'], 'payload'> {
  readonly payload: Readonly<Record<string, unknown>>;
}

/** One page of `listStoryEvents`. Pass `lastEventId` as `after` to continue. */
export interface EventPage extends Omit<Schemas['EventPage'], 'items'> {
  readonly items: readonly AhoyEvent[];
}

/** A model, a reasoning effort, or both, as a person chose them. */
export type ModelChoice = Schemas['ModelChoice'];

/** What one slot of the model plan will run on, and where each value comes from. */
export type SlotModel = Schemas['SlotModel'];

/** The model and reasoning effort each phase of a story runs on. */
export type ModelPlan = Schemas['ModelPlan'];

/**
 * Answer of `getStoryState`. `state` is the worker's `state.json`: read it with `readStoryState`. The contract describes it
 * as an object whose fields the API does not fix (`Record<string, never>` once generated), so it is read per key as `unknown`.
 */
export interface StoryStateDocument extends Omit<
  Schemas['StoryState'],
  'state'
> {
  readonly state: Readonly<Record<string, unknown>>;
}

/** Answer of `answerQuestion`. */
export type AnswerAccepted = Schemas['AnswerAccepted'];

/** Answer of `decideHumanGate`. */
export type DecisionAccepted = Schemas['DecisionAccepted'];

/** One entry of a problem's `errors`: a message, and where in the request it applies (see `formControlPath`). */
export type ProblemFieldError = NonNullable<
  Schemas['Problem']['errors']
>[number];

/**
 * An RFC 9457 problem details body (`application/problem+json`). `code` is one of {@link PROBLEM_CODES}, or a code a newer
 * API added: errors must never fail on a code they do not know, so it is a `string` here, where the contract has the enum.
 */
export interface Problem extends Omit<Schemas['Problem'], 'code'> {
  readonly code: string;
}

/** A choice per slot for a new story (`ModelPlanRequest`). */
export type ModelPlanRequest = Schemas['ModelPlanRequest'];

/** A change per slot; `null` gives a slot back to the configured defaults (`ModelPlanChange`). */
export type ModelPlanChange = Schemas['ModelPlanChange'];

/** Body of `startStory`. */
export type StartStoryRequest = Schemas['StartStoryRequest'];

/** Body of `stopStory`. */
export type StopStoryRequest = Schemas['StopStoryRequest'];

/** Body of `resumeStory`. */
export type ResumeStoryRequest = Schemas['ResumeStoryRequest'];

/** One cause of a halt: the evidence (untrusted text), the action that fixes it and who takes it. */
export type DiagnosisFinding = Schemas['DiagnosisFinding'];

/** Answer of `getStoryDiagnosis`: why a story stands where it stands; no findings unless it is halted. */
export type Diagnosis = Schemas['Diagnosis'];

/** Body of `refreshIntake`: sends a story in planning or plan review back to intake. `confirmSpend` must be true. */
export type RefreshIntakeRequest = Schemas['RefreshIntakeRequest'];

/** An agent's pre-refinement of a Jira backlog item; `content` is its Markdown, non-null exactly when it succeeded. */
export type Refinement = Schemas['Refinement'];

/** A refinement without its content, as `listRefinements` lists the newest one of each issue. */
export type RefinementSummary = Schemas['RefinementSummary'];

/** Answer of `getRefinements`: every refinement of one issue, newest first. */
export type RefinementList = Schemas['RefinementList'];

/** Body of `requestRefinement`. May spend AIU: `confirmSpend` must be true. */
export type RefinementRequest = Schemas['RefinementRequest'];

/** Body of `cancelRefinement` and `cancelAgentDiagnosis`. */
export type CancelRefinementRequest = Schemas['CancelRefinementRequest'];

/** Answer of `listAgentDiagnoses`: every agent diagnosis of one story, newest first. Each has the shape of a refinement. */
export type AgentDiagnosisList = Schemas['AgentDiagnosisList'];

/** Body of `requestAgentDiagnosis`. May spend AIU: `confirmSpend` must be true; the cap is at most 20 AIU. */
export type AgentDiagnosisRequest = Schemas['AgentDiagnosisRequest'];

/** Body of `setStoryBudget`. The new cap includes what is already spent. */
export type SetStoryBudgetRequest = Schemas['SetStoryBudgetRequest'];

/** Body of `setStoryModels`. */
export type SetStoryModelsRequest = Schemas['SetStoryModelsRequest'];

/** Body of `answerQuestion`. */
export type AnswerRequest = Schemas['AnswerRequest'];

/** Body of `decideHumanGate`. `send_back` and `reject` need a `reason`. */
export type DecisionRequest = Schemas['DecisionRequest'];

/** Query of `listStories`: `limit` is 1 to 500 (the API's default is 100), `cursor` the `nextCursor` of the previous page. */
export type ListStoriesQuery = NonNullable<
  operations['listStories']['parameters']['query']
>;

/** Query of `listStoryEvents`: `after` is the `lastEventId` of the previous page, `limit` is 1 to 500. */
export type ListEventsQuery = NonNullable<
  operations['listStoryEvents']['parameters']['query']
>;

/**
 * Query of `getArtifactContent`: `path` as `listArtifacts` lists it, and the artifact-set `revision` (the current one when
 * absent). `ifNoneMatch` is the contract's `If-None-Match` header: an ETag from an earlier answer, and a match answers
 * `{ kind: "not_modified" }` without the text.
 */
export type ArtifactContentQuery =
  operations['getArtifactContent']['parameters']['query'] & {
    readonly ifNoneMatch?: string;
  };
