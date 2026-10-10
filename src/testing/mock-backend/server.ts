/**
 * `MockAhoyServer`: an in-memory, deterministic double of the Ahoy API (`openapi/ahoy-v1.yaml`) for development and tests,
 * with no API, Docker or Postgres. It is a double of the contract, not the source of truth: it checks each of its own
 * answers against the contract before giving it (a `500` naming the difference otherwise), and its conformance specs
 * check every answer against the YAML with Ajv.
 *
 * Like the real server (`apps/api/src/server.ts` of `ahoy-hosted`) it routes by the contract's `paths`, checks every
 * parameter and body against the contract's schemas (`400 validation_failed` with `errors`), reads the actor from
 * `X-Ahoy-Actor` (`AHOY_AUTH=dev`), refuses stale `expectedVersion`s with `409 stale_version` and `currentVersion`, and
 * answers with the same problem shapes. A {@link Simulator} plays the reconciler on the mock's clock.
 *
 * Plain TypeScript with no Angular, so the same code runs in the browser (`npm run start:mock`), in specs, and in Node
 * (`npm run mock:api`): never two mocks.
 */
import type {
  DecisionRequest,
  ModelChoice,
  ModelSlot,
  ProblemCode,
  ResumeStoryRequest,
  SetStoryBudgetRequest,
  SetStoryModelsRequest,
  StartStoryRequest,
  StopStoryRequest,
  StoryPage,
  AnswerRequest,
  JiraBacklog,
} from '@core/api/types';
import { realClock, type MockClock } from './clock';
import { KEEPALIVE_MS, StreamHub } from './event-stream';
import {
  isRecord,
  jsonResponse,
  MockProblem,
  problemResponse,
  type FieldError,
  type MockRequest,
  type MockResponse,
} from './http';
import { SchemaChecker, unstorableText } from './schema';
import { seedVoyages } from './seeds';
import { LIVE_TIMING, Simulator, type SimulationTiming } from './simulator';
import {
  artifactFile,
  DEFAULT_CONTROL_SHA,
  eventDto,
  PHASE_TABLE,
  PLAN_FILE,
  REVISION_CEILING,
  SLOTS,
  Voyage,
} from './voyage';
import { World } from './world';
import listModels from '@testing/fixtures/listModels.json';

const jiraBacklog: JiraBacklog = {
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
    {
      key: 'PROJ-146',
      issueType: 'Bug',
      summary: 'Keep the voyage timeline readable on narrow screens',
      status: 'In Progress',
      priority: 'Medium',
      updatedAt: '2026-10-05T15:30:00.000Z',
      sprint: { id: 12, name: 'Sprint 12', state: 'active' },
    },
    {
      key: 'PROJ-147',
      issueType: 'Task',
      summary: 'Document the Ahoy event stream reconnect behaviour',
      status: 'Open',
      priority: null,
      updatedAt: '2026-10-04T11:15:00.000Z',
      sprint: { id: 13, name: 'Sprint 13', state: 'future' },
    },
  ],
  total: 3,
};

/** What a {@link MockAhoyServer} is made with. */
export interface MockServerOptions {
  /** The contract document (the parsed `openapi/ahoy-v1.yaml`, as in `src/testing/fixtures/openapi.json`). */
  readonly contract: unknown;
  /** The clock of the simulation; the real one by default. Specs pass a `ManualClock`. */
  readonly clock?: MockClock;
  /** How fast the simulated reconciler moves. */
  readonly timing?: SimulationTiming;
  /** Whether to load the eight voyages of the wireframes (default true). */
  readonly seed?: boolean;
  /** The instant the seeded history leads up to (default: the clock's now). */
  readonly seedAt?: number;
  /** How long an idle event stream waits before a `: keepalive` (default 15 s, as the real API). */
  readonly keepaliveMs?: number;
}

/** The interruptors of the mock (plan, lane 2D): set them to rehearse failures. */
export interface MockSwitches {
  /** Delay of every answer, applied by the adapters. */
  latencyMs: number;
  /** The next API request answers this HTTP status (a problem; 502 and 504 a gateway's HTML page). One-shot. */
  failNext: number | null;
  /** The next command (a POST that passed validation) answers 409 with this code. One-shot. */
  conflictNext: ProblemCode | null;
}

/** The codes `conflictNext` accepts. */
export const CONFLICT_CODES: readonly ProblemCode[] = [
  'stale_version',
  'decision_already_recorded',
  'already_answered',
  'invalid_state',
  'story_exists',
  'revision_ceiling_reached',
  'legacy_story',
];

