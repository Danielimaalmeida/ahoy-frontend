import {
  HttpHeaders,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import answerQuestion from '@testing/fixtures/answerQuestion.json';
import cancelRefinement from '@testing/fixtures/cancelRefinement.json';
import { operationNamed, requestViolations } from '@testing/fixtures/contract';
import decideHumanGate from '@testing/fixtures/decideHumanGate.json';
import getArtifactContent from '@testing/fixtures/getArtifactContent.json';
import getHealth from '@testing/fixtures/getHealth.json';
import getRefinements from '@testing/fixtures/getRefinements.json';
import getStoryDiagnosis from '@testing/fixtures/getStoryDiagnosis.json';
import getRun from '@testing/fixtures/getRun.json';
import getStory from '@testing/fixtures/getStory.json';
import getStoryModels from '@testing/fixtures/getStoryModels.json';
import getStoryState from '@testing/fixtures/getStoryState.json';
import listArtifacts from '@testing/fixtures/listArtifacts.json';
import listModels from '@testing/fixtures/listModels.json';
import listGateRecords from '@testing/fixtures/listGateRecords.json';
import listQuestions from '@testing/fixtures/listQuestions.json';
import listRefinements from '@testing/fixtures/listRefinements.json';
import listStories from '@testing/fixtures/listStories.json';
import listStoryEvents from '@testing/fixtures/listStoryEvents.json';
import listStoryRuns from '@testing/fixtures/listStoryRuns.json';
import problems from '@testing/fixtures/problems.json';
import refreshIntake from '@testing/fixtures/refreshIntake.json';
import requestRefinement from '@testing/fixtures/requestRefinement.json';
import resumeStory from '@testing/fixtures/resumeStory.json';
import setStoryBudget from '@testing/fixtures/setStoryBudget.json';
import setStoryModels from '@testing/fixtures/setStoryModels.json';
import startStory from '@testing/fixtures/startStory.json';
import stopStory from '@testing/fixtures/stopStory.json';
import { API_BASE } from './api-base';
import { ApiClient, REQUEST_TIMEOUT_MS } from './api-client';
import type { ApiResult } from './api-error';

/** What the client must do for one operation, and what the API answers. */
interface Case {
  /** The operation, as the contract names it. */
  readonly op: string;
  readonly call: (api: ApiClient) => Promise<ApiResult<unknown>>;
  readonly method: 'GET' | 'POST';
  /** The URL the client must call, query string included. */
  readonly url: string;
  /** The JSON body a POST must carry. */
  readonly body?: unknown;
  /** What the API answers, and with which status. */
  readonly reply: object;
  readonly status: number;
  /** What the call gives: the answer itself, or its `items` for the lists that are not paged. */
  readonly value: unknown;
  /** The code of a problem the API may plausibly answer this call with. */
  readonly problem: string;
}

const jiraBacklog = {
  items: [
    {
      key: 'PROJ-145',
      issueType: 'Story',
      summary: 'Show the VAT number on exported invoices',
      status: 'Open',
      priority: 'High',
      updatedAt: '2026-10-06T08:00:00.000Z',
      sprint: null,
    },
  ],
  total: 1,
};

const CASES: readonly Case[] = [
  {
    op: 'listModels',
    call: (api) => api.listModels(),
    method: 'GET',
    url: '/api/v1/models',
    reply: listModels,
    status: 200,
    value: listModels,
    problem: 'unavailable',
  },
  {
    op: 'listJiraBacklog',
    call: (api) => api.listJiraBacklog(),
    method: 'GET',
    url: '/api/v1/jira/backlog',
    reply: jiraBacklog,
    status: 200,
    value: jiraBacklog,
    problem: 'unavailable',
  },
  {
    op: 'getHealth',
    call: (api) => api.getHealth(),
    method: 'GET',
    url: '/api/v1/health',
    reply: getHealth,
    status: 200,
    value: getHealth,
    problem: 'unavailable',
  },
  {
    op: 'listStories',
    call: (api) =>
      api.listStories({ status: 'halted', limit: 500, cursor: 'abc' }),
    method: 'GET',
    url: '/api/v1/stories?status=halted&limit=500&cursor=abc',
    reply: listStories,
    status: 200,
    value: listStories,
    problem: 'validation_failed',
  },
  {
    op: 'startStory',
    call: (api) =>
      api.startStory({
        key: 'PROJ-145',
        title: 'Allow exporting invoices as CSV',
        budgetNanoAiu: 25_000_000_000,
      }),
    method: 'POST',
    url: '/api/v1/stories',
    body: {
      key: 'PROJ-145',
      title: 'Allow exporting invoices as CSV',
      budgetNanoAiu: 25_000_000_000,
    },
    reply: startStory,
    status: 201,
    value: startStory,
    problem: 'story_exists',
  },
  {
    op: 'getStory',
    call: (api) => api.getStory('PROJ-123'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123',
    reply: getStory,
    status: 200,
    value: getStory,
    problem: 'not_found',
  },
  {
    op: 'stopStory',
    call: (api) =>
      api.stopStory('PROJ-126', {
        expectedVersion: 3,
        reason: 'Wrong repository.',
      }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-126/stop',
    body: { expectedVersion: 3, reason: 'Wrong repository.' },
    reply: stopStory,
    status: 202,
    value: stopStory,
    problem: 'stale_version',
  },
  {
    op: 'resumeStory',
    call: (api) => api.resumeStory('PROJ-118', { expectedVersion: 6 }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-118/resume',
    body: { expectedVersion: 6 },
    reply: resumeStory,
    status: 202,
    value: resumeStory,
    problem: 'invalid_state',
  },
  {
    op: 'setStoryBudget',
    call: (api) =>
      api.setStoryBudget('PROJ-123', {
        expectedVersion: 9,
        budgetNanoAiu: 40_000_000_000,
        reason: 'More rounds.',
      }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-123/budget',
    body: {
      expectedVersion: 9,
      budgetNanoAiu: 40_000_000_000,
      reason: 'More rounds.',
    },
    reply: setStoryBudget,
    status: 202,
    value: setStoryBudget,
    problem: 'stale_version',
  },
  {
    op: 'getStoryModels',
    call: (api) => api.getStoryModels('PROJ-123'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123/models',
    reply: getStoryModels,
    status: 200,
    value: getStoryModels,
    problem: 'legacy_story',
  },
  {
    op: 'setStoryModels',
    call: (api) =>
      api.setStoryModels('PROJ-123', {
        expectedVersion: 9,
        models: {
          implementation: { model: 'claude-sonnet-5' },
          planning: null,
        },
      }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-123/models',
    body: {
      expectedVersion: 9,
      models: { implementation: { model: 'claude-sonnet-5' }, planning: null },
    },
    reply: setStoryModels,
    status: 202,
    value: setStoryModels,
    problem: 'validation_failed',
  },
  {
    op: 'listStoryRuns',
    call: (api) => api.listStoryRuns('PROJ-123'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123/runs',
    reply: listStoryRuns,
    status: 200,
    value: listStoryRuns.items,
    problem: 'not_found',
  },
  {
    op: 'getRun',
    call: (api) => api.getRun('r-04'),
    method: 'GET',
    url: '/api/v1/runs/r-04',
    reply: getRun,
    status: 200,
    value: getRun,
    problem: 'not_found',
  },
  {
    op: 'listQuestions',
    call: (api) => api.listQuestions('PROJ-131'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-131/questions',
    reply: listQuestions,
    status: 200,
    value: listQuestions.items,
    problem: 'not_found',
  },
  {
    op: 'answerQuestion',
    call: (api) =>
      api.answerQuestion('PROJ-131', 'Q2', {
        answer: 'Receipt page only.',
        expectedVersion: 4,
      }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-131/questions/Q2/answer',
    body: { answer: 'Receipt page only.', expectedVersion: 4 },
    reply: answerQuestion,
    status: 202,
    value: answerQuestion,
    problem: 'already_answered',
  },
  {
    op: 'listGateRecords',
    call: (api) => api.listGateRecords('PROJ-123'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123/gates',
    reply: listGateRecords,
    status: 200,
    value: listGateRecords.items,
    problem: 'not_found',
  },
  {
    op: 'decideHumanGate',
    call: (api) =>
      api.decideHumanGate('PROJ-123', {
        gate: 'plan_accepted',
        decision: 'approve',
        expectedVersion: 9,
      }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-123/decisions',
    body: { gate: 'plan_accepted', decision: 'approve', expectedVersion: 9 },
    reply: decideHumanGate,
    status: 202,
    value: decideHumanGate,
    problem: 'decision_already_recorded',
  },
  {
    op: 'getStoryState',
    call: (api) => api.getStoryState('PROJ-123'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123/state',
    reply: getStoryState,
    status: 200,
    value: getStoryState,
    problem: 'legacy_story',
  },
  {
    op: 'listArtifacts',
    call: (api) => api.listArtifacts('PROJ-123'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123/artifacts',
    reply: listArtifacts,
    status: 200,
    value: listArtifacts,
    problem: 'not_found',
  },
  {
    op: 'listStoryEvents',
    call: (api) =>
      api.listStoryEvents('PROJ-123', { after: '200', limit: 500 }),
    method: 'GET',
    url: '/api/v1/stories/PROJ-123/events?after=200&limit=500',
    reply: listStoryEvents,
    status: 200,
    value: listStoryEvents,
    problem: 'not_found',
  },
  {
    op: 'refreshIntake',
    call: (api) =>
      api.refreshIntake('PROJ-123', {
        expectedVersion: 9,
        reason: 'Jira now has the export limits',
        confirmSpend: true,
      }),
    method: 'POST',
    url: '/api/v1/stories/PROJ-123/refresh-intake',
    body: {
      expectedVersion: 9,
      reason: 'Jira now has the export limits',
      confirmSpend: true,
    },
    reply: refreshIntake,
    status: 202,
    value: refreshIntake,
    problem: 'invalid_state',
  },
  {
    op: 'listRefinements',
    call: (api) => api.listRefinements(),
    method: 'GET',
    url: '/api/v1/refinements',
    reply: listRefinements,
    status: 200,
    value: listRefinements.items,
    problem: 'unauthenticated',
  },
  {
    op: 'getStoryDiagnosis',
    call: (api) => api.getStoryDiagnosis('PROJ-118'),
    method: 'GET',
    url: '/api/v1/stories/PROJ-118/diagnosis',
    reply: getStoryDiagnosis,
    status: 200,
    value: getStoryDiagnosis,
    problem: 'not_found',
  },
  {
    op: 'getRefinements',
    call: (api) => api.getRefinements('PROJ-145'),
    method: 'GET',
    url: '/api/v1/refinements/PROJ-145',
    reply: getRefinements,
    status: 200,
    value: getRefinements,
    problem: 'validation_failed',
  },
  {
    op: 'requestRefinement',
    call: (api) =>
      api.requestRefinement('PROJ-145', {
        confirmSpend: true,
        notes: 'Check the CSV export limits',
      }),
    method: 'POST',
    url: '/api/v1/refinements/PROJ-145',
    body: { confirmSpend: true, notes: 'Check the CSV export limits' },
    reply: requestRefinement,
    status: 202,
    value: requestRefinement,
    problem: 'invalid_state',
  },
  {
    op: 'cancelRefinement',
    call: (api) =>
      api.cancelRefinement('PROJ-145', { reason: 'Asked for the wrong story' }),
    method: 'POST',
    url: '/api/v1/refinements/PROJ-145/cancel',
    body: { reason: 'Asked for the wrong story' },
    reply: cancelRefinement,
    status: 202,
    value: cancelRefinement,
    problem: 'invalid_state',
  },
];

const STATUS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** Answers a request with the given status. */
function reply(
  request: TestRequest,
  body: string | object | null,
  status: number,
  headers?: Record<string, string>
): void {
  request.flush(body, {
    status,
    statusText: STATUS_TEXT[status] ?? 'Status',
    ...(headers ? { headers: new HttpHeaders(headers) } : {}),
  });
}

const problemFor = (code: string) => problems.find((p) => p.code === code)!;

/** Whether `path` is an instance of a path template of the contract, such as `/stories/{key}/stop`. */
function matchesTemplate(template: string, path: string): boolean {
  const escape = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = template
    .split(/\{[^}]+\}/)
    .map(escape)
    .join('[^/]+');
  return new RegExp(`^${pattern}$`).test(path);
}

describe('ApiClient', () => {
  let api: ApiClient;
  let http: HttpTestingController;

  function configure(
    base = '/api/v1',
    interceptors: Parameters<typeof withInterceptors>[0] = []
  ): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors(interceptors)),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: base },
      ],
    });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => configure());
  afterEach(() => http.verify());

  describe.each(CASES)('$op', (c) => {
    it(`calls ${c.method} ${c.url} and gives the value of the ${c.status} answer`, async () => {
      const result = c.call(api);
      const request = http.expectOne({ method: c.method, url: c.url });
      if (c.method === 'POST') {
        expect(request.request.body).toEqual(c.body);
        expect(requestViolations(c.op, request.request.body)).toEqual([]);
      }
      reply(request, c.reply, c.status);
      expect(await result).toEqual({ ok: true, value: c.value });
    });

    it('is tested with the method and path the contract gives this operation', () => {
      const op = operationNamed(c.op);
      const path = c.url.replace(/^\/api\/v1/, '').replace(/\?.*$/, '');
      expect(c.method).toBe(op.method);
      expect(matchesTemplate(op.path, path)).toBe(true);
    });

    it('sends no Authorization header and sets a timeout, so a hung request becomes a network failure', async () => {
      const result = c.call(api);
      const request = http.expectOne(c.url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-Ahoy-Actor')).toBe(false);
      expect(request.request.timeout).toBe(REQUEST_TIMEOUT_MS);
      reply(request, c.reply, c.status);
      await result;
    });

    it(`gives a problem error when the API answers ${c.problem} as problem+json`, async () => {
      const body = problemFor(c.problem);
      const result = c.call(api);
      reply(http.expectOne(c.url), body, body.status);
      expect(await result).toEqual({
        ok: false,
        error: expect.objectContaining({
          kind: 'problem',
          status: body.status,
          code: c.problem,
          title: body.title,
          detail: body.detail,
        }),
      });
    });

    it("gives { kind: 'network' } when the request fails", async () => {
      const result = c.call(api);
      http.expectOne(c.url).error(new ProgressEvent('error'));
      expect(await result).toEqual({ ok: false, error: { kind: 'network' } });
    });

    it('gives invalid_response naming the call when the answer has the wrong shape', async () => {
      const result = c.call(api);
      reply(http.expectOne(c.url), { unexpected: true }, c.status);
      const outcome = await result;
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.kind).toBe('invalid_response');
      if (outcome.error.kind === 'invalid_response')
        expect(outcome.error.what).toMatch(new RegExp(`^${c.op}: .+ must be `));
    });
  });

  it('covers the implemented operations, including the Jira backlog and model catalogue', () => {
    expect([...CASES.map((c) => c.op), 'getArtifactContent'].sort()).toEqual(
      [
        'getHealth',
        'listModels',
        'listJiraBacklog',
        'listStories',
        'startStory',
        'getStory',
        'getStoryDiagnosis',
        'stopStory',
        'resumeStory',
        'setStoryBudget',
        'getStoryModels',
        'setStoryModels',
        'listStoryRuns',
        'getRun',
        'listQuestions',
        'answerQuestion',
        'listGateRecords',
        'decideHumanGate',
        'getStoryState',
        'listArtifacts',
        'getArtifactContent',
        'listStoryEvents',
        'refreshIntake',
        'listRefinements',
        'getRefinements',
        'requestRefinement',
        'cancelRefinement',
      ].sort()
    );
  });

  describe('what the answer says is wrong', () => {
    it('names the field and the value when a fractional AIU amount comes back', async () => {
      const result = api.getStory('PROJ-123');
      reply(
        http.expectOne('/api/v1/stories/PROJ-123'),
        { ...getStory, spentNanoAiu: 12.5 },
        200
      );
      expect(await result).toEqual({
        ok: false,
        error: {
          kind: 'invalid_response',
          what: 'getStory: Story.spentNanoAiu must be a whole number of nano-AIU, 0 or more (got 12.5)',
        },
      });
    });

    it('names the item when one story of a page is wrong', async () => {
      const result = api.listStories();
      reply(
        http.expectOne('/api/v1/stories'),
        {
          ...listStories,
          items: [
            listStories.items[0],
            { ...listStories.items[1], status: 'paused' },
          ],
        },
        200
      );
      const outcome = await result;
      expect(outcome.ok).toBe(false);
      if (!outcome.ok && outcome.error.kind === 'invalid_response') {
        expect(outcome.error.what).toContain(
          'StoryPage.items[1].status must be one of ready, running'
        );
      }
    });

    it('refuses an answer that is not JSON at all, even with a 200', async () => {
      const result = api.getHealth();
      http
        .expectOne('/api/v1/health')
        .error(new ProgressEvent('error'), { status: 200, statusText: 'OK' });
      expect(await result).toEqual({
        ok: false,
        error: {
          kind: 'invalid_response',
          what: 'getHealth: the body is not valid JSON',
        },
      });
    });

    it('refuses an empty answer where a value is due', async () => {
      const result = api.getHealth();
      http
        .expectOne('/api/v1/health')
        .flush(null, { status: 200, statusText: 'OK' });
      const outcome = await result;
      expect(outcome).toEqual({
        ok: false,
        error: {
          kind: 'invalid_response',
          what: 'getHealth: Health must be an object (got null)',
        },
      });
    });
  });

  describe('an error that is not problem details', () => {
    it.each([502, 503, 504])(
      'is a network failure with its status when a gateway answers %i',
      async (status) => {
        const result = api.getHealth();
        reply(
          http.expectOne('/api/v1/health'),
          '<html>Bad gateway</html>',
          status
        );
        expect(await result).toEqual({
          ok: false,
          error: { kind: 'network', status },
        });
      }
    );

    it('is a network failure when the gateway answers with nothing at all', async () => {
      const result = api.getStory('PROJ-123');
      reply(http.expectOne('/api/v1/stories/PROJ-123'), null, 503);
      expect(await result).toEqual({
        ok: false,
        error: { kind: 'network', status: 503 },
      });
    });

    it.each([
      [500, '<html>oops</html>'],
      [404, null],
      [401, { message: 'Unauthorized' }],
      [409, 'conflict'],
    ])(
      'is an invalid response when %i comes without problem details',
      async (status, body) => {
        const result = api.getHealth();
        reply(http.expectOne('/api/v1/health'), body, status);
        expect(await result).toEqual({
          ok: false,
          error: {
            kind: 'invalid_response',
            what: `getHealth: HTTP ${status} without problem details`,
          },
        });
      }
    );

    it('keeps the problem when it has details even if a gateway status carries them', async () => {
      const result = api.getHealth();
      reply(http.expectOne('/api/v1/health'), problemFor('unavailable'), 503);
      expect(await result).toEqual({
        ok: false,
        error: expect.objectContaining({
          kind: 'problem',
          status: 503,
          code: 'unavailable',
        }),
      });
    });

    it('takes the HTTP status, not the one written in the body', async () => {
      const result = api.getStory('PROJ-123');
      reply(
        http.expectOne('/api/v1/stories/PROJ-123'),
        { ...problemFor('stale_version'), status: 400 },
        409
      );
      const outcome = await result;
      expect(
        !outcome.ok && outcome.error.kind === 'problem' && outcome.error.status
      ).toBe(409);
    });
  });

  describe('every problem code of the contract', () => {
    it.each(problems.map((p) => [p.code, p] as const))(
      '%s keeps its status, title, detail and extras, and drops the type',
      async (_code, body) => {
        const result = api.getStory('PROJ-123');
        reply(http.expectOne('/api/v1/stories/PROJ-123'), body, body.status);
        expect(await result).toEqual({
          ok: false,
          error: {
            kind: 'problem',
            status: body.status,
            code: body.code,
            title: body.title,
            detail: body.detail,
            ...('errors' in body ? { errors: body.errors } : {}),
            ...('currentVersion' in body
              ? { currentVersion: body.currentVersion }
              : {}),
            ...('instance' in body ? { instance: body.instance } : {}),
          },
        });
      }
    );

    it('covers all fifteen codes', () => {
      expect(problems).toHaveLength(15);
    });
  });

  describe('a pipeline that fails by throwing', () => {
    it('reports an interceptor that throws an Error as invalid_response with its message, and does not reject', async () => {
      TestBed.resetTestingModule();
      configure('/api/v1', [
        () => throwError(() => new Error('token refresh failed')),
      ]);
      expect(await api.getHealth()).toEqual({
        ok: false,
        error: {
          kind: 'invalid_response',
          what: 'getHealth: token refresh failed',
        },
      });
    });

    it('reports anything else that was thrown as text', async () => {
      TestBed.resetTestingModule();
      configure('/api/v1', [() => throwError(() => 'boom')]);
      expect(await api.getHealth()).toEqual({
        ok: false,
        error: { kind: 'invalid_response', what: 'getHealth: boom' },
      });
    });
  });

  describe('URLs', () => {
    it('encodes path segments, so a key cannot add segments to the path', async () => {
      const result = api.getStory('A/B?x=1#y');
      const request = http.expectOne((r) =>
        r.url.startsWith('/api/v1/stories/')
      );
      expect(request.request.url).toBe('/api/v1/stories/A%2FB%3Fx%3D1%23y');
      reply(request, getStory, 200);
      await result;
    });

    it('encodes the question id and the run id too', async () => {
      const answer = api.answerQuestion('PROJ-1', 'Q 1/2', {
        answer: 'a',
        expectedVersion: 1,
      });
      const run = api.getRun('r 1');
      reply(
        http.expectOne('/api/v1/stories/PROJ-1/questions/Q%201%2F2/answer'),
        answerQuestion,
        202
      );
      reply(http.expectOne('/api/v1/runs/r%201'), getRun, 200);
      await Promise.all([answer, run]);
    });

    it('leaves out the query parameters that are not given', async () => {
      const stories = api.listStories();
      const withStatus = api.listStories({ status: 'terminal' });
      const events = api.listStoryEvents('PROJ-123');
      reply(http.expectOne('/api/v1/stories'), listStories, 200);
      reply(
        http.expectOne('/api/v1/stories?status=terminal'),
        listStories,
        200
      );
      reply(
        http.expectOne('/api/v1/stories/PROJ-123/events'),
        listStoryEvents,
        200
      );
      await Promise.all([stories, withStatus, events]);
    });

    it('accepts a base with a trailing slash without doubling it', async () => {
      TestBed.resetTestingModule();
      configure('/ahoy/api/v1/');
      const result = api.getHealth();
      reply(http.expectOne('/ahoy/api/v1/health'), getHealth, 200);
      expect(await result).toEqual({ ok: true, value: getHealth });
    });
  });

  describe('getArtifactContent', () => {
    const URL =
      '/api/v1/stories/PROJ-123/artifacts/content?path=implementation-plan.md';

    it('gives the text with its ETag and media type, read as text', async () => {
      const result = api.getArtifactContent('PROJ-123', {
        path: 'implementation-plan.md',
      });
      const request = http.expectOne(URL);
      expect(request.request.method).toBe('GET');
      expect(request.request.responseType).toBe('text');
      expect(request.request.headers.has('If-None-Match')).toBe(false);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.timeout).toBe(REQUEST_TIMEOUT_MS);
      reply(request, getArtifactContent.text, 200, {
        ETag: getArtifactContent.etag,
        'Content-Type': getArtifactContent.mediaType,
      });
      expect(await result).toEqual({
        ok: true,
        value: {
          kind: 'content',
          text: getArtifactContent.text,
          etag: getArtifactContent.etag,
          mediaType: 'text/markdown',
        },
      });
    });

    it('asks for a revision when it is given', async () => {
      const result = api.getArtifactContent('PROJ-123', {
        path: 'specs/plan.md',
        revision: 4,
      });
      const request = http.expectOne(
        '/api/v1/stories/PROJ-123/artifacts/content?path=specs/plan.md&revision=4'
      );
      expect(request.request.params.get('revision')).toBe('4');
      reply(request, 'old', 200);
      expect(await result).toEqual({
        ok: true,
        value: { kind: 'content', text: 'old', etag: null, mediaType: null },
      });
    });

    it('sends If-None-Match and gives not_modified for a 304', async () => {
      const result = api.getArtifactContent('PROJ-123', {
        path: 'implementation-plan.md',
        ifNoneMatch: '"4f1a"',
      });
      const request = http.expectOne(URL);
      expect(request.request.headers.get('If-None-Match')).toBe('"4f1a"');
      reply(request, null, 304, { ETag: '"4f1a"' });
      expect(await result).toEqual({
        ok: true,
        value: { kind: 'not_modified' },
      });
    });

    it('gives the empty text for a file with no bytes', async () => {
      const result = api.getArtifactContent('PROJ-123', {
        path: 'implementation-plan.md',
      });
      http.expectOne(URL).flush('', { status: 200, statusText: 'OK' });
      expect(await result).toEqual({
        ok: true,
        value: { kind: 'content', text: '', etag: null, mediaType: null },
      });
    });

    it('reads the problem details of an error although the body was asked for as text', async () => {
      const result = api.getArtifactContent('PROJ-123', {
        path: 'implementation-plan.md',
      });
      reply(http.expectOne(URL), problemFor('not_found'), 404);
      expect(await result).toEqual({
        ok: false,
        error: expect.objectContaining({
          kind: 'problem',
          status: 404,
          code: 'not_found',
        }),
      });
    });

    it("reads a legacy story's problem the same way", async () => {
      const result = api.getArtifactContent('PROJ-050', { path: 'state.json' });
      reply(
        http.expectOne(
          '/api/v1/stories/PROJ-050/artifacts/content?path=state.json'
        ),
        problemFor('legacy_story'),
        409
      );
      expect(await result).toEqual({
        ok: false,
        error: expect.objectContaining({
          kind: 'problem',
          code: 'legacy_story',
        }),
      });
    });

    it("gives { kind: 'network' } when the request fails and invalid_response for an error with no details", async () => {
      const failed = api.getArtifactContent('PROJ-123', {
        path: 'implementation-plan.md',
      });
      http.expectOne(URL).error(new ProgressEvent('error'));
      expect(await failed).toEqual({ ok: false, error: { kind: 'network' } });

      const odd = api.getArtifactContent('PROJ-123', {
        path: 'implementation-plan.md',
      });
      reply(http.expectOne(URL), '<html>boom</html>', 500);
      expect(await odd).toEqual({
        ok: false,
        error: {
          kind: 'invalid_response',
          what: 'getArtifactContent: HTTP 500 without problem details',
        },
      });
    });
  });
});
