/**
 * Manual guards for what the API sends (plan F7). Each one checks every field of its type in `types.ts` and tolerates
 * extra fields, so a newer API that adds a field does not break the app. A value that is not what the contract says is an
 * `invalid_response` for the caller: never a crash, never a domain verdict.
 *
 * AIU amounts and counts must be whole numbers `Number.isSafeInteger` accepts and not negative: a fractional, negative or
 * NaN amount is refused. Closed enums of the contract are checked too; `phase`, `haltReason`, `agent`, `runtime` and event
 * `type` are open strings in the contract, so they are not.
 *
 * `isX(value)` is the type guard; `isX.explain(value)` says why a value was refused, naming the field.
 */
import {
  arrayOf,
  boundedText,
  flag,
  guard,
  nonEmptyText,
  nullable,
  oneOf,
  optional,
  patterned,
  record,
  shape,
  text,
  timestamp,
  wholeNumber,
} from './guard-kit';
import {
  EFFORT_SOURCES,
  GATE_OUTCOMES,
  GATE_RESULTS,
  GATE_SOURCES,
  MODEL_SLOTS,
  MODEL_SOURCES,
  REASONING_EFFORTS,
  RUN_STATUSES,
  STORY_STATUSES,
  type AhoyEvent,
  type AnswerAccepted,
  type Artifact,
  type ArtifactList,
  type DecisionAccepted,
  type EventPage,
  type GateRecord,
  type GateVerdict,
  type Health,
  type ItemList,
  type JiraBacklog,
  type JiraBacklogIssue,
  type ModelChoice,
  type CatalogModel,
  type ModelCatalog,
  type SlotDefault,
  type ModelPlan,
  type Problem,
  type ProblemFieldError,
  type Question,
  type Run,
  type SlotModel,
  type Story,
  type StoryPage,
  type StoryStateDocument,
  type Usage,
} from './types';

const storyKey = patterned(
  'a story key like PROJ-123',
  /^[A-Z][A-Z0-9]+-[0-9]+$/,
  40
);
const runId = patterned('a run id', /^[A-Za-z0-9_.-]+$/, 120);
const actor = boundedText('an actor of 1 to 200 characters', 1, 200);
const sha1 = patterned('a 40-character commit sha', /^[0-9a-f]{40}$/, 40);
const sha256 = patterned('a 64-character sha256', /^[0-9a-f]{64}$/, 64);
const decimalId = patterned('a decimal id', /^[0-9]+$/, 20);
const questionId = patterned('a question id like Q1', /^Q[1-9][0-9]*$/, 20);
const artifactPath = patterned(
  'a story-relative path',
  /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/,
  300
);
const modelId = patterned('a model id', /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 200);
const nanoAiu = wholeNumber('a whole number of nano-AIU, 0 or more', 0);
const count = wholeNumber('a whole number, 0 or more', 0);
const positive = wholeNumber('a whole number, 1 or more', 1);

/** Health of the API and its database. */
export const isHealth = guard<Health>(
  'Health',
  shape<Health>({
    status: oneOf(['ok', 'degraded']),
    database: oneOf(['ok', 'unavailable']),
  })
);

const usage = shape<Usage>({
  requests: count,
  nanoAiu,
  inputTokens: count,
  outputTokens: count,
});