interface Param {
  readonly name: string;
  readonly in: string;
  readonly required: boolean;
  readonly schema: unknown;
}

interface Route {
  readonly method: string;
  readonly template: string;
  readonly pattern: RegExp;
  readonly names: readonly string[];
  readonly operationId: string;
  readonly params: readonly Param[];
  readonly body: unknown;
  /** The operation's `responses`, by status (`"200"`, `"409"`, `default`). */
  readonly responses: Readonly<Record<string, unknown>>;
  readonly anonymous: boolean;
}

/** A request after routing and validation. */
interface Call {
  readonly actor: string;
  readonly path: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string | number>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

const BASE = '/api/v1';

/** The operations the mock does not simulate (phase 7). They answer `500 internal_error`, which any operation may. */
const NOT_SIMULATED = new Set([
  'resolveReview',
  'decideWorkPackage',
  'reopenWork',
  'unblockStory',
]);

/** The in-memory Ahoy API. */
export class MockAhoyServer {
  /** The interruptors; adapters read `latencyMs`, the server consumes the one-shots. */
  readonly switches: MockSwitches = {
    latencyMs: 0,
    failNext: null,
    conflictNext: null,
  };
  readonly clock: MockClock;
  private readonly checker: SchemaChecker;
  private readonly routes: readonly Route[];
  private readonly options: MockServerOptions;
  private world: World;
  private simulator: Simulator;

  constructor(options: MockServerOptions) {
    if (!isRecord(options.contract) || !isRecord(options.contract['paths']))
      throw new Error(
        'MockAhoyServer needs the contract document (src/testing/fixtures/openapi.json)'
      );
    this.options = options;
    this.clock = options.clock ?? realClock;
    this.checker = new SchemaChecker(options.contract);
    this.routes = buildRoutes(options.contract, this.checker);
    this.world = new World(
      this.clock,
      new StreamHub(this.clock, options.keepaliveMs ?? KEEPALIVE_MS)
    );
    this.simulator = new Simulator(this.world, options.timing ?? LIVE_TIMING);
    this.load();
  }

  /** The state of the mock, for specs that look inside. */
  get state(): World {
    return this.world;
  }

  /** The reconciler of the mock, for specs that look inside. */
  get reconciler(): Simulator {
    return this.simulator;
  }

  /** Throws away every change: the seeds again (or nothing), the switches cleared, open streams ended. */
  reset(): void {
    this.simulator.stopAll();
    this.world.hub.closeAll();
    this.world = new World(
      this.clock,
      new StreamHub(this.clock, this.options.keepaliveMs ?? KEEPALIVE_MS)
    );
    this.simulator = new Simulator(
      this.world,
      this.options.timing ?? LIVE_TIMING
    );
    Object.assign(this.switches, {
      latencyMs: 0,
      failNext: null,
      conflictNext: null,
    });
    this.load();
  }

  /** Stops the simulation and ends every open stream. */
  close(): void {
    this.simulator.stopAll();
    this.world.hub.closeAll();
  }

  /** Breaks every open event stream (the `dropStream` switch); clients reconnect with `Last-Event-ID`. */
  dropStreams(): number {
    return this.world.hub.dropAll();
  }

  /**
   * Answers one request. Never throws: everything that goes wrong is an answer, as over HTTP. Every answer of a routed
   * operation is checked against what the contract declares for it (status, media type, JSON schema); one that breaks the
   * contract becomes a `500 internal_error` naming each difference, so the mock never hands the app an answer the real API
   * could not give. The `failNext` answers are exempt: they rehearse failures on purpose.
   */
  handle(request: MockRequest): MockResponse {
    const failure = this.takeFailNext(request);
    if (failure) return failure;
    let route: Route | null = null;
    let response: MockResponse;
    try {
      route = this.match(request);
      response = this.answer(route, request);
    } catch (error: unknown) {
      response = toProblem(error);
    }
    if (route === null) return response;
    try {
      return this.conform(route, response);
    } catch (error: unknown) {
      return toProblem(error);
    }
  }

  private load(): void {
    if (this.options.seed === false) return;
    seedVoyages(
      this.world,
      this.simulator,
      this.options.seedAt ?? this.clock.now()
    );
  }

