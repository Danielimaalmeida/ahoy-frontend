import { fail, type ApiResult } from '@core/api/api-error';
import type { ApiClient } from '@core/api/api-client';

/** The `ApiClient` operations the realtime layer and the stores call. */
export type FakeApiOps = Pick<
  ApiClient,
  | 'listModels'
  | 'listStories'
  | 'getStory'
  | 'listStoryEvents'
  | 'getStoryState'
  | 'listStoryRuns'
  | 'listQuestions'
  | 'listGateRecords'
  | 'getStoryModels'
  | 'listArtifacts'
  | 'listRefinements'
  | 'getRefinements'
  | 'requestRefinement'
  | 'cancelRefinement'
  | 'listAgentDiagnoses'
  | 'requestAgentDiagnosis'
  | 'cancelAgentDiagnosis'
  | 'listKnowledgeReviews'
  | 'requestKnowledgeReview'
  | 'cancelKnowledgeReview'
  | 'getStoryDiagnosis'
  | 'getStoryPlanFit'
  | 'decideWorkPackage'
  | 'unblockStory'
  | 'refreshDesign'
>;

/** A call the fake saw. */
export interface FakeApiCall {
  readonly op: keyof FakeApiOps;
  readonly args: readonly unknown[];
}

/** Without a handler, an operation answers as if the API could not be reached. */
const unreachable = (): Promise<ApiResult<never>> =>
  Promise.resolve(fail({ kind: 'network' }));

/**
 * A hand-written `ApiClient` for specs: each operation records its call and answers with the handler set by {@link on}.
 * Provide it with `{ provide: ApiClient, useValue: api }`.
 */
export class FakeApi implements FakeApiOps {
  readonly calls: FakeApiCall[] = [];
  private handlers: Partial<FakeApiOps> = {};

  /** Sets how an operation answers. */
  on<K extends keyof FakeApiOps>(op: K, handler: FakeApiOps[K]): this {
    this.handlers = { ...this.handlers, [op]: handler };
    return this;
  }

  /** The calls of one operation. */
  callsOf(op: keyof FakeApiOps): readonly FakeApiCall[] {
    return this.calls.filter((call) => call.op === op);
  }

  listModels: FakeApiOps['listModels'] = () => {
    this.calls.push({ op: 'listModels', args: [] });
    return this.handlers.listModels?.() ?? unreachable();
  };

  listStories: FakeApiOps['listStories'] = (query) => {
    this.calls.push({ op: 'listStories', args: [query] });
    return this.handlers.listStories?.(query) ?? unreachable();
  };

  getStory: FakeApiOps['getStory'] = (key) => {
    this.calls.push({ op: 'getStory', args: [key] });
    return this.handlers.getStory?.(key) ?? unreachable();
  };

  listStoryEvents: FakeApiOps['listStoryEvents'] = (key, query) => {
    this.calls.push({ op: 'listStoryEvents', args: [key, query] });
    return this.handlers.listStoryEvents?.(key, query) ?? unreachable();
  };

  getStoryState: FakeApiOps['getStoryState'] = (key) => {
    this.calls.push({ op: 'getStoryState', args: [key] });
    return this.handlers.getStoryState?.(key) ?? unreachable();
  };

  listStoryRuns: FakeApiOps['listStoryRuns'] = (key) => {
    this.calls.push({ op: 'listStoryRuns', args: [key] });
    return this.handlers.listStoryRuns?.(key) ?? unreachable();
  };

  listQuestions: FakeApiOps['listQuestions'] = (key) => {
    this.calls.push({ op: 'listQuestions', args: [key] });
    return this.handlers.listQuestions?.(key) ?? unreachable();
  };

  listGateRecords: FakeApiOps['listGateRecords'] = (key) => {
    this.calls.push({ op: 'listGateRecords', args: [key] });
    return this.handlers.listGateRecords?.(key) ?? unreachable();
  };

  getStoryModels: FakeApiOps['getStoryModels'] = (key) => {
    this.calls.push({ op: 'getStoryModels', args: [key] });
    return this.handlers.getStoryModels?.(key) ?? unreachable();
  };

