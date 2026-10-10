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
  isEventPage,
  isGateRecordList,
  isHealth,
  isJiraBacklog,
  isModelPlan,
  isModelCatalog,
  isProblem,
  isQuestionList,
  isRefinement,
  isRefinementList,
  isRefinementSummaryList,
  isRun,
  isRunList,
  isStory,
  isStoryPage,
  isStoryStateDocument,
} from './guards';
import type {
  AnswerAccepted,
  AnswerRequest,
  ArtifactContent,
  ArtifactContentQuery,
  ArtifactList,
  DecisionAccepted,
  DecisionRequest,
  EventPage,
  GateRecord,
  Health,
  ListEventsQuery,
  ListStoriesQuery,
  JiraBacklog,
  ModelPlan,
  ModelCatalog,
  Question,
  CancelRefinementRequest,
  Refinement,
  RefinementList,
  RefinementRequest,
  RefinementSummary,
  RefreshIntakeRequest,
  ResumeStoryRequest,
  Run,
  SetStoryBudgetRequest,
  SetStoryModelsRequest,
  StartStoryRequest,
  StopStoryRequest,
  Story,
  StoryPage,
  StoryStateDocument,
} from './types';

/** How long a request may take before the call gives `{ kind: "network" }`: a hung request must not hang the screen. */
export const REQUEST_TIMEOUT_MS = 30_000;

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
 * Operations of phase 7 (`resolveReview`, `decideWorkPackage`, `reopenWork`, `unblockStory`) and the event stream
 * (`streamEvents`, lane 2B) are not here.
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