  private takeFailNext(request: MockRequest): MockResponse | null {
    const status = this.switches.failNext;
    if (status === null) return null;
    this.switches.failNext = null;
    if (status === 502 || status === 504) {
      const text = `<html><body><h1>${status} ${status === 502 ? 'Bad Gateway' : 'Gateway Timeout'}</h1></body></html>`;
      return {
        kind: 'text',
        status,
        headers: { 'Content-Type': 'text/html' },
        body: text,
      };
    }
    const code = FAIL_CODES[status] ?? 'unavailable';
    const detail = `The mock was told to fail this request (failNext=${status})`;
    if (code === 'stale_version')
      return problemResponse(
        new MockProblem(code, detail, this.currentVersionOf(request))
      );
    return problemResponse(new MockProblem(code, detail));
  }

  /** The `currentVersion` a `409 stale_version` carries: the version of the story the path names, else 1. */
  private currentVersionOf(request: MockRequest): {
    readonly currentVersion: number;
  } {
    const segment = /^\/stories\/([^/]+)/.exec(request.path)?.[1];
    const voyage =
      segment === undefined
        ? undefined
        : this.world.voyages.get(safeDecode(segment));
    return { currentVersion: voyage ? voyage.story.version : 1 };
  }

  /** The operation the method and path name: `404 not_found` for no route, `400 bad_request` with `Allow` for a method. */
  private match(request: MockRequest): Route {
    const path = request.path;
    const candidates = this.routes.filter((r) => r.pattern.test(path));
    if (candidates.length === 0)
      throw new MockProblem('not_found', `No route for ${BASE}${path}`);
    const route = candidates.find(
      (r) => r.method === request.method.toUpperCase()
    );
    if (!route)
      throw new MockProblem(
        'bad_request',
        `${request.method} is not allowed on ${BASE}${path}`,
        {
          headers: { Allow: candidates.map((r) => r.method).join(', ') },
        }
      );
    return route;
  }

  private answer(route: Route, request: MockRequest): MockResponse {
    let actor = '';
    if (!route.anonymous) {
      actor = (request.headers['x-ahoy-actor'] ?? '').trim();
      if (actor === '' || actor.length > 200)
        throw new MockProblem('unauthenticated', 'X-Ahoy-Actor is required');
    }

    const call = this.validate(route, request, actor);
    if (route.method === 'POST') this.takeConflictNext(call);
    if (NOT_SIMULATED.has(route.operationId))
      throw new MockProblem(
        'internal_error',
        `The mock backend does not simulate ${route.operationId}`
      );
    return this.dispatch(route.operationId, call);
  }

  /** The answer if the contract allows it for `route`, else a `500 internal_error` that names every difference. */
  private conform(route: Route, response: MockResponse): MockResponse {
    const differences = this.differences(route, response);
    if (differences.length === 0) return response;
    return problemResponse(
      new MockProblem(
        'internal_error',
        `The mock's ${response.status} answer to ${route.operationId} breaks the contract: ${differences.join('; ')}`
      )
    );
  }

  /** How an answer differs from what the contract declares for the operation (any operation may answer 500). */
  private differences(route: Route, response: MockResponse): string[] {
    const declared =
      route.responses[String(response.status)] ?? route.responses['default'];
    if (declared === undefined && response.status !== 500)
      return [`status ${response.status} is not declared`];
    if (response.kind !== 'json') return [];
    const mediaType =
      (response.headers['Content-Type'] ?? '').split(';')[0]?.trim() ?? '';
    let schema: unknown = PROBLEM_SCHEMA;
    if (declared !== undefined) {
      const resolved = this.checker.resolve(declared);
      const content =
        isRecord(resolved) && isRecord(resolved['content'])
          ? resolved['content']
          : {};
      const media = content[mediaType];
      if (!isRecord(media))
        return [
          `${mediaType || 'no media type'} is not declared for status ${response.status}`,
        ];
      schema = media['schema'];
    }
    return this.checker
      .check(schema, response.body, 'response')
      .map((e) => `${e.path} ${e.message}`);
  }

