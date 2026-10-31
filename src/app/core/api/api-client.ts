import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
  type HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { API_BASE, trimBase } from './api-base';
import {
  fail,
  invalidResponse,
  mapResult,
  ok,
  problemToError,
  type ApiError,
  type ApiResult,
} from './api-error';
import type { Guard } from './guard-kit';
import {
  isAnswerAccepted,
  isArtifactList,
  isDecisionAccepted,
  isAgentDiagnosisList,
  isEventPage,
  isGateRecordList,
  isHealth,
  isJiraBacklog,
  isKnowledgeReview,
  isKnowledgeReviewList,
  isCrew,
  isCrewMember,
  isCrewTimeOff,
  isMe,
  isJiraBacklogPreview,
  isJiraFieldPage,
  isJiraSettings,
  isJiraSettingsPage,
  isJiraTest,
  isAgentSettingsPage,
  isFigmaSettings,
  isFigmaSettingsPage,
  isFigmaTest,
  isTeamsCardOutcome,
  isTeamsSettings,
  isTeamsSettingsPage,
  isSettingsEventPage,
  isSonarRepository,
  isSonarServer,
  isSonarSettings,
  isEndMeetingResult,
  isMeeting,
  isMeetingList,
  isMeetingNote,
  isMeetingNoteList,
  isMeetingSeries,
  isMeetingSeriesList,
  isMeetingStoryDraft,
  isMeetingStoryDraftList,
  isMeetingTopic,
  isMetricsReport,
  isMeetingNoteAnswerResult,
  isMoveMeetingTopicResult,
  isNoContent,
  isModelPlan,
  isModelCatalog,
  isProblem,
  isQuestionList,
  isDiagnosis,
  isRefinement,
  isRefinementList,
  isRefinementSummaryList,
  isRun,
  isRunList,
  isStory,
  isStoryPage,
  isStoryPlanFit,
  isStoryStateDocument,
} from './guards';
import type {
  AddMeetingTopicRequest,
  AgentDiagnosisList,
  AgentDiagnosisRequest,
  AnswerAccepted,
  AnswerRequest,
  ArtifactContent,
  ArtifactContentQuery,
  ArtifactList,
  DecisionAccepted,
  CreateMeetingRequest,
  Crew,
  CrewChangeRequest,
  CrewMember,
  CrewMemberRequest,
  CrewRole,
  CrewTimeOff,
  CrewTimeOffRequest,
  Me,
  JiraBacklogPreview,
  JiraConnectionRequest,
  JiraFieldPage,
  JiraSettings,
  JiraSettingsChange,
  JiraSettingsPage,
  JiraTest,
  AgentSettingsChange,
  AgentSettingsPage,
  FigmaSettings,
  FigmaSettingsChange,
  FigmaSettingsPage,
  FigmaTest,
  FigmaTokenRequest,
  TeamsCardOutcome,
  TeamsSettings,
  TeamsSettingsChange,
  TeamsSettingsPage,
  TeamsWebhookRequest,
  SettingsEventPage,
  SettingsSection,
  SonarRepository,
  SonarRepositoryChange,
  SonarRepositoryRequest,
  SonarServer,
  SonarServerChange,
  SonarServerRequest,
  SonarSettings,
  CreateMeetingSeriesRequest,
  DecisionRequest,
  EndMeetingRequest,
  EndMeetingResult,
  EventPage,
  KnowledgeReview,
  KnowledgeReviewList,
  KnowledgeReviewRequest,
  GateRecord,
  Health,
  ListEventsQuery,
  ListStoriesQuery,
  JiraBacklog,
  ListMeetingNotesQuery,
  ListMeetingsQuery,
  Meeting,
  MeetingList,
  MeetingNote,
  MeetingNoteAnswerRequest,
  MeetingNoteAnswerResult,
  MeetingNoteDoneRequest,
  MeetingNoteList,
  MeetingNoteRequest,
  MeetingSeries,
  MeetingSeriesList,
  MeetingStoryDraft,
  MeetingStoryDraftList,
  MeetingStoryAnswersRequest,
  MeetingStoryDraftRequest,
  MeetingTopic,
  MeetingTopicOrderRequest,
  MetricsExport,
  MetricsFormat,
  MetricsQuery,
  MetricsReport,
  MetricsTable,
  ModelPlan,
  ModelCatalog,
  MoveMeetingTopicResult,
  Question,
  CancelRefinementRequest,
  Diagnosis,
  Refinement,
  RefinementList,
  RefinementRequest,
  RefinementSummary,
  RefreshDesignRequest,
  RefreshIntakeRequest,
  ResumeStoryRequest,
  Run,
  SetStoryBudgetRequest,
  SetStoryModelsRequest,
  StartStoryRequest,
  StopStoryRequest,
  Story,
  StoryPage,
  StoryPlanFit,
  StoryStateDocument,
  UpdateCrewMemberRequest,
  UpdateMeetingRequest,
  UpdateMeetingSeriesRequest,
  UpdateMeetingTopicRequest,
  WorkPackageDecisionRequest,
  UnblockStoryRequest,
} from './types';
import { MEETING_NOTE_IMAGE_TYPES } from './types';

/** How long a request may take before the call gives `{ kind: "network" }`: a hung request must not hang the screen. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** How long an image upload or download may take: up to 5 MiB over a slow line. */
export const IMAGE_TIMEOUT_MS = 120_000;

/** What a gateway answers with when the API behind it is down. Without problem details, these mean "no usable answer". */
const GATEWAY_STATUSES: readonly number[] = [502, 503, 504];

/** A path segment, encoded. The API rejects values its patterns do not allow with `400 validation_failed`. */
const segment = encodeURIComponent;

