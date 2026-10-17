import contract from '@testing/fixtures/openapi.json';
import {
  operations,
  responseViolations,
  schemaNamed,
  violations,
} from '@testing/fixtures/contract';
import { isRecord, type MockRequest, type MockResponse } from './http';
import type { MockAhoyServer } from './server';
import { call, testServer } from './spec-helpers';

const AIU = 1_000_000_000;

/** Every request the mock answered, with its answer. */
interface Exchange {
  readonly request: MockRequest;
  readonly response: MockResponse;
}

/** Records every exchange of `server`. */
function record(server: MockAhoyServer): Exchange[] {
  const seen: Exchange[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request: MockRequest): MockResponse => {
    const response = handle(request);
    seen.push({ request, response });
    return response;
  };
  return seen;
}

/** The contract operation a request was for, by method and path template. */
function operationOf(request: MockRequest): {
  readonly operationId: string;
  readonly statuses: readonly string[];
} | null {
  const paths = isRecord(contract.paths)
    ? (contract.paths as Readonly<Record<string, unknown>>)
    : {};
  for (const op of operations()) {
    const pattern = new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (
      op.method !== request.method.toUpperCase() ||
      !pattern.test(request.path)
    )
      continue;
    const item = paths[op.path];
    const operation = isRecord(item)
      ? item[op.method.toLowerCase()]
      : undefined;
    const responses =
      isRecord(operation) && isRecord(operation['responses'])
        ? operation['responses']
        : {};
    return { operationId: op.operationId, statuses: Object.keys(responses) };
  }
  return null;
}