  /** Checks the path, query, header and body against the contract, as the real API does before any handler. */
  private validate(route: Route, request: MockRequest, actor: string): Call {
    const match = route.pattern.exec(request.path);
    const path: Record<string, string> = {};
    route.names.forEach((name, i) => {
      path[name] = safeDecode(match?.[i + 1] ?? '');
    });
    const errors: FieldError[] = [];
    const query: Record<string, string | number> = {};
    const known = new Set<string>();
    for (const param of route.params) {
      let raw: string | undefined;
      if (param.in === 'path') raw = path[param.name];
      else if (param.in === 'query') {
        known.add(param.name);
        const all = request.query.getAll(param.name);
        if (all.length > 1)
          errors.push({
            path: `query.${param.name}`,
            message: 'must be given once',
          });
        raw = all[0];
      } else raw = request.headers[param.name.toLowerCase()];
      if (raw === undefined) {
        if (param.required)
          errors.push({
            path: `${param.in}.${param.name}`,
            message: 'is required',
          });
        continue;
      }
      const schema = this.checker.resolve(param.schema);
      const integer = isRecord(schema) && schema['type'] === 'integer';
      const value: string | number =
        integer && /^(0|[1-9][0-9]{0,15})$/.test(raw) ? Number(raw) : raw;
      errors.push(
        ...this.checker.check(param.schema, value, `${param.in}.${param.name}`)
      );
      if (param.in === 'query') query[param.name] = value;
    }
    for (const name of new Set(request.query.keys()))
      if (!known.has(name))
        errors.push({
          path: `query.${name}`,
          message: 'is not a parameter of this operation',
        });
    if (route.body !== undefined) {
      if (request.bodyIsInvalidJson)
        throw new MockProblem('bad_request', 'Request body is not valid JSON');
      if (request.body === undefined)
        errors.push({ path: 'body', message: 'is required' });
      else {
        const bodyErrors = this.checker.check(route.body, request.body, 'body');
        errors.push(...bodyErrors);
        const unstorable =
          bodyErrors.length === 0 ? unstorableText(request.body) : null;
        if (unstorable)
          errors.push({
            path: 'body',
            message: `${unstorable}, which Postgres cannot store`,
          });
      }
    }
    if (errors.length > 0)
      throw new MockProblem(
        'validation_failed',
        'The request does not match the API contract',
        { errors }
      );
    return { actor, path, query, headers: request.headers, body: request.body };
  }

  private takeConflictNext(call: Call): void {
    const code = this.switches.conflictNext;
    if (code === null) return;
    this.switches.conflictNext = null;
    const key = call.path['key'];
    const voyage = key === undefined ? undefined : this.world.voyages.get(key);
    const detail = `The mock was told to answer this command with ${code} (conflictNext)`;
    if (code === 'stale_version')
      throw new MockProblem(code, detail, {
        currentVersion: voyage ? voyage.story.version : 1,
      });
    throw new MockProblem(code, detail);
  }

  private dispatch(operationId: string, call: Call): MockResponse {
    switch (operationId) {
      case 'getHealth':
        return jsonResponse(200, { status: 'ok', database: 'ok' });
      case 'listModels':
        return jsonResponse(200, listModels);
      case 'listJiraBacklog':
        return jsonResponse(200, jiraBacklog);
      case 'listStories':
        return this.listStories(call);
      case 'startStory':
        return this.startStory(call);
      case 'getStory':
        return jsonResponse(200, this.voyage(call).storyDto());
      case 'stopStory':
        return this.stopStory(call);
      case 'resumeStory':
        return this.resumeStory(call);
      case 'setStoryBudget':
        return this.setStoryBudget(call);
      case 'getStoryModels':
        return jsonResponse(
          200,
          this.relational(this.voyage(call)).modelPlan()
        );
      case 'setStoryModels':
        return this.setStoryModels(call);
      case 'listStoryRuns':
        return jsonResponse(200, { items: this.voyage(call).runDtos() });
      case 'getRun': {
        const runId = call.path['runId'] ?? '';
        const run = this.world.findRun(runId);
        if (!run)
          throw new MockProblem('not_found', `Run ${runId} does not exist`);
        return jsonResponse(200, run);
      }
      case 'listQuestions':
        return jsonResponse(200, { items: this.voyage(call).questions });
      case 'answerQuestion':
        return this.answerQuestion(call);
      case 'listGateRecords':
        return jsonResponse(200, { items: this.voyage(call).gates });
      case 'decideHumanGate':
        return this.decide(call);
      case 'getStoryState': {
        const voyage = this.relational(this.voyage(call));
        return jsonResponse(200, {
          key: voyage.story.key,
          version: voyage.story.version,
          state: voyage.stateDocument(),
        });
      }
      case 'listArtifacts': {
        const voyage = this.voyage(call);
        return jsonResponse(200, {
          revision: voyage.current?.number ?? 0,
          items: voyage.artifactDtos(),
        });
      }
      case 'getArtifactContent':
        return this.artifactContent(call);
      case 'listStoryEvents':
        return this.listStoryEvents(call);
      case 'streamEvents':
        return this.streamEvents(call);
      default:
        throw new MockProblem(
          'internal_error',
          `The mock backend does not simulate ${operationId}`
        );
    }
  }

