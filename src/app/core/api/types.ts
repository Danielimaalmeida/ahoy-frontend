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

/** The latest worker observation, separate from the run lifecycle. */
export type RuntimeStatus = NonNullable<Schemas['RuntimeStatus']>;
export const RUNTIME_STATES = listOf<RuntimeStatus['state']>()([
  'starting',
  'scheduling',
  'waiting_for_node',
  'blocked',
  'running',
  'unknown',
]);

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

/** One reason behind a harness-fit verdict: a stable code to translate and an English message with the evidence. */
export type FitReason = Schemas['FitReason'];
/** A backlog item's readiness for the harness, by fixed rules over its Jira text (`ready`, `attention`, `missing`). */
export type BacklogReadiness = Schemas['BacklogReadiness'];
/** A planned story's fit for the harness, by fixed rules over its work packages and criteria. */
export type PlanFit = Schemas['PlanFit'];
/** Answer of `getStoryPlanFit`; `fit` is null until the planner has written work packages. */
export type StoryPlanFit = Schemas['StoryPlanFit'];

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

/** The readiness verdicts of a backlog item. */
export const READINESS_VERDICTS = listOf<BacklogReadiness['verdict']>()([
  'ready',
  'attention',
  'missing',
]);

/** The fit verdicts of a planned story. */
export const PLAN_FIT_VERDICTS = listOf<PlanFit['verdict']>()([
  'fits',
  'attention',
  'poor',
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
  'package_stuck',
  'deferred_check',
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

/** Body of `unblockStory`: more rework rounds, optional repository aliases and an audited reason. */
export type UnblockStoryRequest = Schemas['UnblockStoryRequest'];

/** Body of `decideWorkPackage`: retry or accept a stuck work package, with the reason and the version the user saw. */
export type WorkPackageDecisionRequest = Schemas['WorkPackageDecisionRequest'];

/** What a person decides about a stuck work package (`WorkPackageDecisionRequest.decision`). */
export type WorkPackageDecision = WorkPackageDecisionRequest['decision'];

/** One cause of a halt: the evidence (untrusted text), the action that fixes it and who takes it. */
export type DiagnosisFinding = Schemas['DiagnosisFinding'];

/** Answer of `getStoryDiagnosis`: why a story stands where it stands; no findings unless it is halted. */
export type Diagnosis = Schemas['Diagnosis'];

/** Body of `refreshIntake`: sends a story in planning or plan review back to intake. `confirmSpend` must be true. */
export type RefreshIntakeRequest = Schemas['RefreshIntakeRequest'];

/**
 * Body of `refreshDesign`: replaces a story's Figma design with the frames of `figmaLinks` and sends its UI packages
 * round again. `confirmSpend` must be true.
 */
export type RefreshDesignRequest = Schemas['RefreshDesignRequest'];

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

/** Body of `requestAgentDiagnosis`. May spend AIU: `confirmSpend` must be true; the cap is at most 100 AIU. */
export type AgentDiagnosisRequest = Schemas['AgentDiagnosisRequest'];

/**
 * A knowledge review: the shape of a refinement, plus the proposed `knowledge/business-context.md` (`proposal`), the
 * proposed `knowledge/lessons.md` (`lessons`) and one patch of both against `controlSha`.
 */
export type KnowledgeReview = Schemas['KnowledgeReview'];

/** Answer of `listKnowledgeReviews`: every knowledge review of one story, newest first. */
export type KnowledgeReviewList = Schemas['KnowledgeReviewList'];

/** Body of `requestKnowledgeReview`. May spend AIU: `confirmSpend` must be true; the cap is at most 100 AIU. */
export type KnowledgeReviewRequest = Schemas['KnowledgeReviewRequest'];

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

/**
 * Answer of `getMetrics`: where the harness spends AIU, where voyages halt, which errors repeat and how long people keep
 * voyages waiting, for one period. AIU in integer nano-AIU, durations in whole seconds; error signatures and gate
 * messages are untrusted text.
 */
export type MetricsReport = Schemas['MetricsReport'];

/** Why a run ran (`first`, `review_rework`, `ci_fix`, `repair`, ...), as `MetricsReport.runKinds` counts it. */
export type RunKind = MetricsReport['runKinds'][number]['kind'];
export const RUN_KINDS = listOf<RunKind>()([
  'first',
  'continue',
  'resume',
  'after_answers',
  're_review',
  'review_rework',
  'ci_fix',
  'revision',
  'retry',
  'design_refresh',
  'repair',
]);

/** One halt in the period, explained by the same rules as the voyage's diagnosis. */
export type MetricsHalt = Schemas['MetricsHalt'];

/** One error that repeats: runs, gates and halts grouped by kind and message. */
export type MetricsError = Schemas['MetricsError'];

/** Query of `getMetrics` and `exportMetrics`: the period `[from, to)` (30 days before now by default) and filters. */
export type MetricsQuery = NonNullable<
  operations['getMetrics']['parameters']['query']
>;

/** The tables `exportMetrics` serves (`table`). */
export type MetricsTable =
  operations['exportMetrics']['parameters']['query']['table'];
export const METRICS_TABLES = listOf<MetricsTable>()([
  'runs',
  'halts',
  'gates',
  'errors',
  'waits',
]);

/** The file formats `exportMetrics` serves (`format`). */
export type MetricsFormat = NonNullable<
  operations['exportMetrics']['parameters']['query']['format']
>;

/** What `exportMetrics` hands over: the file's text and the name the API gives it. Client-side, not in the contract. */
export interface MetricsExport {
  readonly text: string;
  readonly filename: string;
  readonly mediaType: string;
}

/**
 * Where a meeting stands (`MeetingStatus`): `planned`, `in_progress` once started, then `ended`; or ended straight from
 * planned, or `cancelled` while planned. Ended and cancelled are read-only.
 */
export type MeetingStatus = Schemas['MeetingStatus'];
export const MEETING_STATUSES = listOf<MeetingStatus>()([
  'planned',
  'in_progress',
  'ended',
  'cancelled',
]);

/** Who brought a topic up: our side or a stakeholder (`RaisedBy`). */
export type RaisedBy = Schemas['RaisedBy'];
export const RAISED_BY = listOf<RaisedBy>()(['us', 'them']);

/** Whether a topic was noted before the meeting started or raised during it (`TopicOrigin`). */
export type TopicOrigin = Schemas['TopicOrigin'];
export const TOPIC_ORIGINS = listOf<TopicOrigin>()(['planned', 'in_meeting']);

/** An `open` topic can change; a `moved` one went to the next meeting and is read-only where it was (`TopicStatus`). */
export type TopicStatus = Schemas['TopicStatus'];
export const TOPIC_STATUSES = listOf<TopicStatus>()(['open', 'moved']);

/** A recurring meeting (the weekly Finance sync); `cadenceDays` lets the API plan its next meeting itself. */
export type MeetingSeries = Schemas['MeetingSeries'];

/** Answer of `listMeetingSeries`. */
export type MeetingSeriesList = Schemas['MeetingSeriesList'];

/** A meeting without its topics, as `listMeetings` lists it. */
export type MeetingSummary = Schemas['MeetingSummary'];

/** Answer of `listMeetings`: latest start first. */
export type MeetingList = Schemas['MeetingList'];

/** A meeting with its topics in order, each with its notes oldest first. */
export type Meeting = Schemas['Meeting'];

/** One topic of a meeting, with who raised it, where it came from or went, and its notes. */
export type MeetingTopic = Schemas['MeetingTopic'];

/** Where a carried-over topic came from, or where a moved one went. */
export type MeetingTopicLink = Schemas['MeetingTopicLink'];

/** One note under a topic: plain text, untrusted. */
export type MeetingNote = Schemas['MeetingNote'];

/** Answer of `endMeeting`: the ended meeting and, when topics were carried over, the meeting that took them. */
export type EndMeetingResult = Schemas['EndMeetingResult'];

/** Answer of `moveMeetingTopic`: the moved topic and its copy in the next meeting. */
export type MoveMeetingTopicResult = Schemas['MoveMeetingTopicResult'];
/** A question, answered, and its new answer (`addMeetingNoteAnswer`). */
export type MeetingNoteAnswerResult = Schemas['MeetingNoteAnswerResult'];

/** Body of `createMeeting`; with `seriesId`, the title and stakeholders default to the series'. */
export type CreateMeetingRequest = Schemas['CreateMeetingRequest'];

/** Body of `updateMeeting`. */
export type UpdateMeetingRequest = Schemas['UpdateMeetingRequest'];

/** Body of `endMeeting`: the open topics to carry over to the next meeting. */
export type EndMeetingRequest = Schemas['EndMeetingRequest'];

/** Body of `addMeetingTopic`. */
export type AddMeetingTopicRequest = Schemas['AddMeetingTopicRequest'];

/** Body of `updateMeetingTopic`. */
export type UpdateMeetingTopicRequest = Schemas['UpdateMeetingTopicRequest'];

/** Body of `setMeetingTopicOrder`: every topic of the meeting, once each. */
export type MeetingTopicOrderRequest = Schemas['MeetingTopicOrderRequest'];

/** Body of `addMeetingNote` and `updateMeetingNote`. */
export type MeetingNoteRequest = Schemas['MeetingNoteRequest'];

/** What a note is: what was said, what was agreed, something to do next, or what is still to answer (`MeetingNoteKind`). */
export type MeetingNoteKind = Schemas['MeetingNoteKind'];
export const MEETING_NOTE_KINDS = listOf<MeetingNoteKind>()([
  'note',
  'decision',
  'action',
  'question',
]);

/** Whether an action is still to do or done, when actions are listed (`MeetingActionStatus`). */
export type MeetingActionStatus = Schemas['MeetingActionStatus'];
export const MEETING_ACTION_STATUSES = listOf<MeetingActionStatus>()([
  'open',
  'done',
]);

/** An image on a note (`MeetingNoteImage`); its bytes come from `getMeetingNoteImage`. */
export type MeetingNoteImage = Schemas['MeetingNoteImage'];

/** The formats a note's image can have: rasters only, recognised by the API from the bytes. */
export type MeetingNoteImageType = MeetingNoteImage['mediaType'];
export const MEETING_NOTE_IMAGE_TYPES = listOf<MeetingNoteImageType>()([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/** Body of `addMeetingNoteAnswer`. */
export type MeetingNoteAnswerRequest = Schemas['MeetingNoteAnswerRequest'];

/** Body of `setMeetingNoteDone`. */
export type MeetingNoteDoneRequest = Schemas['MeetingNoteDoneRequest'];

/** A note with the topic and meeting it was taken in, as `listMeetingNotes` lists it. */
export type MeetingNoteInContext = Schemas['MeetingNoteInContext'];

/** Answer of `listMeetingNotes`: latest meeting first. */
export type MeetingNoteList = Schemas['MeetingNoteList'];

/** Body of `createMeetingSeries`. */
export type CreateMeetingSeriesRequest = Schemas['CreateMeetingSeriesRequest'];

/** What a series' drafted stories are created as in Jira; `Story` by default (`JiraIssueType`). */
export type JiraIssueType = Schemas['JiraIssueType'];
export const JIRA_ISSUE_TYPES = listOf<JiraIssueType>()([
  'Story',
  'Task',
  'Bug',
]);

/** Body of `updateMeetingSeries`: where the series' stories are created in Jira; a null project turns it off. */
export type UpdateMeetingSeriesRequest = Schemas['UpdateMeetingSeriesRequest'];

/** A user story in Ahoy's fixed template, as the agent wrote it and the API checked it (`StoryTemplate`). */
export type StoryTemplate = Schemas['StoryTemplate'];

/**
 * `drafting`, then `ready` (or `failed`), then `created` in Jira (`MeetingStoryDraftStatus`); a grill is `asking` between
 * its questions and the story.
 */
export type MeetingStoryDraftStatus = Schemas['MeetingStoryDraftStatus'];
export const MEETING_STORY_DRAFT_STATUSES = listOf<MeetingStoryDraftStatus>()([
  'drafting',
  'asking',
  'ready',
  'failed',
  'created',
]);

/** A user story an agent drafted from a meeting topic, and where it stands. */
export type MeetingStoryDraft = Schemas['MeetingStoryDraft'];

/** Answer of `listMeetingStoryDrafts`: newest first, discarded ones left out. */
export type MeetingStoryDraftList = Schemas['MeetingStoryDraftList'];

/** Body of `requestMeetingStoryDraft`; it may spend AIU, so `confirmSpend` is required. */
export type MeetingStoryDraftRequest = Schemas['MeetingStoryDraftRequest'];

/** `draft`: the agent writes the story from the notes; `grill`: it asks the person questions first (`MeetingStoryMode`). */
export type MeetingStoryMode = Schemas['MeetingStoryMode'];
export const MEETING_STORY_MODES = listOf<MeetingStoryMode>()([
  'draft',
  'grill',
]);

/** One answer the agent offers to a grill's question; exactly one per question is recommended (`GrillOption`). */
export type GrillOption = Schemas['GrillOption'];

/** One of a grill's questions, numbered `Q1`.. (`GrillQuestion`). */
export type GrillQuestion = Schemas['GrillQuestion'];

/** How a question was answered: an option, left open for the story, or in the person's own words (`GrillChoice`). */
export type GrillChoice = Schemas['GrillChoice'];
export const GRILL_CHOICES = listOf<GrillChoice>()(['option', 'open', 'own']);

/** An answer as the API keeps it, with the question as it was asked (`GrillAnswer`). */
export type GrillAnswer = Schemas['GrillAnswer'];

/** Body of `answerMeetingStoryQuestions`; the run that writes the story may spend AIU, so `confirmSpend` is required. */
export type MeetingStoryAnswersRequest = Schemas['MeetingStoryAnswersRequest'];

/** One answer in `MeetingStoryAnswersRequest`. */
export type GrillAnswerInput = MeetingStoryAnswersRequest['answers'][number];

/** The duties that rotate each sprint: the sprint person (the devs) and the lunch and retro host (anyone) (`CrewRole`). */
export type CrewRole = Schemas['CrewRole'];
export const CREW_ROLES = listOf<CrewRole>()(['sprint_person', 'lunch_host']);

/** Where a sprint's days come from: Jira's sprint, or projected by Ahoy at the team's cadence. */
export type CrewSprintState = Schemas['CrewSprint']['state'];
export const CREW_SPRINT_STATES = listOf<CrewSprintState>()([
  'active',
  'future',
  'closed',
  'projected',
]);

/** How a person changes who is on for a sprint (`CrewChangeRequest.mode`). */
export type CrewChangeMode = Schemas['CrewChangeRequest']['mode'];
export const CREW_CHANGE_MODES = listOf<CrewChangeMode>()([
  'swap',
  'skip',
  'restart',
]);

/** A recorded change's mode: `restart` moves the order's start instead, so it is never one. */
export type CrewRecordedMode = NonNullable<
  Schemas['CrewAssignment']['change']
>['mode'];
export const CREW_RECORDED_MODES = listOf<CrewRecordedMode>()(['swap', 'skip']);

/** Days a member is away, both included. */
export type CrewTimeOff = Schemas['CrewTimeOff'];

/** A member of the crew with the turns they take and their time off. */
export type CrewMember = Schemas['CrewMember'];

/** Who is on for one role in one sprint, who the order named, and whether they are away. */
export type CrewAssignment = Schemas['CrewAssignment'];

/** One sprint of the crew page with who is on for each role. */
export type CrewSprint = Schemas['CrewSprint'];

/** Answer of `getCrew`: the members and the current sprint with the next five. */
export type Crew = Schemas['Crew'];

/** Body of `addCrewMember`. */
export type CrewMemberRequest = Schemas['CrewMemberRequest'];

/** Body of `updateCrewMember`: absent fields keep their values. */
export type UpdateCrewMemberRequest = Schemas['UpdateCrewMemberRequest'];

/** Body of `addCrewTimeOff`. */
export type CrewTimeOffRequest = Schemas['CrewTimeOffRequest'];

/** Body of `changeCrewSprint`. */
export type CrewChangeRequest = Schemas['CrewChangeRequest'];

/** Answer of `getMe`: the signed-in person, and whether they may change the team's settings. */
export type Me = Schemas['Me'];

/** Answer of `getSonarSettings`: the servers and repositories, and whether the person may change them. */
export type SonarSettings = Schemas['SonarSettings'];

/** A SonarQube server; its token is never sent back, only its last four characters (`tokenHint`). */
export type SonarServer = Schemas['SonarServer'];

/** Body of `addSonarServer`. */
export type SonarServerRequest = Schemas['SonarServerRequest'];

/** Body of `updateSonarServer`: the server's `version`, and what changes. */
export type SonarServerChange = Schemas['SonarServerChange'];

/** A repository and the server its SonarQube project is on. */
export type SonarRepository = Schemas['SonarRepository'];

/** Body of `addSonarRepository`. */
export type SonarRepositoryRequest = Schemas['SonarRepositoryRequest'];

/** Body of `updateSonarRepository`: `projectKey: null` clears the key. */
export type SonarRepositoryChange = Schemas['SonarRepositoryChange'];

/** One change to a team setting: who, when, which row and what changed (a token only as its last four characters). */
export type SettingsEvent = Schemas['SettingsEvent'];

/** Answer of `listSettingsEvents`, newest first. */
export type SettingsEventPage = Schemas['SettingsEventPage'];

/** Which part of the team settings a history entry belongs to. */
export type SettingsSection = NonNullable<
  NonNullable<
    operations['listSettingsEvents']['parameters']['query']
  >['section']
>;

/** Answer of `getJiraSettings`: Jira as set (null while it is off), and what the person and the API can do. */
export type JiraSettingsPage = Schemas['JiraSettingsPage'];

/** Jira's settings: the connection (its token only as the last four characters), the backlog, board and story fields. */
export type JiraSettings = Schemas['JiraSettings'];

/** A field every story created from a meeting carries, with its value as Jira's create takes it. */
export type JiraFixedField = Schemas['JiraFixedField'];

/** What "Test connection" found, kept as the last test. */
export type JiraTest = Schemas['JiraTest'];

/** What a connection test can find. */
export type JiraTestResult = JiraTest['result'];
export const JIRA_TEST_RESULTS = listOf<JiraTestResult>()([
  'ok',
  'refused',
  'unreachable',
]);

/** The crew's board, as Jira named it when it was set. */
export type JiraBoard = NonNullable<JiraSettings['board']>;

/** The board's active sprint, or its next one. */
export type JiraCurrentSprint = NonNullable<JiraSettings['currentSprint']>;

/** Body of `putJiraConnection`: the base URL and, to connect or move, the token. */
export type JiraConnectionRequest = Schemas['JiraConnectionRequest'];

/** Body of `updateJiraSettings`: the version and what changes. */
export type JiraSettingsChange = Schemas['JiraSettingsChange'];

/** Answer of `previewJiraBacklog`: how many issues a query matches, and the first. */
export type JiraBacklogPreview = Schemas['JiraBacklogPreview'];

/** Answer of `listJiraFields`: the fields whose name or id holds the search. */
export type JiraFieldPage = Schemas['JiraFieldPage'];

/** One of Jira's fields, found by `listJiraFields`. */
export type JiraField = JiraFieldPage['items'][number];

/** Query of `listMeetingNotes`: one kind, optionally of one series or meeting, and open or done actions. */
export type ListMeetingNotesQuery =
  operations['listMeetingNotes']['parameters']['query'];

/** Query of `listMeetings`. */
export type ListMeetingsQuery = NonNullable<
  operations['listMeetings']['parameters']['query']
>;