/** Drives every operation of phases 3 to 6, on every seed and through a whole voyage, happy and not. */
function exercise(server: MockAhoyServer, advance: (ms: number) => void): void {
  const get = (path: string) => call(server, 'GET', path);
  const post = (path: string, body: unknown) =>
    call(server, 'POST', path, body);
  const version = (key: string) =>
    (get(`/stories/${key}`).body as { version: number }).version;

  get('/health');
  get('/models');
  get('/stories');
  get('/stories?limit=2');
  get('/stories?status=terminal&limit=500');
  const page = get('/stories?limit=3').body as { nextCursor: string };
  get(`/stories?limit=3&cursor=${page.nextCursor}`);
  for (const key of [...server.state.voyages.keys()]) {
    get(`/stories/${key}`);
    const runs = get(`/stories/${key}/runs`).body as {
      items: { id: string }[];
    };
    for (const run of runs.items) get(`/runs/${run.id}`);
    get(`/stories/${key}/questions`);
    get(`/stories/${key}/gates`);
    get(`/stories/${key}/models`);
    get(`/stories/${key}/state`);
    get(`/stories/${key}/diagnosis`);
    get(`/stories/${key}/plan-fit`);
    const artifacts = get(`/stories/${key}/artifacts`).body as {
      items: { path: string }[];
    };
    for (const a of artifacts.items)
      get(`/stories/${key}/artifacts/content?path=${a.path}`);
    get(`/stories/${key}/events?limit=500`);
    get(`/stories/${key}/events?after=5&limit=1`);
  }

  // A whole voyage, with every command.
  post('/stories', {
    key: 'DEMO-1',
    title: 'Conformance voyage',
    budgetNanoAiu: 40 * AIU,
    controlRef: '0123456789abcdef0123456789abcdef01234567',
    models: { planning: { model: 'claude-sonnet-5', reasoningEffort: 'max' } },
  });
  advance(12_000);
  for (const id of ['Q1', 'Q2'])
    post(`/stories/DEMO-1/questions/${id}/answer`, {
      answer: 'POC test answer, not a product decision',
      expectedVersion: version('DEMO-1'),
    });
  advance(8_000);
  post('/stories/DEMO-1/decisions', {
    gate: 'plan_accepted',
    decision: 'send_back',
    reason: 'Add the empty state.',
    expectedVersion: version('DEMO-1'),
  });
  advance(8_000);
  post('/stories/DEMO-1/models', {
    expectedVersion: version('DEMO-1'),
    models: { planning: null, review: { model: 'claude-opus-5' } },
    reason: 'Try another reviewer',
  });
  post('/stories/DEMO-1/budget', {
    expectedVersion: version('DEMO-1'),
    budgetNanoAiu: 50 * AIU,
    reason: 'More room',
  });
  post('/stories/DEMO-1/decisions', {
    gate: 'plan_accepted',
    decision: 'approve',
    expectedVersion: version('DEMO-1'),
  });
  advance(2_500);
  post('/stories/DEMO-1/stop', {
    expectedVersion: version('DEMO-1'),
    reason: 'Pause',
  });
  advance(1_000);
  post('/stories/DEMO-1/resume', {
    expectedVersion: version('DEMO-1'),
    reason: 'Go on',
  });
  advance(40_000);
  post('/stories/DEMO-1/decisions', {
    gate: 'delivery_accepted',
    decision: 'approve',
    reason: 'Ship it',
    expectedVersion: version('DEMO-1'),
  });
  post('/stories/PROJ-123/decisions', {
    gate: 'plan_accepted',
    decision: 'reject',
    reason: 'Out of scope',
    expectedVersion: version('PROJ-123'),
  });
  for (const key of ['DEMO-1', 'PROJ-140', 'PROJ-109']) {
    get(`/stories/${key}/runs`);
    get(`/stories/${key}/state`);
    get(`/stories/${key}/diagnosis`);
    get(`/stories/${key}/plan-fit`);
    get(`/stories/${key}/events?limit=500`);
    const artifacts = get(`/stories/${key}/artifacts`).body as {
      items: { path: string }[];
    };
    for (const a of artifacts.items)
      get(`/stories/${key}/artifacts/content?path=${a.path}&revision=1`);
  }

  // Errors.
  call(server, 'GET', '/stories', undefined, { 'X-Ahoy-Actor': '' });
  get('/stories?limit=0');
  get('/stories?cursor=nope');
  get('/stories/PROJ-999');
  get('/runs/nothing');
  post('/stories', { key: 'DEMO-1', budgetNanoAiu: 1 });
  post('/stories', {
    key: 'DEMO-2',
    budgetNanoAiu: 1,
    models: {
      review: { model: 'x' },
    },
  });
  post('/stories/PROJ-131/stop', { expectedVersion: 1, reason: 'Old' });
  post('/stories/PROJ-118/stop', {
    expectedVersion: version('PROJ-118'),
    reason: 'Again',
  });
  post('/stories/PROJ-131/questions/Q1/answer', {
    answer: 'Twice',
    expectedVersion: version('PROJ-131'),
  });
  post('/stories/PROJ-131/decisions', {
    gate: 'plan_accepted',
    decision: 'approve',
    expectedVersion: version('PROJ-131'),
  });
  post('/stories/PROJ-140/decisions', {
    gate: 'delivery_accepted',
    decision: 'approve',
    expectedVersion: version('PROJ-140'),
  });
  post('/stories/PROJ-102/budget', {
    expectedVersion: version('PROJ-102'),
    budgetNanoAiu: 1,
    reason: 'Less',
  });
  post('/stories/PROJ-118/unblock', {
    reason: 'Phase 7',
    expectedVersion: version('PROJ-118'),
  });
  get('/stories/PROJ-123/artifacts/content?path=missing.md');
  call(server, 'PUT', '/stories/PROJ-123');
  server.switches.failNext = 503;
  get('/health');
  server.switches.conflictNext = 'stale_version';
  post('/stories/PROJ-131/resume', { expectedVersion: version('PROJ-131') });

  // Back to intake from planning: the questions become history and the planner asks afresh.
  post('/stories', { key: 'DEMO-3', budgetNanoAiu: 40 * AIU });
  advance(12_000);
  post('/stories/DEMO-3/refresh-intake', {
    expectedVersion: version('DEMO-3'),
    reason: 'Jira now names the export limits',
    confirmSpend: true,
  });
  advance(12_000);
  get('/stories/DEMO-3/questions');
  get('/stories/DEMO-3/events?limit=500');

  // A backlog item's refinement: queued, run, read; then one cancelled.
  post('/refinements/PROJ-145', {
    confirmSpend: true,
    notes: 'Check the CSV export limits',
  });
  get('/refinements');
  advance(10_000);
  get('/refinements');
  get('/refinements/PROJ-145');
  get('/refinements/PROJ-999');
  post('/refinements/PROJ-153', {
    confirmSpend: true,
    budgetNanoAiu: 100_000_000_001,
  });
  post('/refinements/PROJ-150', { confirmSpend: true });
  post('/refinements/PROJ-150/cancel', { reason: 'Asked for the wrong story' });
  get('/refinements/PROJ-150');

  post('/stories/PROJ-140/refresh-intake', {
    expectedVersion: version('PROJ-140'),
    reason: 'Not in planning',
    confirmSpend: true,
  });
  post('/stories/DEMO-3/refresh-intake', {
    expectedVersion: version('DEMO-3'),
    reason: 'x',
    confirmSpend: false,
  });
  post('/refinements/PROJ-151', { confirmSpend: true });
  post('/refinements/PROJ-151', { confirmSpend: true });
  post('/refinements/PROJ-145/cancel', { reason: 'Nothing in progress' });
  post('/refinements/PROJ-152', {});

  // An agent's diagnosis of a halted story: queued, run, read; one cancelled; and every way to be refused.
  post('/stories/PROJ-118/agent-diagnoses', {
    confirmSpend: true,
    notes: 'Is it the token or the cluster?',
  });
  get('/stories/PROJ-118/agent-diagnoses');
  advance(10_000);
  get('/stories/PROJ-118/agent-diagnoses');
  post('/stories/PROJ-126/agent-diagnoses', { confirmSpend: true });
  post('/stories/PROJ-126/agent-diagnoses/cancel', {
    reason: 'Asked by mistake',
  });
  get('/stories/PROJ-126/agent-diagnoses');
  post('/stories/PROJ-140/agent-diagnoses', { confirmSpend: true });
  post('/stories/PROJ-999/agent-diagnoses', { confirmSpend: true });
  get('/stories/PROJ-999/agent-diagnoses');
  post('/stories/PROJ-118/agent-diagnoses', { confirmSpend: false });
  post('/stories/PROJ-118/agent-diagnoses', {
    confirmSpend: true,
    budgetNanoAiu: 100_000_000_001,
  });
  post('/stories/PROJ-118/agent-diagnoses/cancel', {
    reason: 'Nothing in progress',
  });

  // A knowledge review of a done story (rules and lessons) and of a halted one (lessons only); one cancelled; refusals.
  post('/stories/PROJ-097/knowledge-reviews', {
    confirmSpend: true,
    notes: 'Look again at the refund rules',
  });
  post('/stories/PROJ-118/knowledge-reviews', { confirmSpend: true });
  get('/stories/PROJ-097/knowledge-reviews');
  advance(10_000);
  get('/stories/PROJ-097/knowledge-reviews');
  get('/stories/PROJ-118/knowledge-reviews');
  post('/stories/PROJ-126/knowledge-reviews', { confirmSpend: true });
  post('/stories/PROJ-126/knowledge-reviews/cancel', {
    reason: 'Asked by mistake',
  });
  get('/stories/PROJ-126/knowledge-reviews');
  post('/stories/PROJ-140/knowledge-reviews', { confirmSpend: true });
  post('/stories/PROJ-999/knowledge-reviews', { confirmSpend: true });
  get('/stories/PROJ-999/knowledge-reviews');
  post('/stories/PROJ-097/knowledge-reviews', { confirmSpend: false });
  post('/stories/PROJ-097/knowledge-reviews/cancel', {
    reason: 'Nothing in progress',
  });

  // The harness metrics and their rows, read-only; and the periods and tables the API refuses.
  get('/metrics');
  get(
    '/metrics?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z&model=sonnet'
  );
  get('/metrics?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z');
  for (const table of ['runs', 'halts', 'gates', 'errors'])
    get(`/metrics/export?table=${table}`);
  get('/metrics/export?table=halts&format=json');
  get('/metrics/export?table=stories');

  // Meetings: the seeded Finance sync, a topic and notes through every command, and the carry-over at the end.
  const patch = (path: string, body: unknown) =>
    call(server, 'PATCH', path, body);
  const meetings = get('/meetings').body as {
    items: { id: string; status: string }[];
  };
  get('/meetings?status=planned');
  get('/meeting-series');
  const running = meetings.items.find((m) => m.status === 'in_progress');
  if (running) {
    get(`/meetings/${running.id}`);
    patch(`/meetings/${running.id}`, { title: 'Finance sync · month end' });
    const added = post(`/meetings/${running.id}/topics`, {
      title: 'Refund approvals take too long',
      raisedBy: 'them',
      raisedByEmail: 'priya@example.com',
    }).body as { id: string };
    patch(`/meeting-topics/${added.id}`, { title: 'Refund approvals' });
    const note = post(`/meeting-topics/${added.id}/notes`, {
      text: 'Four days on average',
    }).body as { id: string };
    patch(`/meeting-notes/${note.id}`, { text: 'Four working days' });
    const scrap = post(`/meeting-topics/${added.id}/notes`, {
      text: 'scrap',
    }).body as { id: string };
    call(server, 'DELETE', `/meeting-notes/${scrap.id}`);
    const topics = (
      get(`/meetings/${running.id}`).body as { topics: { id: string }[] }
    ).topics.map((t) => t.id);
    call(server, 'PUT', `/meetings/${running.id}/topic-order`, {
      topicIds: [...topics].reverse(),
    });
    const extra = post(`/meetings/${running.id}/topics`, {
      title: 'Not needed',
      raisedBy: 'us',
    }).body as { id: string };
    call(server, 'DELETE', `/meeting-topics/${extra.id}`);
    const later = post(`/meetings/${running.id}/topics`, {
      title: 'Supplier prices',
      raisedBy: 'us',
    }).body as { id: string };
    post(`/meeting-topics/${later.id}/move`, undefined);
    post(`/meetings/${running.id}/start`, undefined);
    post(`/meetings/${running.id}/end`, { carryOver: [added.id] });
    post(`/meetings/${running.id}/topics`, { title: 'Late', raisedBy: 'us' });
  }
  const series = post('/meeting-series', {
    name: 'Pricing review',
    stakeholders: ['sam@example.com'],
  }).body as { id: string };
  const oneOff = post('/meetings', {
    seriesId: series.id,
    startsAt: '2026-10-20T09:00:00.000Z',
  }).body as { id: string };
  post(`/meetings/${oneOff.id}/start`, undefined);
  get('/meetings/00000000-0000-4000-8000-ffffffffffff');
  post('/meetings', { startsAt: '2026-10-20T09:00:00.000Z' });
}