  /** The story the path names, or `404 not_found`. */
  private voyage(call: Call): Voyage {
    const key = call.path['key'] ?? '';
    const voyage = this.world.voyages.get(key);
    if (!voyage)
      throw new MockProblem('not_found', `Story ${key} does not exist`);
    return voyage;
  }

  /** Refuses a story from before the relational state model, as the real API does for changes and its state. */
  private relational(voyage: Voyage): Voyage {
    if (voyage.legacy)
      throw new MockProblem(
        'legacy_story',
        `Story ${voyage.story.key} predates the relational state model (migration 0002); its state.json artifact is not read`
      );
    return voyage;
  }

  /** The story of a command, locked at `expectedVersion`: `404`, `409 legacy_story` or `409 stale_version`. */
  private lock(call: Call, expectedVersion: number): Voyage {
    const voyage = this.relational(this.voyage(call));
    const { version, key } = voyage.story;
    if (version !== expectedVersion)
      throw new MockProblem(
        'stale_version',
        `Story ${key} is at version ${version}, not ${expectedVersion}`,
        {
          currentVersion: version,
        }
      );
    return voyage;
  }

  private listStories(call: Call): MockResponse {
    const limit =
      typeof call.query['limit'] === 'number' ? call.query['limit'] : 100;
    const status = call.query['status'];
    const cursor = call.query['cursor'];
    const after = typeof cursor === 'string' ? decodeCursor(cursor) : null;
    const sorted = [...this.world.voyages.values()]
      .map((v) => v.story)
      .filter((s) => status === undefined || s.status === status)
      .sort(
        (a, b) =>
          compareDesc(a.updatedAt, b.updatedAt) || compareDesc(a.key, b.key)
      )
      .filter(
        (s) =>
          after === null ||
          s.updatedAt < after.t ||
          (s.updatedAt === after.t && s.key < after.k)
      );
    const page = sorted.slice(0, limit);
    const last = page.at(-1);
    const body: StoryPage = {
      items: page.map((s) => ({ ...s })),
      nextCursor:
        sorted.length > limit && last
          ? encodeCursor(last.updatedAt, last.key)
          : null,
    };
    return jsonResponse(200, body);
  }

