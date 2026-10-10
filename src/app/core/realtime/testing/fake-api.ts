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
}