const story = shape<Story>({
  key: storyKey,
  title: nullable(text),
  owner: actor,
  phase: nonEmptyText,
  status: oneOf(STORY_STATUSES),
  haltReason: nullable(text),
  budgetNanoAiu: nanoAiu,
  spentNanoAiu: nanoAiu,
  controlSha: sha1,
  currentRunId: nullable(runId),
  version: positive,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const jiraSprint = shape<
  JiraBacklogIssue['sprint'] extends infer Sprint
    ? Exclude<Sprint, null>
    : never
>({
  id: wholeNumber('a Jira sprint id', 0),
  name: nonEmptyText,
  state: oneOf(['active', 'future', 'closed']),
});

const jiraBacklogIssue = shape<JiraBacklogIssue>({
  key: patterned('a Jira issue key', /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/, 40),
  issueType: oneOf(['Story', 'Task', 'Bug']),
  summary: nonEmptyText,
  status: nonEmptyText,
  priority: nullable(nonEmptyText),
  updatedAt: timestamp,
  sprint: nullable(jiraSprint),
});

/** The complete Jira backlog. */
export const isJiraBacklog = guard<JiraBacklog>(
  'JiraBacklog',
  shape<JiraBacklog>({
    items: arrayOf(jiraBacklogIssue),
    total: count,
  })
);

/** A story. */
export const isStory = guard<Story>('Story', story);

/** One page of stories. */
export const isStoryPage = guard<StoryPage>(
  'StoryPage',
  shape<StoryPage>({ items: arrayOf(story), nextCursor: nullable(text) })
);

const gateVerdict = shape<GateVerdict>({
  gate: nonEmptyText,
  code: wholeNumber('a gate code from 0 to 5', 0, 5),
  result: oneOf(GATE_RESULTS),
  message: text,
});

const run = shape<Run>({
  id: runId,
  storyKey,
  phase: nonEmptyText,
  agent: text,
  model: nullable(text),
  reasoningEffort: nullable(oneOf(REASONING_EFFORTS)),
  status: oneOf(RUN_STATUSES),
  runtime: text,
  controlSha: sha1,
  budgetNanoAiu: nanoAiu,
  usage,
  replayOf: nullable(text),
  exitReason: nullable(text),
  gate: nullable(gateVerdict),
  startedBy: actor,
  createdAt: timestamp,
  startedAt: nullable(timestamp),
  endedAt: nullable(timestamp),
});

/** A run. */
export const isRun = guard<Run>('Run', run);

/** The runs of a story. */
export const isRunList = guard<ItemList<Run>>(
  'RunList',
  shape<ItemList<Run>>({ items: arrayOf(run) })
);

const question = shape<Question>({
  id: questionId,
  round: positive,
  runId,
  text,
  recommendation: nullable(text),
  answer: nullable(text),
  answeredBy: nullable(actor),
  answeredAt: nullable(timestamp),
  consumed: flag,
});

/** A question. */
export const isQuestion = guard<Question>('Question', question);

/** The questions of a story. */
export const isQuestionList = guard<ItemList<Question>>(
  'QuestionList',
  shape<ItemList<Question>>({ items: arrayOf(question) })
);

const gateRecord = shape<GateRecord>({
  id: decimalId,
  source: oneOf(GATE_SOURCES),
  gate: nonEmptyText,
  phase: nonEmptyText,
  outcome: oneOf(GATE_OUTCOMES),
  message: nullable(text),
  actor,
  runId: nullable(runId),
  createdAt: timestamp,
});

/** A gate record. */
export const isGateRecord = guard<GateRecord>('GateRecord', gateRecord);

/** The gate records of a story. */
export const isGateRecordList = guard<ItemList<GateRecord>>(
  'GateRecordList',
  shape<ItemList<GateRecord>>({ items: arrayOf(gateRecord) })
);

const artifact = shape<Artifact>({
  path: artifactPath,
  sha256,
  sizeBytes: count,
  mediaType: text,
  revision: positive,
  runId: nullable(runId),
  createdAt: timestamp,
});

/** An artifact. */
export const isArtifact = guard<Artifact>('Artifact', artifact);

/** The current artifact set of a story. */
export const isArtifactList = guard<ArtifactList>(
  'ArtifactList',
  shape<ArtifactList>({ revision: count, items: arrayOf(artifact) })
);

const event = shape<AhoyEvent>({
  id: decimalId,
  storyKey,
  type: nonEmptyText,
  actor,
  payload: record,
  createdAt: timestamp,
});

/** An event. Its `type` is open and its `payload` is only known to be an object: see `parseRunProgress`. */
export const isEvent = guard<AhoyEvent>('Event', event);

/** One page of events. */
export const isEventPage = guard<EventPage>(
  'EventPage',
  shape<EventPage>({ items: arrayOf(event), lastEventId: nullable(decimalId) })
);

const modelChoice = shape<ModelChoice>({
  model: optional(modelId),
  reasoningEffort: optional(oneOf(REASONING_EFFORTS)),
});

const slotModel = shape<SlotModel>({
  slot: oneOf(MODEL_SLOTS),
  phase: nonEmptyText,
  chosen: nullable(modelChoice),
  model: nullable(modelId),
  reasoningEffort: nullable(oneOf(REASONING_EFFORTS)),
  modelSource: oneOf(MODEL_SOURCES),
  effortSource: oneOf(EFFORT_SOURCES),
});

const catalogModel = shape<CatalogModel>({
  id: modelId,
  label: boundedText('a model label of 1 to 200 characters', 1, 200),
  reasoningEfforts: nullable(arrayOf(oneOf(REASONING_EFFORTS))),
});

const slotDefault = shape<SlotDefault>({
  slot: oneOf(MODEL_SLOTS),
  phase: nonEmptyText,
  model: nullable(modelId),
  reasoningEffort: nullable(oneOf(REASONING_EFFORTS)),
  modelSource: oneOf(['configuration', 'phase_table', 'agent_profile']),
  effortSource: oneOf(['configuration', 'phase_table', 'model_default']),
});

/** The configured catalogue, including the defaults of new stories. */
export const isModelCatalog = guard<ModelCatalog>(
  'ModelCatalog',
  shape<ModelCatalog>({
    source: oneOf(['built_in', 'file']),
    models: (value, at) =>
      Array.isArray(value) && value.length === 0
        ? `${at} must contain at least one model`
        : arrayOf(catalogModel)(value, at),
    reasoningEfforts: arrayOf(oneOf(REASONING_EFFORTS)),
    controlSha: nullable(sha1),
    defaults: arrayOf(slotDefault),
  })
);

/** The model plan of a story. */
export const isModelPlan = guard<ModelPlan>(
  'ModelPlan',
  shape<ModelPlan>({ storyKey, version: positive, slots: arrayOf(slotModel) })
);

/** The state document of a story; its `state` is read with `readStoryState`. */
export const isStoryStateDocument = guard<StoryStateDocument>(
  'StoryState',
  shape<StoryStateDocument>({ key: storyKey, version: positive, state: record })
);

/** The answer to a recorded answer: the story as it is now, and the question. */
export const isAnswerAccepted = guard<AnswerAccepted>(
  'AnswerAccepted',
  shape<AnswerAccepted>({ story, question })
);

/** The answer to a recorded decision: the story as it is now, and the record. */
export const isDecisionAccepted = guard<DecisionAccepted>(
  'DecisionAccepted',
  shape<DecisionAccepted>({ story, record: gateRecord })
);

const problemFieldError = shape<ProblemFieldError>({
  path: optional(text),
  message: text,
});

/**
 * A problem details body. The `code` is any non-empty string: the contract lists fifteen, but an error must never be
 * refused because the API grew a sixteenth.
 */
export const isProblem = guard<Problem>(
  'Problem',
  shape<Problem>({
    type: text,
    title: text,
    status: wholeNumber('an HTTP status from 400 to 599', 400, 599),
    code: nonEmptyText,
    detail: optional(text),
    instance: optional(text),
    errors: optional(arrayOf(problemFieldError)),
    currentVersion: optional(positive),
  })
);