  listArtifacts: FakeApiOps['listArtifacts'] = (key) => {
    this.calls.push({ op: 'listArtifacts', args: [key] });
    return this.handlers.listArtifacts?.(key) ?? unreachable();
  };

  listRefinements: FakeApiOps['listRefinements'] = () => {
    this.calls.push({ op: 'listRefinements', args: [] });
    return this.handlers.listRefinements?.() ?? unreachable();
  };

  getRefinements: FakeApiOps['getRefinements'] = (key) => {
    this.calls.push({ op: 'getRefinements', args: [key] });
    return this.handlers.getRefinements?.(key) ?? unreachable();
  };

  requestRefinement: FakeApiOps['requestRefinement'] = (key, body) => {
    this.calls.push({ op: 'requestRefinement', args: [key, body] });
    return this.handlers.requestRefinement?.(key, body) ?? unreachable();
  };

  cancelRefinement: FakeApiOps['cancelRefinement'] = (key, body) => {
    this.calls.push({ op: 'cancelRefinement', args: [key, body] });
    return this.handlers.cancelRefinement?.(key, body) ?? unreachable();
  };

  listAgentDiagnoses: FakeApiOps['listAgentDiagnoses'] = (key) => {
    this.calls.push({ op: 'listAgentDiagnoses', args: [key] });
    return this.handlers.listAgentDiagnoses?.(key) ?? unreachable();
  };

  requestAgentDiagnosis: FakeApiOps['requestAgentDiagnosis'] = (key, body) => {
    this.calls.push({ op: 'requestAgentDiagnosis', args: [key, body] });
    return this.handlers.requestAgentDiagnosis?.(key, body) ?? unreachable();
  };

  cancelAgentDiagnosis: FakeApiOps['cancelAgentDiagnosis'] = (key, body) => {
    this.calls.push({ op: 'cancelAgentDiagnosis', args: [key, body] });
    return this.handlers.cancelAgentDiagnosis?.(key, body) ?? unreachable();
  };

  listKnowledgeReviews: FakeApiOps['listKnowledgeReviews'] = (key) => {
    this.calls.push({ op: 'listKnowledgeReviews', args: [key] });
    return this.handlers.listKnowledgeReviews?.(key) ?? unreachable();
  };

  requestKnowledgeReview: FakeApiOps['requestKnowledgeReview'] = (
    key,
    body
  ) => {
    this.calls.push({ op: 'requestKnowledgeReview', args: [key, body] });
    return this.handlers.requestKnowledgeReview?.(key, body) ?? unreachable();
  };

  cancelKnowledgeReview: FakeApiOps['cancelKnowledgeReview'] = (key, body) => {
    this.calls.push({ op: 'cancelKnowledgeReview', args: [key, body] });
    return this.handlers.cancelKnowledgeReview?.(key, body) ?? unreachable();
  };

  getStoryDiagnosis: FakeApiOps['getStoryDiagnosis'] = (key) => {
    this.calls.push({ op: 'getStoryDiagnosis', args: [key] });
    return this.handlers.getStoryDiagnosis?.(key) ?? unreachable();
  };

  getStoryPlanFit: FakeApiOps['getStoryPlanFit'] = (key) => {
    this.calls.push({ op: 'getStoryPlanFit', args: [key] });
    return this.handlers.getStoryPlanFit?.(key) ?? unreachable();
  };

  decideWorkPackage: FakeApiOps['decideWorkPackage'] = (
    key,
    workPackageId,
    body
  ) => {
    this.calls.push({
      op: 'decideWorkPackage',
      args: [key, workPackageId, body],
    });
    return (
      this.handlers.decideWorkPackage?.(key, workPackageId, body) ??
      unreachable()
    );
  };

  unblockStory: FakeApiOps['unblockStory'] = (key, body) => {
    this.calls.push({ op: 'unblockStory', args: [key, body] });
    return this.handlers.unblockStory?.(key, body) ?? unreachable();
  };

  refreshDesign: FakeApiOps['refreshDesign'] = (key, body) => {
    this.calls.push({ op: 'refreshDesign', args: [key, body] });
    return this.handlers.refreshDesign?.(key, body) ?? unreachable();
  };
}