describe('the mock against openapi/ahoy-v1.yaml', () => {
  const { server, clock } = testServer();
  const exchanges = record(server);
  exercise(server, (ms) => clock.advance(ms));

  it('was exercised on every operation of phases 3 to 6', () => {
    const used = new Set(
      exchanges.map((e) => operationOf(e.request)?.operationId)
    );
    for (const op of [
      'getHealth',
      'listStories',
      'startStory',
      'getStory',
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
      'getStoryDiagnosis',
      'getStoryPlanFit',
      'refreshIntake',
      'listRefinements',
      'getRefinements',
      'requestRefinement',
      'cancelRefinement',
      'listAgentDiagnoses',
      'requestAgentDiagnosis',
      'cancelAgentDiagnosis',
      'listKnowledgeReviews',
      'requestKnowledgeReview',
      'cancelKnowledgeReview',
      'getMetrics',
      'exportMetrics',
      'listMeetings',
      'createMeeting',
      'getMeeting',
      'updateMeeting',
      'startMeeting',
      'endMeeting',
      'addMeetingTopic',
      'setMeetingTopicOrder',
      'updateMeetingTopic',
      'deleteMeetingTopic',
      'moveMeetingTopic',
      'addMeetingNote',
      'updateMeetingNote',
      'deleteMeetingNote',
      'listMeetingSeries',
      'createMeetingSeries',
    ])
      expect(used.has(op), op).toBe(true);
    const statuses = new Set(exchanges.map((e) => e.response.status));
    for (const status of [
      200, 201, 202, 204, 400, 401, 404, 409, 422, 500, 503,
    ])
      expect(statuses.has(status), String(status)).toBe(true);
  });

  it("answers every success with a body its operation's schema accepts", () => {
    const problems: string[] = [];
    for (const { request, response } of exchanges) {
      const op = operationOf(request);
      if (!op || response.status >= 300 || response.kind !== 'json') continue;
      for (const v of responseViolations(op.operationId, response.body))
        problems.push(
          `${request.method} ${request.path} (${op.operationId}): ${v}`
        );
    }
    expect(problems).toEqual([]);
  });

  it('answers every success with a status its operation declares', () => {
    const problems: string[] = [];
    for (const { request, response } of exchanges) {
      const op = operationOf(request);
      if (
        op &&
        response.status < 400 &&
        !op.statuses.includes(String(response.status))
      )
        problems.push(`${op.operationId} answered ${response.status}`);
    }
    expect(problems).toEqual([]);
  });

  it('answers every error with a Problem, with a status its operation declares (or 500, which any may)', () => {
    const problems: string[] = [];
    const problem = schemaNamed('Problem');
    for (const { request, response } of exchanges) {
      if (response.status < 400) continue;
      if (response.kind !== 'json') {
        problems.push(
          `${request.path}: ${response.status} is not problem+json`
        );
        continue;
      }
      expect(response.headers['Content-Type']).toBe(
        'application/problem+json; charset=utf-8'
      );
      for (const v of violations(problem, response.body))
        problems.push(`${request.path}: ${v}`);
      const body = response.body as {
        status: number;
        code: string;
        type: string;
        title: string;
      };
      if (body.status !== response.status)
        problems.push(`${request.path}: body status ${body.status}`);
      if (
        body.type !== `urn:ahoy:problem:${body.code}` ||
        body.title !== body.code.replaceAll('_', ' ')
      )
        problems.push(
          `${request.path}: type or title not as the real API writes them`
        );
      const op = operationOf(request);
      const declared =
        op === null ||
        response.status === 500 ||
        op.statuses.includes(String(response.status));
      if (!declared)
        problems.push(`${op?.operationId}: undeclared ${response.status}`);
    }
    expect(problems).toEqual([]);
  });

  it('serves artifact text whose ETag and media type match the listing', () => {
    const problems: string[] = [];
    for (const { request, response } of exchanges) {
      if (
        operationOf(request)?.operationId !== 'getArtifactContent' ||
        response.status !== 200
      )
        continue;
      const key = request.path.split('/')[2] ?? '';
      const path = request.query.get('path');
      const revision = request.query.get('revision');
      if (revision !== null) continue;
      const listed = (
        call(server, 'GET', `/stories/${key}/artifacts`).body as {
          items: { path: string; sha256: string; mediaType: string }[];
        }
      ).items;
      const entry = listed.find((a) => a.path === path);
      if (response.kind !== 'text') problems.push(`${request.path}: not text`);
      if (entry === undefined) continue; // a later change replaced the set; the earlier answer was for its own revision
      if (
        response.headers['ETag'] !== `"${entry.sha256}"` ||
        response.headers['Content-Type'] !== entry.mediaType
      )
        problems.push(
          `${key} ${path}: ETag or media type differs from the listing`
        );
    }
    expect(problems).toEqual([]);
  });

  it('exports each metrics table as a CSV with a header line, named in Content-Disposition', () => {
    const csv = exchanges.filter(
      (e) =>
        operationOf(e.request)?.operationId === 'exportMetrics' &&
        e.response.status === 200 &&
        e.response.kind === 'text'
    );
    expect(csv.map((e) => e.request.query.get('table'))).toEqual([
      'runs',
      'halts',
      'gates',
      'errors',
    ]);
    for (const { request, response } of csv) {
      const table = request.query.get('table') ?? '';
      expect(response.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['Content-Disposition']).toMatch(
        new RegExp(
          `^attachment; filename="ahoy-${table}-\\d{4}-\\d{2}-\\d{2}\\.csv"$`
        )
      );
      const text = response.kind === 'text' ? response.body : '';
      expect(text.endsWith('\r\n')).toBe(true);
      expect(text.split('\r\n').length).toBeGreaterThan(2);
    }
  });

  it('writes only events the Event schema accepts, and run.progress payloads RunProgressPayload accepts', () => {
    const event = schemaNamed('Event');
    const progress = schemaNamed('RunProgressPayload');
    const problems: string[] = [];
    for (const e of server.state.events) {
      for (const v of violations(event, e))
        problems.push(`event ${e.id} (${e.type}): ${v}`);
      if (e.type === 'run.progress')
        for (const v of violations(progress, e.payload))
          problems.push(`event ${e.id}: ${v}`);
    }
    expect(server.state.events.length).toBeGreaterThan(300);
    expect(problems).toEqual([]);
  });

  it('gives every event a greater id than the one before, in time order', () => {
    const events = server.state.events;
    for (let i = 1; i < events.length; i++) {
      expect(Number(events[i]?.id)).toBe(Number(events[i - 1]?.id) + 1);
      expect(
        (events[i]?.createdAt ?? '') >= (events[i - 1]?.createdAt ?? '')
      ).toBe(true);
    }
  });
});