/** The body of an error answer: a `text` request gives it as text, which is read as JSON when it is. */
function errorBody(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** The query parameters of `getMetrics` and `exportMetrics`, only those that are set. */
function metricsParams(query: MetricsQuery): HttpParams {
  let params = new HttpParams();
  for (const name of ['from', 'to', 'owner', 'repo', 'model'] as const) {
    const value = query[name];
    if (value !== undefined) params = params.set(name, value);
  }
  return params;
}

/**
 * The same error with its body as text when a `blob` request got one as a Blob, so its problem details can be read;
 * anything else as it was.
 */
async function withTextError(thrown: unknown): Promise<unknown> {
  if (!(thrown instanceof HttpErrorResponse) || !(thrown.error instanceof Blob))
    return thrown;
  const blob = thrown.error;
  const text = await (
    typeof blob.text === 'function'
      ? blob.text()
      : new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => resolve('');
          reader.readAsText(blob);
        })
  ).catch(() => '');
  return new HttpErrorResponse({
    error: text,
    headers: thrown.headers,
    status: thrown.status,
    statusText: thrown.statusText,
    ...(thrown.url !== null ? { url: thrown.url } : {}),
  });
}

/** Turns whatever a request threw into an `ApiError`. */
function toApiError(op: string, thrown: unknown): ApiError {
  if (!(thrown instanceof HttpErrorResponse)) {
    return invalidResponse(
      op,
      thrown instanceof Error ? thrown.message : String(thrown)
    );
  }
  // Status 0: the request never got an answer (offline, DNS, refused, aborted, timed out).
  if (thrown.status === 0) return { kind: 'network' };
  // A 2xx the HTTP client could not turn into a response: the body is not the JSON it was asked for.
  if (thrown.status >= 200 && thrown.status < 300)
    return invalidResponse(op, 'the body is not valid JSON');
  const body = errorBody(thrown.error);
  if (isProblem(body)) return problemToError(thrown.status, body);
  if (GATEWAY_STATUSES.includes(thrown.status))
    return { kind: 'network', status: thrown.status };
  return invalidResponse(op, `HTTP ${thrown.status} without problem details`);
}