  private startStory(call: Call): MockResponse {
    const body = call.body as StartStoryRequest; // validated against StartStoryRequest above
    const chosen: Partial<Record<ModelSlot, ModelChoice>> = {};
    for (const slot of SLOTS) {
      const choice = body.models?.[slot];
      if (choice !== undefined) chosen[slot] = choice;
    }
    if (this.world.voyages.has(body.key))
      throw new MockProblem('story_exists', `Story ${body.key} already exists`);
    const now = this.world.nowIso();
    const voyage = new Voyage({
      key: body.key,
      title: body.title ?? null,
      owner: call.actor,
      phase: 'intake',
      status: 'ready',
      haltReason: null,
      budgetNanoAiu: body.budgetNanoAiu,
      spentNanoAiu: 0,
      controlSha: body.controlRef ?? DEFAULT_CONTROL_SHA,
      currentRunId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    voyage.chosen = chosen;
    this.world.voyages.set(body.key, voyage);
    this.world.append(voyage, 'story.started', call.actor, {
      phase: 'intake',
      controlSha: voyage.story.controlSha,
      budgetNanoAiu: body.budgetNanoAiu,
      ...(body.models !== undefined ? { models: body.models } : {}),
    });
    this.simulator.poke(voyage);
    return jsonResponse(201, voyage.storyDto(), {
      Location: `${BASE}/stories/${body.key}`,
    });
  }

  private stopStory(call: Call): MockResponse {
    const body = call.body as StopStoryRequest; // validated
    const voyage = this.lock(call, body.expectedVersion);
    const story = voyage.story;
    if (story.status === 'halted' || story.status === 'terminal')
      throw new MockProblem(
        'invalid_state',
        `Story ${story.key} is already ${story.status}`
      );
    const runId = story.currentRunId;
    this.simulator.cancelRun(voyage);
    story.status = 'halted';
    story.haltReason = 'stopped_by_user';
    this.world.touch(voyage);
    this.world.append(voyage, 'story.halted', call.actor, {
      reason: 'stopped_by_user',
      detail: body.reason,
      runId,
    });
    return jsonResponse(202, voyage.storyDto());
  }

  private resumeStory(call: Call): MockResponse {
    const body = call.body as ResumeStoryRequest; // validated
    const voyage = this.lock(call, body.expectedVersion);
    const story = voyage.story;
    if (story.status !== 'halted')
      throw new MockProblem(
        'invalid_state',
        `Story ${story.key} is ${story.status}, not halted`
      );
    if (story.currentRunId !== null)
      throw new MockProblem(
        'invalid_state',
        `Run ${story.currentRunId} is still stopping; resume once it has ended`
      );
    const previous = story.haltReason;
    story.status = 'ready';
    story.haltReason = null;
    this.world.touch(voyage);
    this.world.append(voyage, 'story.resumed', call.actor, {
      previousHaltReason: previous,
      ...(body.reason !== undefined && body.reason !== ''
        ? { detail: body.reason }
        : {}),
    });
    this.simulator.poke(voyage);
    return jsonResponse(202, voyage.storyDto());
  }

  private setStoryBudget(call: Call): MockResponse {
    const body = call.body as SetStoryBudgetRequest; // validated
    const voyage = this.lock(call, body.expectedVersion);
    const story = voyage.story;
    if (story.status === 'terminal')
      throw new MockProblem('invalid_state', `Story ${story.key} is terminal`);
    if (body.budgetNanoAiu < story.spentNanoAiu)
      throw new MockProblem(
        'invalid_state',
        `Story ${story.key} has already spent ${story.spentNanoAiu} nano-AIU, more than ${body.budgetNanoAiu}`
      );
    const from = story.budgetNanoAiu;
    story.budgetNanoAiu = body.budgetNanoAiu;
    this.world.touch(voyage);
    this.world.append(voyage, 'story.budget_changed', call.actor, {
      from,
      to: body.budgetNanoAiu,
      spentNanoAiu: story.spentNanoAiu,
      detail: body.reason,
      runId: story.currentRunId,
    });
    return jsonResponse(202, voyage.storyDto());
  }

  private setStoryModels(call: Call): MockResponse {
    const body = call.body as SetStoryModelsRequest; // validated
    const voyage = this.lock(call, body.expectedVersion);
    const story = voyage.story;
    if (story.status === 'terminal')
      throw new MockProblem('invalid_state', `Story ${story.key} is terminal`);
    const changes = new Map(Object.entries(body.models));
    const next: Partial<Record<ModelSlot, ModelChoice>> = {};
    for (const slot of SLOTS) {
      const choice = changes.has(slot)
        ? changes.get(slot)
        : voyage.chosen[slot];
      if (choice !== null && choice !== undefined) next[slot] = choice;
    }
    voyage.chosen = next;
    this.world.touch(voyage);
    this.world.append(voyage, 'story.models_changed', call.actor, {
      models: body.models,
      runId: story.currentRunId,
      ...(body.reason !== undefined ? { detail: body.reason } : {}),
    });
    return jsonResponse(202, voyage.modelPlan());
  }

  private answerQuestion(call: Call): MockResponse {
    const body = call.body as AnswerRequest; // validated
    const voyage = this.lock(call, body.expectedVersion);
    const story = voyage.story;
    const questionId = call.path['questionId'] ?? '';
    const question = voyage.questions.find((q) => q.id === questionId);
    if (!question)
      throw new MockProblem(
        'not_found',
        `Story ${story.key} has no question ${questionId}`
      );
    if (question.answer !== null)
      throw new MockProblem(
        'already_answered',
        `${questionId} is already answered`
      );
    if (story.status !== 'awaiting_input')
      throw new MockProblem(
        'invalid_state',
        `Story ${story.key} is ${story.status}, not awaiting_input`
      );
    if (story.phase !== 'planning')
      throw new MockProblem(
        'invalid_state',
        'Human questions can only be answered during planning'
      );
    if (body.answer.trim() === '')
      throw new MockProblem('invalid_state', 'An answer cannot be empty');
    question.answer = body.answer;
    question.answeredBy = call.actor;
    question.answeredAt = this.world.nowIso();
    question.consumed = false;
    const pending = voyage.questions.filter((q) => q.answer === null).length;
    if (pending === 0) story.status = 'ready';
    this.world.touch(voyage);
    this.world.append(voyage, 'question.answered', call.actor, {
      questionId,
      pending,
    });
    if (pending === 0) this.simulator.poke(voyage);
    return jsonResponse(202, { story: voyage.storyDto(), question });
  }

  private decide(call: Call): MockResponse {
    const body = call.body as DecisionRequest; // validated
    const voyage = this.lock(call, body.expectedVersion);
    const story = voyage.story;
    if (story.status !== 'awaiting_decision')
      throw new MockProblem(
        'invalid_state',
        `Story ${story.key} is ${story.status}, not awaiting_decision`
      );
    const row = PHASE_TABLE[story.phase];
    if (!row || row.kind !== 'human' || row.gate !== body.gate)
      throw new MockProblem(
        'unsupported_gate',
        `Phase ${story.phase} has no human gate ${body.gate}`
      );
    const reason = body.reason?.trim() ?? '';
    if (body.decision !== 'approve' && reason === '')
      throw new MockProblem(
        'validation_failed',
        `${body.decision} needs a reason`,
        {
          errors: [
            { path: '/reason', message: 'required for send_back and reject' },
          ],
        }
      );
    if (voyage.humanGates[body.gate] !== undefined)
      throw new MockProblem(
        'decision_already_recorded',
        `human_gates.${body.gate} is already decided`
      );

    const gate = body.gate;
    const round = (voyage.revisionRounds[gate] ?? 0) + 1;
    const now = this.world.nowIso();
    const fromPhase = story.phase;
    let phase: string;
    let revision: number | null = null;
    if (body.decision === 'send_back') {
      if (round - 1 >= REVISION_CEILING)
        throw new MockProblem(
          'revision_ceiling_reached',
          `${gate} has already been revised ${round - 1} time(s), at the ceiling of ${REVISION_CEILING}`
        );
      phase = row.producer ?? fromPhase;
      voyage.revisionRounds[gate] = round;
      voyage.revisionReason = reason;
      voyage.decisionLog.push({
        timestamp: now.replace(/\.\d{3}Z$/, 'Z'),
        actor: call.actor,
        type: 'revision',
        summary: `${gate} sent back to ${phase} for revision, round ${round} by ${call.actor}: ${reason}`,
      });
      const plan = voyage.current?.files.find((f) => f.path === PLAN_FILE);
      if (gate === 'plan_accepted' && plan)
        revision = voyage.addRevision(
          [
            artifactFile(
              `implementation-plan.round${round}.md`,
              plan.text,
              null
            ),
          ],
          this.clock.now()
        );
    } else {
      const approve = body.decision === 'approve';
      voyage.humanGates[gate] = {
        status: approve ? 'approved' : 'rejected',
        timestamp: now.replace(/\.\d{3}Z$/, 'Z'),
        ...(reason !== '' ? { reason } : {}),
      };
      voyage.decisionLog.push({
        timestamp: now.replace(/\.\d{3}Z$/, 'Z'),
        actor: call.actor,
        type: approve ? 'human_approval' : 'human_rejection',
        summary: `${gate} ${approve ? 'approved' : 'rejected'} at phase ${fromPhase} by ${call.actor}${reason !== '' ? `: ${reason}` : ''}`,
      });
      phase = approve ? (row.onPass ?? fromPhase) : 'blocked';
    }
    const record = this.world.addGateRecord(voyage, {
      source: 'human',
      gate,
      phase: fromPhase,
      outcome: body.decision,
      message: reason !== '' ? reason : null,
      actor: call.actor,
      runId: null,
      createdAt: now,
    });
    const terminal = PHASE_TABLE[phase]?.kind === 'terminal';
    story.phase = phase;
    story.status = terminal ? 'terminal' : 'ready';
    this.world.touch(voyage);
    this.world.append(voyage, 'decision.recorded', call.actor, {
      gate,
      decision: body.decision,
      round,
      recordId: record.id,
    });
    if (revision !== null)
      this.world.append(voyage, 'artifacts.updated', call.actor, { revision });
    this.world.append(voyage, 'story.phase_changed', call.actor, {
      from: fromPhase,
      to: phase,
    });
    if (!terminal) this.simulator.poke(voyage);
    return jsonResponse(202, { story: voyage.storyDto(), record });
  }

  private artifactContent(call: Call): MockResponse {
    const voyage = this.voyage(call);
    const path = String(call.query['path'] ?? '');
    const current = voyage.current?.number ?? 0;
    const revision =
      typeof call.query['revision'] === 'number'
        ? call.query['revision']
        : current;
    const file = revision <= current ? voyage.file(path, revision) : null;
    if (!file)
      throw new MockProblem(
        'not_found',
        `No artifact ${path} at revision ${revision}`
      );
    if (voyage.legacy)
      throw new MockProblem(
        'legacy_story',
        `${path} predates the relational state model; its bytes are not in Postgres`
      );
    const etag = `"${file.sha256}"`;
    const headers = {
      'Content-Type': file.mediaType,
      ETag: etag,
      'Cache-Control': 'private, no-cache',
    };
    if (call.headers['if-none-match'] === etag)
      return { kind: 'empty', status: 304, headers };
    return { kind: 'text', status: 200, headers, body: file.text };
  }

  private listStoryEvents(call: Call): MockResponse {
    const voyage = this.voyage(call);
    const afterParam = call.query['after'];
    const after = afterParam === undefined ? 0 : Number(afterParam);
    const limit =
      typeof call.query['limit'] === 'number' ? call.query['limit'] : 100;
    const items = this.world
      .eventsAfter(after, voyage.story.key, limit)
      .map(eventDto);
    const last = items.at(-1);
    return jsonResponse(200, {
      items,
      lastEventId: last
        ? last.id
        : afterParam === undefined
          ? null
          : String(after),
    });
  }

  private streamEvents(call: Call): MockResponse {
    const fromHeader = call.headers['last-event-id'];
    const after = Number(fromHeader ?? call.query['after'] ?? 0);
    const storyParam = call.query['story'];
    const story = typeof storyParam === 'string' ? storyParam : null;
    const stream = this.world.hub.connect(
      story,
      after,
      this.world.eventsAfter(after, story)
    );
    return {
      kind: 'stream',
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
      stream,
    };
  }
}

/** The schema of an undeclared `500`: the contract's `Problem`. */
const PROBLEM_SCHEMA = { $ref: '#/components/schemas/Problem' };

/** The answer for anything thrown while answering: its problem, or `500 internal_error`. */
function toProblem(error: unknown): MockResponse {
  if (error instanceof MockProblem) return problemResponse(error);
  const message = error instanceof Error ? error.message : String(error);
  return problemResponse(
    new MockProblem('internal_error', `Internal error in the mock: ${message}`)
  );
}

/** The problem code `failNext` answers each status with. */
const FAIL_CODES: Readonly<Record<number, ProblemCode>> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'stale_version',
  422: 'unsupported_gate',
  500: 'internal_error',
  503: 'unavailable',
};

/** The routes of the contract's `paths`, as the real server builds them. */
function buildRoutes(
  contract: Readonly<Record<string, unknown>>,
  checker: SchemaChecker
): Route[] {
  const paths = isRecord(contract['paths']) ? contract['paths'] : {};
  const routes: Route[] = [];
  const readParams = (list: unknown): Param[] =>
    (Array.isArray(list) ? list : []).flatMap((raw) => {
      const p = checker.resolve(raw);
      if (
        !isRecord(p) ||
        typeof p['name'] !== 'string' ||
        typeof p['in'] !== 'string'
      )
        return [];
      return [
        {
          name: p['name'],
          in: p['in'],
          required: p['required'] === true,
          schema: p['schema'],
        },
      ];
    });
  for (const [template, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    const shared = readParams(item['parameters']);
    const names: string[] = [];
    const pattern = new RegExp(
      `^${template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
        names.push(name);
        return '([^/]+)';
      })}$`
    );
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = item[method];
      if (!isRecord(op) || typeof op['operationId'] !== 'string') continue;
      const requestBody = checker.resolve(op['requestBody']);
      const content =
        isRecord(requestBody) && isRecord(requestBody['content'])
          ? requestBody['content']
          : {};
      const json = isRecord(content['application/json'])
        ? content['application/json']
        : null;
      routes.push({
        method: method.toUpperCase(),
        template,
        pattern,
        names,
        operationId: op['operationId'],
        params: [...shared, ...readParams(op['parameters'])],
        body: json === null ? undefined : json['schema'],
        responses: isRecord(op['responses']) ? op['responses'] : {},
        anonymous: Array.isArray(op['security']) && op['security'].length === 0,
      });
    }
  }
  return routes;
}

function compareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** A cursor in the real API's form: base64url of `{"t": updatedAt, "k": key}`. */
export function encodeCursor(updatedAt: string, key: string): string {
  return btoa(JSON.stringify({ t: updatedAt, k: key }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** Reads a cursor this server issued, or answers `400 bad_request`. */
function decodeCursor(cursor: string): {
  readonly t: string;
  readonly k: string;
} {
  try {
    const padded = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const value: unknown = JSON.parse(
      atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    );
    if (
      isRecord(value) &&
      typeof value['t'] === 'string' &&
      typeof value['k'] === 'string' &&
      Number.isFinite(Date.parse(value['t']))
    )
      return { t: value['t'], k: value['k'] };
  } catch {
    // Not base64 or not JSON: refused below.
  }
  throw new MockProblem('bad_request', 'cursor is not one this server issued');
}
