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
  isRecord,
  nonEmptyText,
  nullable,
  oneOf,
  optional,
  patterned,
  record,
  recordOf,
  shape,
  text,
  timestamp,
  wholeNumber,
  type Check,
} from './guard-kit';
import {
  DIAGNOSIS_ACTORS,
  DIAGNOSIS_KINDS,
  EFFORT_SOURCES,
  GATE_OUTCOMES,
  GATE_RESULTS,
  GATE_SOURCES,
  MEETING_STATUSES,
  MODEL_SLOTS,
  MODEL_SOURCES,
  PLAN_FIT_VERDICTS,
  READINESS_VERDICTS,
  REASONING_EFFORTS,
  REFINEMENT_STATUSES,
  RAISED_BY,
  RUN_STATUSES,
  RUNTIME_STATES,
  type RuntimeStatus,
  STORY_STATUSES,
  TOPIC_ORIGINS,
  TOPIC_STATUSES,
  type AgentDiagnosisList,
  type BacklogReadiness,
  type FitReason,
  type PlanFit,
  type StoryPlanFit,
  type AhoyEvent,
  type Diagnosis,
  type MetricsError,
  type MetricsHalt,
  type MetricsReport,
  type DiagnosisFinding,
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
  type KnowledgeReview,
  type KnowledgeReviewList,
  type Meeting,
  type MeetingList,
  type MeetingNote,
  type MeetingSeries,
  type MeetingSeriesList,
  type MeetingSummary,
  type MeetingTopic,
  type MeetingTopicLink,
  type EndMeetingResult,
  type MoveMeetingTopicResult,
  type ModelChoice,
  type CatalogModel,
  type ModelCatalog,
  type SlotDefault,
  type ModelPlan,
  type Problem,
  type ProblemFieldError,
  type Question,
  type Refinement,
  type RefinementList,
  type RefinementSummary,
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

const runtimeStatus = shape<RuntimeStatus>({
  state: oneOf(RUNTIME_STATES),
  reason: nullable(boundedText('runtime reason up to 300 characters', 0, 300)),
  message: nullable(
    boundedText('runtime message up to 300 characters', 0, 300)
  ),
  observedAt: timestamp,
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

const fitReason = shape<FitReason>({
  code: nonEmptyText,
  message: nonEmptyText,
});

const backlogReadiness = shape<BacklogReadiness>({
  verdict: oneOf(READINESS_VERDICTS),
  reasons: arrayOf(fitReason),
});

const jiraBacklogIssue = shape<JiraBacklogIssue>({
  key: patterned('a Jira issue key', /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/, 40),
  issueType: oneOf(['Story', 'Task', 'Bug']),
  summary: nonEmptyText,
  status: nonEmptyText,
  priority: nullable(nonEmptyText),
  updatedAt: timestamp,
  sprint: nullable(jiraSprint),
  readiness: backlogReadiness,
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
  runtimeStatus: optional(nullable(runtimeStatus)),
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
  supersededAt: nullable(timestamp),
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

const diagnosisFinding = shape<DiagnosisFinding>({
  kind: oneOf(DIAGNOSIS_KINDS),
  title: text,
  evidence: arrayOf(text),
  action: text,
  actor: oneOf(DIAGNOSIS_ACTORS),
  resumable: flag,
  runId: nullable(runId),
});

/** Why a story stands where it stands: its findings, none unless it is halted. */
export const isDiagnosis = guard<Diagnosis>(
  'Diagnosis',
  shape<Diagnosis>({
    key: storyKey,
    status: oneOf(STORY_STATUSES),
    phase: nonEmptyText,
    haltReason: nullable(text),
    findings: arrayOf(diagnosisFinding),
  })
);

const planFit = shape<PlanFit>({
  verdict: oneOf(PLAN_FIT_VERDICTS),
  reasons: arrayOf(fitReason),
  repositories: positive,
  packages: positive,
  criteria: count,
  longestChain: positive,
});

/** Whether a planned story suits the harness; `fit` is null before the plan. */
export const isStoryPlanFit = guard<StoryPlanFit>(
  'StoryPlanFit',
  shape<StoryPlanFit>({
    key: storyKey,
    phase: nonEmptyText,
    fit: nullable(planFit),
  })
);

/** What a refinement and its summary share: everything but the content. */
const refinementFields = {
  id: runId,
  key: storyKey,
  status: oneOf(REFINEMENT_STATUSES),
  runtimeStatus: optional(nullable(runtimeStatus)),
  notes: nullable(text),
  requestedBy: actor,
  agent: nullable(text),
  model: nullable(text),
  reasoningEffort: nullable(oneOf(REASONING_EFFORTS)),
  runtime: nullable(text),
  controlSha: sha1,
  budgetNanoAiu: nanoAiu,
  usage,
  exitReason: nullable(text),
  cancelRequested: flag,
  createdAt: timestamp,
  startedAt: nullable(timestamp),
  endedAt: nullable(timestamp),
} as const;

const refinementSummary = shape<RefinementSummary>(refinementFields);

/**
 * A refinement with its Markdown. The contract says `content` is set exactly when it succeeded; a refinement that breaks
 * that is refused, so the screen never shows text for a failed run or nothing for a succeeded one.
 */
const refinement: Check = (value, at) => {
  const why = shape<Refinement>({
    ...refinementFields,
    content: nullable(text),
  })(value, at);
  if (why !== null || !isRecord(value)) return why;
  return (value['status'] === 'succeeded') === (value['content'] !== null)
    ? null
    : `${at}.content must be set exactly when the status is succeeded`;
};

/** A refinement, as `requestRefinement` and `cancelRefinement` answer it. */
export const isRefinement = guard<Refinement>('Refinement', refinement);

/** Every refinement of one issue, newest first. */
export const isRefinementList = guard<RefinementList>(
  'RefinementList',
  shape<RefinementList>({ key: storyKey, items: arrayOf(refinement) })
);

/** Every agent diagnosis of one story, newest first; each has the shape of a refinement. */
export const isAgentDiagnosisList = guard<AgentDiagnosisList>(
  'AgentDiagnosisList',
  shape<AgentDiagnosisList>({ key: storyKey, items: arrayOf(refinement) })
);

/**
 * A knowledge review. Besides the refinement's rule for `content`, the contract says each proposed file is null until the
 * review succeeds, and `patch` is null exactly when both files are: a review that breaks either is refused, so the screen
 * never offers a patch for nothing or proposed files without their patch.
 */
const knowledgeReview: Check = (value, at) => {
  const why = shape<KnowledgeReview>({
    ...refinementFields,
    content: nullable(text),
    proposal: nullable(text),
    lessons: nullable(text),
    patch: nullable(text),
  })(value, at);
  if (why !== null || !isRecord(value)) return why;
  if ((value['status'] === 'succeeded') !== (value['content'] !== null))
    return `${at}.content must be set exactly when the status is succeeded`;
  const proposed = value['proposal'] !== null || value['lessons'] !== null;
  if (proposed && value['status'] !== 'succeeded')
    return `${at}.proposal and ${at}.lessons must be null until the review succeeds`;
  return proposed === (value['patch'] !== null)
    ? null
    : `${at}.patch must be null exactly when both proposal and lessons are`;
};

/** A knowledge review, as `requestKnowledgeReview` and `cancelKnowledgeReview` answer it. */
export const isKnowledgeReview = guard<KnowledgeReview>(
  'KnowledgeReview',
  knowledgeReview
);

/** Every knowledge review of one story, newest first. */
export const isKnowledgeReviewList = guard<KnowledgeReviewList>(
  'KnowledgeReviewList',
  shape<KnowledgeReviewList>({ key: storyKey, items: arrayOf(knowledgeReview) })
);

/** The newest refinement of each refined issue, without content. */
export const isRefinementSummaryList = guard<ItemList<RefinementSummary>>(
  'RefinementSummaryList',
  shape<ItemList<RefinementSummary>>({ items: arrayOf(refinementSummary) })
);

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

const nullableCount = nullable(count);
const isoDate = patterned('a date like 2026-10-05', /^\d{4}-\d{2}-\d{2}$/, 10);
const diagnosisActor = oneOf(DIAGNOSIS_ACTORS);
const diagnosisKind = oneOf(DIAGNOSIS_KINDS);
type Item<List> = List extends readonly (infer T)[] ? T : never;

const metricsHalt = shape<MetricsHalt>({
  storyKey,
  at: timestamp,
  reason: text,
  phase: nullable(text),
  runId: nullable(runId),
  kind: diagnosisKind,
  actor: diagnosisActor,
  action: text,
  resumedAt: nullable(timestamp),
});

const metricsError = shape<MetricsError>({
  source: oneOf(['halt', 'gate_fail', 'gate_error', 'run']),
  code: text,
  signature: text,
  phase: nullable(text),
  agent: nullable(text),
  times: count,
  stories: count,
  firstSeen: timestamp,
  lastSeen: timestamp,
  exampleStory: storyKey,
  exampleRunId: nullable(runId),
});

/** The metrics of one period: every number a whole number, every list of the shape the contract gives it. */
export const isMetricsReport = guard<MetricsReport>(
  'MetricsReport',
  shape<MetricsReport>({
    from: timestamp,
    to: timestamp,
    totals: shape<MetricsReport['totals']>({
      nanoAiu,
      runs: count,
      runsSucceeded: count,
      inputTokens: count,
      outputTokens: count,
      storiesFinished: count,
      storiesDone: count,
      storiesBlocked: count,
      medianNanoAiuPerDoneStory: nullable(nanoAiu),
      halts: count,
      haltedStories: count,
      repeatHaltStories: count,
      gateEvaluations: count,
      gatePasses: count,
      gateErrors: count,
    }),
    weeks: arrayOf(
      shape<Item<MetricsReport['weeks']>>({
        weekStart: isoDate,
        byPhase: recordOf(nanoAiu),
      })
    ),
    phases: arrayOf(
      shape<Item<MetricsReport['phases']>>({
        phase: nonEmptyText,
        runs: count,
        nanoAiu,
        medianNanoAiu: nanoAiu,
        p90NanoAiu: nanoAiu,
        runCapNanoAiu: nanoAiu,
        runsAtCap: count,
        medianDurationSeconds: nullableCount,
        inputTokens: count,
        outputTokens: count,
      })
    ),
    agents: arrayOf(
      shape<Item<MetricsReport['agents']>>({
        agent: text,
        model: nullable(text),
        runs: count,
        nanoAiu,
        medianNanoAiu: nanoAiu,
        notSucceeded: count,
      })
    ),
    runOutcomes: arrayOf(
      shape<Item<MetricsReport['runOutcomes']>>({ status: text, runs: count })
    ),
    topStories: arrayOf(
      shape<Item<MetricsReport['topStories']>>({
        key: storyKey,
        phase: nonEmptyText,
        status: oneOf(STORY_STATUSES),
        spentNanoAiu: nanoAiu,
        budgetNanoAiu: nanoAiu,
        periodNanoAiu: nanoAiu,
        runs: count,
        halts: count,
        topPhase: nonEmptyText,
        topPhaseNanoAiu: nanoAiu,
      })
    ),
    halts: arrayOf(metricsHalt),
    haltReasons: arrayOf(
      shape<Item<MetricsReport['haltReasons']>>({
        reason: text,
        kind: diagnosisKind,
        actor: diagnosisActor,
        action: text,
        halts: count,
        stories: count,
        resumed: count,
        fixedByFirstResume: count,
        medianHaltedSeconds: nullableCount,
      })
    ),
    haltWeeks: arrayOf(
      shape<Item<MetricsReport['haltWeeks']>>({
        weekStart: isoDate,
        kind: diagnosisKind,
        halts: count,
        stories: count,
        repeated: count,
      })
    ),
    repeatHalts: arrayOf(
      shape<Item<MetricsReport['repeatHalts']>>({
        storyKey,
        kind: diagnosisKind,
        halts: count,
        resumes: count,
        nanoAiuBetween: nanoAiu,
        status: text,
      })
    ),
    errors: arrayOf(metricsError),
    gates: arrayOf(
      shape<Item<MetricsReport['gates']>>({
        gate: text,
        phase: nonEmptyText,
        runs: count,
        pass: count,
        fail: count,
        rejectOrHalt: count,
        error: count,
        topFailure: nullable(
          shape<{ signature: string; times: number }>({
            signature: text,
            times: count,
          })
        ),
      })
    ),
    findings: arrayOf(
      shape<Item<MetricsReport['findings']>>({ severity: text, count })
    ),
    reworkRounds: arrayOf(
      shape<Item<MetricsReport['reworkRounds']>>({
        rounds: count,
        stories: count,
      })
    ),
    waits: arrayOf(
      shape<Item<MetricsReport['waits']>>({
        kind: oneOf(['answers', 'decision', 'resume']),
        gate: nullable(text),
        times: count,
        outcomes: recordOf(count),
        medianSeconds: nullableCount,
        p90Seconds: nullableCount,
        waitingNow: count,
        longestNowSeconds: nullableCount,
      })
    ),
    insights: arrayOf(
      shape<Item<MetricsReport['insights']>>({
        rule: oneOf([
          'phase_run_cap',
          'resume_loop',
          'gate_first_fail',
          'gate_tooling_errors',
        ]),
        title: text,
        evidence: text,
        action: text,
      })
    ),
  })
);

const uuid = patterned(
  'a UUID',
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  36
);

/** A recurring meeting; `cadenceDays` is 1 to 366, or null when the series has none. */
const meetingSeries = shape<MeetingSeries>({
  id: uuid,
  name: text,
  stakeholders: arrayOf(text),
  cadenceDays: nullable(
    wholeNumber('a whole number of days, 1 to 366', 1, 366)
  ),
  createdBy: actor,
  createdAt: timestamp,
});

/** A meeting series, as `createMeetingSeries` answers it. */
export const isMeetingSeries = guard<MeetingSeries>(
  'MeetingSeries',
  meetingSeries
);

/** Every meeting series, by name. */
export const isMeetingSeriesList = guard<MeetingSeriesList>(
  'MeetingSeriesList',
  shape<MeetingSeriesList>({ items: arrayOf(meetingSeries) })
);

const meetingNote = shape<MeetingNote>({
  id: uuid,
  topicId: uuid,
  text,
  createdBy: actor,
  createdAt: timestamp,
  updatedBy: actor,
  updatedAt: timestamp,
});

/** A note, as `addMeetingNote` and `updateMeetingNote` answer it. */
export const isMeetingNote = guard<MeetingNote>('MeetingNote', meetingNote);

const topicLink = shape<MeetingTopicLink>({
  topicId: uuid,
  meetingId: uuid,
  meetingStartsAt: timestamp,
});

/**
 * A topic. A stakeholder's e-mail goes only with a topic raised by `them`, and only a `moved` topic says where it went:
 * a topic that breaks either is refused, so the screen never names the wrong person or links a topic that is still here.
 */
const meetingTopic: Check = (value, at) => {
  const why = shape<MeetingTopic>({
    id: uuid,
    meetingId: uuid,
    title: text,
    raisedBy: oneOf(RAISED_BY),
    raisedByEmail: nullable(text),
    origin: oneOf(TOPIC_ORIGINS),
    status: oneOf(TOPIC_STATUSES),
    position: count,
    carriedFrom: nullable(topicLink),
    movedTo: nullable(topicLink),
    notes: arrayOf(meetingNote),
    createdBy: actor,
    createdAt: timestamp,
    updatedBy: actor,
    updatedAt: timestamp,
  })(value, at);
  if (why !== null || !isRecord(value)) return why;
  if (value['raisedBy'] === 'us' && value['raisedByEmail'] !== null)
    return `${at}.raisedByEmail must be null for a topic raised by us`;
  if (value['status'] === 'open' && value['movedTo'] !== null)
    return `${at}.movedTo must be null for an open topic`;
  return null;
};

/** A topic, as `addMeetingTopic` and `updateMeetingTopic` answer it. */
export const isMeetingTopic = guard<MeetingTopic>('MeetingTopic', meetingTopic);

const meetingSummaryFields = {
  id: uuid,
  seriesId: nullable(uuid),
  seriesName: nullable(text),
  title: text,
  startsAt: timestamp,
  endsAt: nullable(timestamp),
  stakeholders: arrayOf(text),
  status: oneOf(MEETING_STATUSES),
  startedAt: nullable(timestamp),
  endedAt: nullable(timestamp),
  topicCount: count,
  openTopicCount: count,
  createdBy: actor,
  createdAt: timestamp,
  updatedBy: actor,
  updatedAt: timestamp,
} as const;

/** A meeting has started exactly when it is not planned, and ended exactly when it is ended. */
const meetingTimes: Check = (value, at) => {
  if (!isRecord(value)) return null;
  const planned = value['status'] === 'planned';
  if (planned !== (value['startedAt'] === null))
    return `${at}.startedAt must be set exactly when the meeting is not planned`;
  if ((value['status'] === 'ended') !== (value['endedAt'] !== null))
    return `${at}.endedAt must be set exactly when the meeting has ended`;
  return null;
};

const meetingSummary: Check = (value, at) =>
  shape<MeetingSummary>(meetingSummaryFields)(value, at) ??
  meetingTimes(value, at);

const meeting: Check = (value, at) =>
  shape<Meeting>({ ...meetingSummaryFields, topics: arrayOf(meetingTopic) })(
    value,
    at
  ) ?? meetingTimes(value, at);

/** Every meeting, latest start first. */
export const isMeetingList = guard<MeetingList>(
  'MeetingList',
  shape<MeetingList>({ items: arrayOf(meetingSummary) })
);

/** A meeting with its topics and notes. */
export const isMeeting = guard<Meeting>('Meeting', meeting);

/** The ended meeting and the meeting that took its carried-over topics, if any. */
export const isEndMeetingResult = guard<EndMeetingResult>(
  'EndMeetingResult',
  shape<EndMeetingResult>({ meeting, nextMeeting: nullable(meeting) })
);

/** A moved topic and its copy in the next meeting. */
export const isMoveMeetingTopicResult = guard<MoveMeetingTopicResult>(
  'MoveMeetingTopicResult',
  shape<MoveMeetingTopicResult>({ topic: meetingTopic, movedTo: meetingTopic })
);

/** The empty body of a `204 No Content` answer, which the HTTP client reads as null. */
export const isNoContent = guard<null>('No content', (value, at) =>
  value === null ? null : `${at} must be empty`
);