/**
 * The client of the Ahoy API (`/api/v1`): one method per operation of phases 3 to 6, each giving `Promise<ApiResult<T>>`.
 *
 * Nothing here throws for an expected outcome. A `problem+json` answer, a failed request and an answer that is not what
 * the contract says all come back as `{ ok: false, error }`; see {@link ApiError}. Every value that comes back has passed
 * the guard of its type. The client never writes `Authorization`: who the user is comes from the dev proxy
 * (`X-Ahoy-Actor`) or, later, from `AuthStrategy` through `authInterceptor`.
 *
 * Of phase 7 `decideWorkPackage` and `unblockStory` are here; `resolveReview`, `reopenWork` and the event stream
 * (`streamEvents`, lane 2B) are not.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = trimBase(inject(API_BASE));

  /** Liveness of the API and its database. */
  getHealth(): Promise<ApiResult<Health>> {
    return this.get('getHealth', '/health', isHealth);
  }

  /** Configured model choices and defaults, not the owner's Copilot entitlements. */
  listModels(): Promise<ApiResult<ModelCatalog>> {
    return this.get('listModels', '/models', isModelCatalog);
  }

  /** All Stories, Tasks and Bugs from the server's configured Jira backlog query, in Jira rank order. */
  listJiraBacklog(): Promise<ApiResult<JiraBacklog>> {
    return this.get('listJiraBacklog', '/jira/backlog', isJiraBacklog);
  }

  /** Where the harness spends AIU, where voyages halt and which errors repeat, for one period. Spends nothing. */
  getMetrics(query: MetricsQuery = {}): Promise<ApiResult<MetricsReport>> {
    return this.get(
      'getMetrics',
      '/metrics',
      isMetricsReport,
      metricsParams(query)
    );
  }

  /** The rows behind the metrics, as a CSV or JSON file to save: its text and the name the API gives it. */
  async exportMetrics(
    table: MetricsTable,
    format: MetricsFormat,
    query: MetricsQuery = {}
  ): Promise<ApiResult<MetricsExport>> {
    const params = metricsParams(query)
      .set('table', table)
      .set('format', format);
    try {
      const response = await firstValueFrom(
        this.http.get(this.url('/metrics/export'), {
          observe: 'response',
          responseType: 'text',
          timeout: REQUEST_TIMEOUT_MS,
          params,
        })
      );
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const named = /filename="([^"/\\]+)"/.exec(disposition)?.[1];
      return ok({
        text: response.body ?? '',
        filename: named ?? `ahoy-${table}.${format}`,
        mediaType:
          response.headers.get('Content-Type') ??
          (format === 'json' ? 'application/json' : 'text/csv'),
      });
    } catch (thrown: unknown) {
      return fail(toApiError('exportMetrics', thrown));
    }
  }

  /** One page of stories, most recently updated first. Follow `nextCursor` until it is null. */
  listStories(query: ListStoriesQuery = {}): Promise<ApiResult<StoryPage>> {
    let params = new HttpParams();
    if (query.status !== undefined) params = params.set('status', query.status);
    if (query.limit !== undefined)
      params = params.set('limit', String(query.limit));
    if (query.cursor !== undefined) params = params.set('cursor', query.cursor);
    return this.get('listStories', '/stories', isStoryPage, params);
  }

  /** Starts a story at intake. The answer (201) is the new story. */
  startStory(body: StartStoryRequest): Promise<ApiResult<Story>> {
    return this.post('startStory', '/stories', body, isStory);
  }

  /** One story. */
  getStory(key: string): Promise<ApiResult<Story>> {
    return this.get('getStory', `/stories/${segment(key)}`, isStory);
  }

  /** Halts a story and cancels its active run. The answer (202) is the story as it is now. */
  stopStory(key: string, body: StopStoryRequest): Promise<ApiResult<Story>> {
    return this.post(
      'stopStory',
      `/stories/${segment(key)}/stop`,
      body,
      isStory
    );
  }

  /** Clears a halt so the reconciler retries the phase. May spend AIU. The answer (202) is the story. */
  resumeStory(
    key: string,
    body: ResumeStoryRequest
  ): Promise<ApiResult<Story>> {
    return this.post(
      'resumeStory',
      `/stories/${segment(key)}/resume`,
      body,
      isStory
    );
  }

  /**
   * Retries or accepts a work package nothing else will move (failed, stalled, blocked or unverified), only while the
   * story is halted in implementation. `retry` may spend AIU; `accept` does not pass the pull request's gates. The answer
   * (202) is the story.
   */
  decideWorkPackage(
    key: string,
    workPackageId: string,
    body: WorkPackageDecisionRequest
  ): Promise<ApiResult<Story>> {
    return this.post(
      'decideWorkPackage',
      `/stories/${segment(key)}/work-packages/${segment(workPackageId)}/decision`,
      body,
      isStory
    );
  }

  /** Changes the story's total AIU cap, which may not go below what is spent. The answer (202) is the story. */
  setStoryBudget(
    key: string,
    body: SetStoryBudgetRequest
  ): Promise<ApiResult<Story>> {
    return this.post(
      'setStoryBudget',
      `/stories/${segment(key)}/budget`,
      body,
      isStory
    );
  }

  /** Returns a blocked story to its previous phase with more rework rounds. May spend AIU; approves nothing. */
  unblockStory(
    key: string,
    body: UnblockStoryRequest
  ): Promise<ApiResult<Story>> {
    return this.post(
      'unblockStory',
      `/stories/${segment(key)}/unblock`,
      body,
      isStory
    );
  }

  /**
   * Sends a story in planning or plan review back to intake, after Jira was updated: the plan, its approvals and open
   * questions become history, and intake and planning run again. May spend AIU. The answer (202) is the story.
   */
  refreshIntake(
    key: string,
    body: RefreshIntakeRequest
  ): Promise<ApiResult<Story>> {
    return this.post(
      'refreshIntake',
      `/stories/${segment(key)}/refresh-intake`,
      body,
      isStory
    );
  }

  /**
   * Replaces the story's design with new Figma frames, from a halted implementation or review or at the delivery gate:
   * the old design is archived, every UI package is reopened and the design phase reads the new frames. May spend AIU.
   * The answer (202) is the story.
   */
  refreshDesign(
    key: string,
    body: RefreshDesignRequest
  ): Promise<ApiResult<Story>> {
    return this.post(
      'refreshDesign',
      `/stories/${segment(key)}/refresh-design`,
      body,
      isStory
    );
  }

  /** Why the story stands where it stands, and what fixes it; no findings unless it is halted. Spends nothing. */
  getStoryDiagnosis(key: string): Promise<ApiResult<Diagnosis>> {
    return this.get(
      'getStoryDiagnosis',
      `/stories/${segment(key)}/diagnosis`,
      isDiagnosis
    );
  }

  /** Whether the story's plan suits the harness, by fixed rules; `fit` is null before the plan. Spends nothing. */
  getStoryPlanFit(key: string): Promise<ApiResult<StoryPlanFit>> {
    return this.get(
      'getStoryPlanFit',
      `/stories/${segment(key)}/plan-fit`,
      isStoryPlanFit
    );
  }

  /** The newest refinement of every refined backlog item, without content. */
  async listRefinements(): Promise<ApiResult<readonly RefinementSummary[]>> {
    const result = await this.get(
      'listRefinements',
      '/refinements',
      isRefinementSummaryList
    );
    return mapResult(result, (list) => list.items);
  }

  /** Every refinement of one backlog item, newest first, with the agent's Markdown. */
  getRefinements(key: string): Promise<ApiResult<RefinementList>> {
    return this.get(
      'getRefinements',
      `/refinements/${segment(key)}`,
      isRefinementList
    );
  }

  /** Asks an agent to pre-refine a backlog item. May spend AIU. The answer (202) is the queued refinement. */
  requestRefinement(
    key: string,
    body: RefinementRequest
  ): Promise<ApiResult<Refinement>> {
    return this.post(
      'requestRefinement',
      `/refinements/${segment(key)}`,
      body,
      isRefinement
    );
  }

  /** Stops the item's refinement in progress. The answer (202) is the refinement, cancelled or being cancelled. */
  cancelRefinement(
    key: string,
    body: CancelRefinementRequest
  ): Promise<ApiResult<Refinement>> {
    return this.post(
      'cancelRefinement',
      `/refinements/${segment(key)}/cancel`,
      body,
      isRefinement
    );
  }

  /** Every agent diagnosis of one halted story, newest first, with the agent's Markdown. */
  listAgentDiagnoses(key: string): Promise<ApiResult<AgentDiagnosisList>> {
    return this.get(
      'listAgentDiagnoses',
      `/stories/${segment(key)}/agent-diagnoses`,
      isAgentDiagnosisList
    );
  }

  /** Asks an agent to diagnose a halted story. May spend AIU. The answer (202) is the queued diagnosis. */
  requestAgentDiagnosis(
    key: string,
    body: AgentDiagnosisRequest
  ): Promise<ApiResult<Refinement>> {
    return this.post(
      'requestAgentDiagnosis',
      `/stories/${segment(key)}/agent-diagnoses`,
      body,
      isRefinement
    );
  }

  /** Stops the story's agent diagnosis in progress. The answer (202) is it, cancelled or being cancelled. */
  cancelAgentDiagnosis(
    key: string,
    body: CancelRefinementRequest
  ): Promise<ApiResult<Refinement>> {
    return this.post(
      'cancelAgentDiagnosis',
      `/stories/${segment(key)}/agent-diagnoses/cancel`,
      body,
      isRefinement
    );
  }

  /** Every knowledge review of a story, newest first, with the proposed rules, lessons and patch. */
  listKnowledgeReviews(key: string): Promise<ApiResult<KnowledgeReviewList>> {
    return this.get(
      'listKnowledgeReviews',
      `/stories/${segment(key)}/knowledge-reviews`,
      isKnowledgeReviewList
    );
  }

  /** Asks an agent for a done story's rules and lessons, or a halted story's lessons. May spend AIU. The answer (202) is the queued review. */
  requestKnowledgeReview(
    key: string,
    body: KnowledgeReviewRequest
  ): Promise<ApiResult<KnowledgeReview>> {
    return this.post(
      'requestKnowledgeReview',
      `/stories/${segment(key)}/knowledge-reviews`,
      body,
      isKnowledgeReview
    );
  }

  /** Stops the story's knowledge review in progress. The answer (202) is it, cancelled or being cancelled. */
  cancelKnowledgeReview(
    key: string,
    body: CancelRefinementRequest
  ): Promise<ApiResult<KnowledgeReview>> {
    return this.post(
      'cancelKnowledgeReview',
      `/stories/${segment(key)}/knowledge-reviews/cancel`,
      body,
      isKnowledgeReview
    );
  }

  /** The model and reasoning effort of each slot, and where each comes from. */
  getStoryModels(key: string): Promise<ApiResult<ModelPlan>> {
    return this.get(
      'getStoryModels',
      `/stories/${segment(key)}/models`,
      isModelPlan
    );
  }

  /** Chooses the model of some slots; `null` gives a slot back to the defaults. The answer (202) is the plan. */
  setStoryModels(
    key: string,
    body: SetStoryModelsRequest
  ): Promise<ApiResult<ModelPlan>> {
    return this.post(
      'setStoryModels',
      `/stories/${segment(key)}/models`,
      body,
      isModelPlan
    );
  }

  /** The runs of a story, oldest first. */
  async listStoryRuns(key: string): Promise<ApiResult<readonly Run[]>> {
    const result = await this.get(
      'listStoryRuns',
      `/stories/${segment(key)}/runs`,
      isRunList
    );
    return mapResult(result, (list) => list.items);
  }

  /** One run. */
  getRun(runId: string): Promise<ApiResult<Run>> {
    return this.get('getRun', `/runs/${segment(runId)}`, isRun);
  }

  /** Every question asked for a story, in order. */
  async listQuestions(key: string): Promise<ApiResult<readonly Question[]>> {
    const result = await this.get(
      'listQuestions',
      `/stories/${segment(key)}/questions`,
      isQuestionList
    );
    return mapResult(result, (list) => list.items);
  }

  /** Records one answer. The answer (202) holds the story as it is now and the question. */
  answerQuestion(
    key: string,
    questionId: string,
    body: AnswerRequest
  ): Promise<ApiResult<AnswerAccepted>> {
    const path = `/stories/${segment(key)}/questions/${segment(questionId)}/answer`;
    return this.post('answerQuestion', path, body, isAnswerAccepted);
  }

  /** Automated gate verdicts and human decisions, oldest first. */
  async listGateRecords(
    key: string
  ): Promise<ApiResult<readonly GateRecord[]>> {
    const result = await this.get(
      'listGateRecords',
      `/stories/${segment(key)}/gates`,
      isGateRecordList
    );
    return mapResult(result, (list) => list.items);
  }

  /** Approves, sends back or rejects at a human gate. The answer (202) holds the story and the new record. */
  decideHumanGate(
    key: string,
    body: DecisionRequest
  ): Promise<ApiResult<DecisionAccepted>> {
    return this.post(
      'decideHumanGate',
      `/stories/${segment(key)}/decisions`,
      body,
      isDecisionAccepted
    );
  }

  /** The story's state document. Read `state` with `readStoryState`. */
  getStoryState(key: string): Promise<ApiResult<StoryStateDocument>> {
    return this.get(
      'getStoryState',
      `/stories/${segment(key)}/state`,
      isStoryStateDocument
    );
  }

  /** The story's current artifact set. Older revisions are reached with `getArtifactContent`'s `revision`. */
  listArtifacts(key: string): Promise<ApiResult<ArtifactList>> {
    return this.get(
      'listArtifacts',
      `/stories/${segment(key)}/artifacts`,
      isArtifactList
    );
  }

  /**
   * The text of one artifact. With `ifNoneMatch` (an ETag from an earlier answer) an unchanged artifact answers
   * `{ kind: "not_modified" }`. The text is always read as text, JSON artifacts included.
   */
  async getArtifactContent(
    key: string,
    query: ArtifactContentQuery
  ): Promise<ApiResult<ArtifactContent>> {
    const op = 'getArtifactContent';
    let params = new HttpParams().set('path', query.path);
    if (query.revision !== undefined)
      params = params.set('revision', String(query.revision));
    const headers =
      query.ifNoneMatch !== undefined
        ? new HttpHeaders({ 'If-None-Match': query.ifNoneMatch })
        : new HttpHeaders();
    try {
      const response = await firstValueFrom(
        this.http.get(this.url(`/stories/${segment(key)}/artifacts/content`), {
          observe: 'response',
          responseType: 'text',
          timeout: REQUEST_TIMEOUT_MS,
          params,
          headers,
        })
      );
      // An empty file has no body to read: it is the empty text.
      return ok({
        kind: 'content',
        text: response.body ?? '',
        etag: response.headers.get('ETag'),
        mediaType: response.headers.get('Content-Type'),
      });
    } catch (thrown: unknown) {
      // `fetch` hands a 304 over as an error status; here it is a success: the caller's copy is current.
      if (thrown instanceof HttpErrorResponse && thrown.status === 304)
        return ok({ kind: 'not_modified' });
      return fail(toApiError(op, thrown));
    }
  }

  /** Events of a story after `after`, oldest first. Pass `lastEventId` as `after` to continue. */
  listStoryEvents(
    key: string,
    query: ListEventsQuery = {}
  ): Promise<ApiResult<EventPage>> {
    let params = new HttpParams();
    if (query.after !== undefined) params = params.set('after', query.after);
    if (query.limit !== undefined)
      params = params.set('limit', String(query.limit));
    return this.get(
      'listStoryEvents',
      `/stories/${segment(key)}/events`,
      isEventPage,
      params
    );
  }

  /** Every meeting with stakeholders, latest start first, optionally of one status. Spends nothing. */
  listMeetings(query: ListMeetingsQuery = {}): Promise<ApiResult<MeetingList>> {
    let params = new HttpParams();
    if (query.status !== undefined) params = params.set('status', query.status);
    return this.get('listMeetings', '/meetings', isMeetingList, params);
  }

  /** Plans a meeting, alone or in a series. The answer (201) is the meeting. */
  createMeeting(body: CreateMeetingRequest): Promise<ApiResult<Meeting>> {
    return this.post('createMeeting', '/meetings', body, isMeeting);
  }

  /** One meeting with its topics in order and their notes. */
  getMeeting(id: string): Promise<ApiResult<Meeting>> {
    return this.get('getMeeting', `/meetings/${segment(id)}`, isMeeting);
  }

  /** Changes a meeting's title, time or stakeholders; refused once it has ended. */
  updateMeeting(
    id: string,
    body: UpdateMeetingRequest
  ): Promise<ApiResult<Meeting>> {
    return this.send(
      'updateMeeting',
      isMeeting,
      this.http.patch<unknown>(this.url(`/meetings/${segment(id)}`), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Starts a planned meeting: from now on, a topic added to it was raised in the meeting. */
  startMeeting(id: string): Promise<ApiResult<Meeting>> {
    return this.post(
      'startMeeting',
      `/meetings/${segment(id)}/start`,
      null,
      isMeeting
    );
  }

  /**
   * Cancels a planned meeting (it did not take place) and carries the chosen open topics, with their notes, to the
   * series' next meeting.
   */
  cancelMeeting(
    id: string,
    body: EndMeetingRequest
  ): Promise<ApiResult<EndMeetingResult>> {
    return this.post(
      'cancelMeeting',
      `/meetings/${segment(id)}/cancel`,
      body,
      isEndMeetingResult
    );
  }

  /**
   * Ends (marks done) a meeting, planned or in progress, and carries the chosen open topics, with their notes, to the
   * series' next meeting.
   */
  endMeeting(
    id: string,
    body: EndMeetingRequest
  ): Promise<ApiResult<EndMeetingResult>> {
    return this.post(
      'endMeeting',
      `/meetings/${segment(id)}/end`,
      body,
      isEndMeetingResult
    );
  }

  /** Adds a topic at the end of the meeting's list. The answer (201) is the topic. */
  addMeetingTopic(
    meetingId: string,
    body: AddMeetingTopicRequest
  ): Promise<ApiResult<MeetingTopic>> {
    return this.post(
      'addMeetingTopic',
      `/meetings/${segment(meetingId)}/topics`,
      body,
      isMeetingTopic
    );
  }

  /** Puts the meeting's topics in a new order; `topicIds` names each of them once. */
  setMeetingTopicOrder(
    meetingId: string,
    body: MeetingTopicOrderRequest
  ): Promise<ApiResult<Meeting>> {
    return this.send(
      'setMeetingTopicOrder',
      isMeeting,
      this.http.put<unknown>(
        this.url(`/meetings/${segment(meetingId)}/topic-order`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** Renames a topic or changes who raised it. */
  updateMeetingTopic(
    topicId: string,
    body: UpdateMeetingTopicRequest
  ): Promise<ApiResult<MeetingTopic>> {
    return this.send(
      'updateMeetingTopic',
      isMeetingTopic,
      this.http.patch<unknown>(
        this.url(`/meeting-topics/${segment(topicId)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** Removes a topic and its notes. The answer (204) has no body. */
  deleteMeetingTopic(topicId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteMeetingTopic',
      `/meeting-topics/${segment(topicId)}`
    );
  }

  /** Moves one topic, with its notes, to the series' next meeting without ending this one. */
  moveMeetingTopic(
    topicId: string
  ): Promise<ApiResult<MoveMeetingTopicResult>> {
    return this.post(
      'moveMeetingTopic',
      `/meeting-topics/${segment(topicId)}/move`,
      null,
      isMoveMeetingTopicResult
    );
  }

  /** Adds a note under a topic. The answer (201) is the note. */
  addMeetingNote(
    topicId: string,
    body: MeetingNoteRequest
  ): Promise<ApiResult<MeetingNote>> {
    return this.post(
      'addMeetingNote',
      `/meeting-topics/${segment(topicId)}/notes`,
      body,
      isMeetingNote
    );
  }

  /** Rewrites a note. */
  updateMeetingNote(
    noteId: string,
    body: MeetingNoteRequest
  ): Promise<ApiResult<MeetingNote>> {
    return this.send(
      'updateMeetingNote',
      isMeetingNote,
      this.http.patch<unknown>(
        this.url(`/meeting-notes/${segment(noteId)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /**
   * Answers a question, marking it answered when it was open; also after its meeting ended. The answer (201) is the
   * question and the answer.
   */
  addMeetingNoteAnswer(
    noteId: string,
    body: MeetingNoteAnswerRequest
  ): Promise<ApiResult<MeetingNoteAnswerResult>> {
    return this.post(
      'addMeetingNoteAnswer',
      `/meeting-notes/${segment(noteId)}/answers`,
      body,
      isMeetingNoteAnswerResult
    );
  }

  /** Marks an action done or a question answered, or open again; also after its meeting ended. */
  setMeetingNoteDone(
    noteId: string,
    body: MeetingNoteDoneRequest
  ): Promise<ApiResult<MeetingNote>> {
    return this.post(
      'setMeetingNoteDone',
      `/meeting-notes/${segment(noteId)}/done`,
      body,
      isMeetingNote
    );
  }

  /** The notes of one kind across meetings (a series' open actions, a meeting's decisions), latest meeting first. */
  listMeetingNotes(
    query: ListMeetingNotesQuery
  ): Promise<ApiResult<MeetingNoteList>> {
    let params = new HttpParams().set('kind', query.kind);
    if (query.seriesId !== undefined)
      params = params.set('seriesId', query.seriesId);
    if (query.meetingId !== undefined)
      params = params.set('meetingId', query.meetingId);
    if (query.status !== undefined) params = params.set('status', query.status);
    return this.get(
      'listMeetingNotes',
      '/meeting-notes',
      isMeetingNoteList,
      params
    );
  }

  /**
   * Adds an image (a PNG, JPEG, WebP or GIF of at most 5 MiB) to a note; the body is the image itself. The answer (201)
   * is the note with the image last in `images`.
   */
  addMeetingNoteImage(
    noteId: string,
    image: Blob
  ): Promise<ApiResult<MeetingNote>> {
    return this.send(
      'addMeetingNoteImage',
      isMeetingNote,
      this.http.post<unknown>(
        this.url(`/meeting-notes/${segment(noteId)}/images`),
        image,
        {
          observe: 'response',
          timeout: IMAGE_TIMEOUT_MS,
          headers: new HttpHeaders({ 'Content-Type': image.type }),
        }
      )
    );
  }

  /**
   * The bytes of a note's image, to show through an object URL: an `<img>` cannot send the token, so the page reads
   * them here. Anything but one of the four image formats is an invalid response.
   */
  async getMeetingNoteImage(imageId: string): Promise<ApiResult<Blob>> {
    const op = 'getMeetingNoteImage';
    try {
      const response = await firstValueFrom(
        this.http.get(this.url(`/meeting-note-images/${segment(imageId)}`), {
          observe: 'response',
          responseType: 'blob',
          timeout: IMAGE_TIMEOUT_MS,
        })
      );
      const [type = ''] = (response.headers.get('Content-Type') ?? '').split(
        ';'
      );
      const known = MEETING_NOTE_IMAGE_TYPES.find((t) => t === type.trim());
      if (response.body === null || known === undefined)
        return fail(
          invalidResponse(
            op,
            `the answer is not an image (${type || 'no type'})`
          )
        );
      return ok(new Blob([response.body], { type: known }));
    } catch (thrown: unknown) {
      return fail(toApiError(op, await withTextError(thrown)));
    }
  }

  /** Removes an image from a note. The answer (204) has no body. */
  deleteMeetingNoteImage(imageId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteMeetingNoteImage',
      `/meeting-note-images/${segment(imageId)}`
    );
  }

  /** Removes a note. The answer (204) has no body. */
  deleteMeetingNote(noteId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteMeetingNote',
      `/meeting-notes/${segment(noteId)}`
    );
  }

  /** Sets where the series' drafted stories are created in Jira; a null project turns creating off. */
  updateMeetingSeries(
    seriesId: string,
    body: UpdateMeetingSeriesRequest
  ): Promise<ApiResult<MeetingSeries>> {
    return this.send(
      'updateMeetingSeries',
      isMeetingSeries,
      this.http.patch<unknown>(
        this.url(`/meeting-series/${segment(seriesId)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** The meeting's story drafts that were not discarded, newest first. */
  listMeetingStoryDrafts(
    meetingId: string
  ): Promise<ApiResult<MeetingStoryDraftList>> {
    return this.get(
      'listMeetingStoryDrafts',
      `/meetings/${segment(meetingId)}/story-drafts`,
      isMeetingStoryDraftList
    );
  }

  /** Asks the agent to draft a user story from a topic. May spend AIU: needs `confirmSpend`. The answer is 202. */
  requestMeetingStoryDraft(
    topicId: string,
    body: MeetingStoryDraftRequest
  ): Promise<ApiResult<MeetingStoryDraft>> {
    return this.post(
      'requestMeetingStoryDraft',
      `/meeting-topics/${segment(topicId)}/story-drafts`,
      body,
      isMeetingStoryDraft
    );
  }

  /**
   * Sends the answers to a grill's questions, once, and queues the run that writes the story from them. May spend AIU:
   * needs `confirmSpend`. The answer is 202.
   */
  answerMeetingStoryQuestions(
    draftId: string,
    body: MeetingStoryAnswersRequest
  ): Promise<ApiResult<MeetingStoryDraft>> {
    return this.post(
      'answerMeetingStoryQuestions',
      `/meeting-story-drafts/${segment(draftId)}/answers`,
      body,
      isMeetingStoryDraft
    );
  }

  /** One story draft, with its story once the agent has written it. */
  getMeetingStoryDraft(draftId: string): Promise<ApiResult<MeetingStoryDraft>> {
    return this.get(
      'getMeetingStoryDraft',
      `/meeting-story-drafts/${segment(draftId)}`,
      isMeetingStoryDraft
    );
  }

  /** Discards a draft not yet created in Jira ("Write it again"). The answer (204) has no body. */
  discardMeetingStoryDraft(draftId: string): Promise<ApiResult<null>> {
    return this.delete(
      'discardMeetingStoryDraft',
      `/meeting-story-drafts/${segment(draftId)}`
    );
  }

  /** Creates a ready draft's story in Jira, in its series' project. Writes to Jira; a second call creates nothing. */
  createMeetingStoryIssue(
    draftId: string
  ): Promise<ApiResult<MeetingStoryDraft>> {
    return this.post(
      'createMeetingStoryIssue',
      `/meeting-story-drafts/${segment(draftId)}/create-issue`,
      null,
      isMeetingStoryDraft
    );
  }

  /** Every meeting series, by name. */
  listMeetingSeries(): Promise<ApiResult<MeetingSeriesList>> {
    return this.get(
      'listMeetingSeries',
      '/meeting-series',
      isMeetingSeriesList
    );
  }

  /** Adds a meeting series. The answer (201) is the series. */
  createMeetingSeries(
    body: CreateMeetingSeriesRequest
  ): Promise<ApiResult<MeetingSeries>> {
    return this.post(
      'createMeetingSeries',
      '/meeting-series',
      body,
      isMeetingSeries
    );
  }

  /** The crew page: members and their time off, and who is on in the current sprint and the next five. */
  getCrew(): Promise<ApiResult<Crew>> {
    return this.get('getCrew', '/crew', isCrew);
  }

  /** Adds a member to the crew. The answer (201) is the member. */
  addCrewMember(body: CrewMemberRequest): Promise<ApiResult<CrewMember>> {
    return this.post('addCrewMember', '/crew/members', body, isCrewMember);
  }

  /** Renames a member or changes the turns they take. */
  updateCrewMember(
    memberId: string,
    body: UpdateCrewMemberRequest
  ): Promise<ApiResult<CrewMember>> {
    return this.send(
      'updateCrewMember',
      isCrewMember,
      this.http.patch<unknown>(
        this.url(`/crew/members/${segment(memberId)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** Removes a member with their time off and the changes that name them. The answer (204) has no body. */
  deleteCrewMember(memberId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteCrewMember',
      `/crew/members/${segment(memberId)}`
    );
  }

  /** Records days a member is away. The answer (201) is the time off. */
  addCrewTimeOff(
    memberId: string,
    body: CrewTimeOffRequest
  ): Promise<ApiResult<CrewTimeOff>> {
    return this.post(
      'addCrewTimeOff',
      `/crew/members/${segment(memberId)}/time-off`,
      body,
      isCrewTimeOff
    );
  }

  /** Removes a time off. The answer (204) has no body. */
  deleteCrewTimeOff(timeOffId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteCrewTimeOff',
      `/crew/time-off/${segment(timeOffId)}`
    );
  }

  /** Changes who is on for a role in a sprint, named by its first day. The answer (204) has no body. */
  changeCrewSprint(
    startsOn: string,
    role: CrewRole,
    body: CrewChangeRequest
  ): Promise<ApiResult<null>> {
    return this.send(
      'changeCrewSprint',
      isNoContent,
      this.http.put<unknown>(
        this.url(`/crew/sprints/${segment(startsOn)}/${segment(role)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** Undoes a sprint's change for a role, so the order decides again. The answer (204) has no body. */
  clearCrewSprintChange(
    startsOn: string,
    role: CrewRole
  ): Promise<ApiResult<null>> {
    return this.delete(
      'clearCrewSprintChange',
      `/crew/sprints/${segment(startsOn)}/${segment(role)}`
    );
  }

  /** Who the signed-in person is, and whether they may change the team's settings. */
  getMe(): Promise<ApiResult<Me>> {
    return this.get('getMe', '/me', isMe);
  }

  /** The SonarQube servers CI fixes read and which repository is on which. No token comes back. */
  getSonarSettings(): Promise<ApiResult<SonarSettings>> {
    return this.get('getSonarSettings', '/settings/sonar', isSonarSettings);
  }

  /** Adds a SonarQube server with its token (admins only). The answer (201) is the server, without the token. */
  addSonarServer(body: SonarServerRequest): Promise<ApiResult<SonarServer>> {
    return this.post(
      'addSonarServer',
      '/settings/sonar/servers',
      body,
      isSonarServer
    );
  }

  /** Renames, moves, re-keys or makes a server the default (admins only); a new host needs the token again. */
  updateSonarServer(
    serverId: string,
    body: SonarServerChange
  ): Promise<ApiResult<SonarServer>> {
    return this.send(
      'updateSonarServer',
      isSonarServer,
      this.http.patch<unknown>(
        this.url(`/settings/sonar/servers/${segment(serverId)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** Removes a server no repository is on (admins only). The answer (204) has no body. */
  deleteSonarServer(serverId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteSonarServer',
      `/settings/sonar/servers/${segment(serverId)}`
    );
  }

  /** Puts a repository on a server (admins only). The answer (201) is the repository. */
  addSonarRepository(
    body: SonarRepositoryRequest
  ): Promise<ApiResult<SonarRepository>> {
    return this.post(
      'addSonarRepository',
      '/settings/sonar/repositories',
      body,
      isSonarRepository
    );
  }

  /** Moves a repository to another server or changes its project key (admins only). */
  updateSonarRepository(
    repositoryId: string,
    body: SonarRepositoryChange
  ): Promise<ApiResult<SonarRepository>> {
    return this.send(
      'updateSonarRepository',
      isSonarRepository,
      this.http.patch<unknown>(
        this.url(`/settings/sonar/repositories/${segment(repositoryId)}`),
        body,
        { observe: 'response', timeout: REQUEST_TIMEOUT_MS }
      )
    );
  }

  /** Takes a repository off its server (admins only). The answer (204) has no body. */
  deleteSonarRepository(repositoryId: string): Promise<ApiResult<null>> {
    return this.delete(
      'deleteSonarRepository',
      `/settings/sonar/repositories/${segment(repositoryId)}`
    );
  }

  /** Jira as the team set it (null while it is off), and whether the person may change it. No token comes back. */
  getJiraSettings(): Promise<ApiResult<JiraSettingsPage>> {
    return this.get('getJiraSettings', '/settings/jira', isJiraSettingsPage);
  }

  /** Connects Jira, or changes its base URL or token (admins only); moving to another URL needs the token again. */
  putJiraConnection(
    body: JiraConnectionRequest
  ): Promise<ApiResult<JiraSettings>> {
    return this.send(
      'putJiraConnection',
      isJiraSettings,
      this.http.put<unknown>(this.url('/settings/jira/connection'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Changes the backlog query, the crew's board or the meeting stories' prefix and fields (admins only). */
  updateJiraSettings(
    body: JiraSettingsChange
  ): Promise<ApiResult<JiraSettings>> {
    return this.send(
      'updateJiraSettings',
      isJiraSettings,
      this.http.patch<unknown>(this.url('/settings/jira'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Turns Jira off (admins only). The answer (204) has no body. */
  deleteJiraSettings(): Promise<ApiResult<null>> {
    return this.delete('deleteJiraSettings', '/settings/jira');
  }

  /** Asks Jira who the stored token is and keeps the answer as the last test (admins only). 0 AIU. */
  testJiraConnection(): Promise<ApiResult<JiraTest>> {
    return this.post(
      'testJiraConnection',
      '/settings/jira/test',
      null,
      isJiraTest
    );
  }

  /** How many issues a backlog query matches, and the first, before it is saved (admins only). 0 AIU. */
  previewJiraBacklog(jql: string): Promise<ApiResult<JiraBacklogPreview>> {
    return this.post(
      'previewJiraBacklog',
      '/settings/jira/backlog-preview',
      { jql },
      isJiraBacklogPreview
    );
  }

  /** Jira's fields whose name or id holds `q`, at most 25, for adding a fixed field (admins only). 0 AIU. */
  listJiraFields(q?: string): Promise<ApiResult<JiraFieldPage>> {
    const params =
      q !== undefined && q.trim() !== ''
        ? new HttpParams().set('q', q.trim())
        : undefined;
    return this.get(
      'listJiraFields',
      '/settings/jira/fields',
      isJiraFieldPage,
      params
    );
  }

  /** The crew's Teams channel as the team set it (null while it is off). The webhook comes back only as its host. */
  getTeamsSettings(): Promise<ApiResult<TeamsSettingsPage>> {
    return this.get('getTeamsSettings', '/settings/teams', isTeamsSettingsPage);
  }

  /** Connects the crew's channel, or gives it a new webhook (admins only); the address is sealed and never returned. */
  putTeamsWebhook(
    body: TeamsWebhookRequest
  ): Promise<ApiResult<TeamsSettings>> {
    return this.send(
      'putTeamsWebhook',
      isTeamsSettings,
      this.http.put<unknown>(this.url('/settings/teams/webhook'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Sets or clears the UI's address the cards' "Open Crew" button opens (admins only). */
  updateTeamsSettings(
    body: TeamsSettingsChange
  ): Promise<ApiResult<TeamsSettings>> {
    return this.send(
      'updateTeamsSettings',
      isTeamsSettings,
      this.http.patch<unknown>(this.url('/settings/teams'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Disconnects the crew's channel (admins only). The answer (204) has no body. */
  deleteTeamsSettings(): Promise<ApiResult<null>> {
    return this.delete('deleteTeamsSettings', '/settings/teams');
  }

  /** Posts a test card to the whole channel (admins only); Teams' refusal is an outcome, not an error. 0 AIU. */
  sendTeamsTestCard(): Promise<ApiResult<TeamsCardOutcome>> {
    return this.post(
      'sendTeamsTestCard',
      '/settings/teams/test',
      null,
      isTeamsCardOutcome
    );
  }

  /** Figma as the team saved it, or the defaults; the token comes back only as its last four characters. */
  getFigmaSettings(): Promise<ApiResult<FigmaSettingsPage>> {
    return this.get('getFigmaSettings', '/settings/figma', isFigmaSettingsPage);
  }

  /** Saves Figma's token, the first or a new one (admins only). */
  putFigmaToken(body: FigmaTokenRequest): Promise<ApiResult<FigmaSettings>> {
    return this.send(
      'putFigmaToken',
      isFigmaSettings,
      this.http.put<unknown>(this.url('/settings/figma/token'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Removes Figma's token (admins only), keeping the UI builders and the prefix. */
  deleteFigmaToken(): Promise<ApiResult<FigmaSettings>> {
    return this.send(
      'deleteFigmaToken',
      isFigmaSettings,
      this.http.delete<unknown>(this.url('/settings/figma/token'), {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Changes the UI builders or the design kit's prefix (admins only). */
  updateFigmaSettings(
    body: FigmaSettingsChange
  ): Promise<ApiResult<FigmaSettings>> {
    return this.send(
      'updateFigmaSettings',
      isFigmaSettings,
      this.http.patch<unknown>(this.url('/settings/figma'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Asks Figma who the stored token is and keeps the answer as the last test (admins only). 0 AIU. */
  testFigmaToken(): Promise<ApiResult<FigmaTest>> {
    return this.post(
      'testFigmaToken',
      '/settings/figma/test',
      null,
      isFigmaTest
    );
  }

  /** Who runs each of the agents' jobs, the profiles at the content repository's HEAD and the jobs whose profile is gone. */
  getAgentSettings(): Promise<ApiResult<AgentSettingsPage>> {
    return this.get(
      'getAgentSettings',
      '/settings/agents',
      isAgentSettingsPage
    );
  }

  /**
   * Changes who runs a job, turns Story drafts or Business-rule review on or off, or sets the knowledge repository
   * (admins only). Turning a job on spends AIU outside a story's budget from then on, so it needs `confirmSpend: true`.
   */
  updateAgentSettings(
    body: AgentSettingsChange
  ): Promise<ApiResult<AgentSettingsPage>> {
    return this.send(
      'updateAgentSettings',
      isAgentSettingsPage,
      this.http.patch<unknown>(this.url('/settings/agents'), body, {
        observe: 'response',
        timeout: REQUEST_TIMEOUT_MS,
      })
    );
  }

  /** Who changed which team setting and when, newest first; `section` keeps one part of the settings. */
  listSettingsEvents(
    limit?: number,
    section?: SettingsSection
  ): Promise<ApiResult<SettingsEventPage>> {
    let params = new HttpParams();
    if (limit !== undefined) params = params.set('limit', String(limit));
    if (section !== undefined) params = params.set('section', section);
    return this.get(
      'listSettingsEvents',
      '/settings/events',
      isSettingsEventPage,
      params.keys().length > 0 ? params : undefined
    );
  }

  private url(path: string): string {
    return `${this.base}${path}`;
  }

  private get<T>(
    op: string,
    path: string,
    accept: Guard<T>,
    params?: HttpParams
  ): Promise<ApiResult<T>> {
    // Options are spread only when set: an explicit `undefined` would override the HttpClient's own.
    const request = this.http.get<unknown>(this.url(path), {
      observe: 'response',
      timeout: REQUEST_TIMEOUT_MS,
      ...(params !== undefined ? { params } : {}),
    });
    return this.send(op, accept, request);
  }

  private post<T>(
    op: string,
    path: string,
    body: unknown,
    accept: Guard<T>
  ): Promise<ApiResult<T>> {
    const request = this.http.post<unknown>(this.url(path), body, {
      observe: 'response',
      timeout: REQUEST_TIMEOUT_MS,
    });
    return this.send(op, accept, request);
  }

  private delete(op: string, path: string): Promise<ApiResult<null>> {
    const request = this.http.delete<unknown>(this.url(path), {
      observe: 'response',
      timeout: REQUEST_TIMEOUT_MS,
    });
    return this.send(op, isNoContent, request);
  }

  /** Waits for the answer and turns it, or whatever went wrong, into an `ApiResult`. Never rejects. */
  private async send<T>(
    op: string,
    accept: Guard<T>,
    request: Observable<HttpResponse<unknown>>
  ): Promise<ApiResult<T>> {
    try {
      const { body } = await firstValueFrom(request);
      if (accept(body)) return ok(body);
      return fail(
        invalidResponse(
          op,
          accept.explain(body) ?? 'the body is not what the contract says'
        )
      );
    } catch (thrown: unknown) {
      return fail(toApiError(op, thrown));
    }
  }
}
