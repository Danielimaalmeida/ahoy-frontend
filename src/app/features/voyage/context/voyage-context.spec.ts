import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { AppConfigStore } from "@core/config/app-config";
import { mockBackendInterceptor, provideMockBackend } from "@core/mock/mock-backend";
import { CLOCK, type Clock } from "@core/realtime/clock";
import { StoriesStore } from "@core/stores/stories-store";
import type { ManualClock } from "@testing/mock-backend/clock";
import { call, settle, testServer } from "@testing/mock-backend/spec-helpers";
import { VoyageContext } from "./voyage-context";

function asClock(manual: ManualClock): Clock {
  return { now: () => new Date(manual.now()), schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }) };
}

/** A context on a fresh seeded mock, acting as `actor`. */
function setUp(actor = "dev@example.com") {
  const mock = testServer();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(mock.server),
      { provide: CLOCK, useValue: asClock(mock.clock) },
      VoyageContext,
    ],
  });
  const config = TestBed.inject(AppConfigStore);
  config.set({ ...config.config(), actor });
  return { ...mock, context: TestBed.inject(VoyageContext) };
}

describe("VoyageContext", () => {
  it("is loading until the story is read, then ready with the story and its version", async () => {
    const { context } = setUp();
    expect(context.status()).toBe("loading");
    context.open("PROJ-123");
    expect(context.status()).toBe("loading");
    await settle();
    expect(context.status()).toBe("ready");
    expect(context.story()?.key).toBe("PROJ-123");
    expect(context.version()).toBe(context.story()?.version);
  });

  it("reads the open gate, the round and the ceiling from the history and the state (G10, G11)", async () => {
    const { context } = setUp();
    context.open("PROJ-123");
    await settle();
    expect(context.gateKey()).toBe("plan_accepted");
    expect(context.revisionRound()).toBe(2);
    expect(context.revisionCeiling()).toBe(4);
  });

  it("has no open gate and no round for a voyage that never waited on one", async () => {
    const { context } = setUp();
    context.open("PROJ-140");
    await settle();
    expect(context.gateKey()).toBeNull();
    expect(context.revisionRound()).toBeNull();
  });

  it("knows where a blocked voyage stopped (G12) and the last halt of an anchored one (G7)", async () => {
    const { context } = setUp();
    context.open("PROJ-102");
    await settle();
    expect(context.stoppedAt()).toBe("plan_review");

    context.open("PROJ-118");
    await settle();
    expect(context.stoppedAt()).toBeNull();
    expect(context.lastHalt()).toMatchObject({
      reason: "run_failed",
      detail: "The worker exited with code 1 before it wrote a result.",
    });
  });

  it("counts the questions, runs and gate records for the tabs", async () => {
    const { context } = setUp();
    expect(context.counts()).toEqual({ questions: null, runs: null, gates: null });
    context.open("PROJ-131");
    await settle();
    expect(context.counts()).toEqual({ questions: 3, runs: 2, gates: 2 });
  });

  it("knows whether the user owns the voyage", async () => {
    const { context } = setUp("alex@example.com");
    context.open("PROJ-123");
    await settle();
    expect(context.isOwner()).toBe(true);
    context.open("PROJ-126");
    await settle();
    expect(context.isOwner()).toBe(false);
  });

  it("is notFound for a key the API does not know", async () => {
    const { context } = setUp();
    context.open("PROJ-999");
    await settle();
    expect(context.status()).toBe("notFound");
    expect(context.story()).toBeNull();
  });

  it("never sends a route key that is not a Jira key, and says the voyage doesn't exist", async () => {
    const { context, server } = setUp();
    const paths: string[] = [];
    const handle = server.handle.bind(server);
    server.handle = (request) => {
      paths.push(request.path);
      return handle(request);
    };
    context.open("proj-123/../stories");
    await settle();
    expect(context.status()).toBe("notFound");
    expect(context.key()).toBeNull();
    expect(paths.filter((path) => path.startsWith("/stories"))).toEqual([]);
    expect(await context.stop("x")).toEqual({ kind: "skipped" });
  });

  it("counts no revision round once the voyage has passed the gate", async () => {
    const { context } = setUp();
    context.open("PROJ-118");
    await settle();
    expect(context.story()?.phase).toBe("implementation");
    expect(context.revisionRound()).toBeNull();
  });

  it("is in error, not notFound, when the API cannot be reached", async () => {
    const { context, server } = setUp();
    const handle = server.handle.bind(server);
    server.handle = (request) => {
      if (request.path === "/stories/PROJ-123") server.switches.failNext = 503;
      return handle(request);
    };
    context.open("PROJ-123");
    await settle();
    expect(context.status()).toBe("error");
    expect(context.error()).toMatchObject({ code: "unavailable" });
  });

  it("puts the story a command answered in the store, for the page and the lists", async () => {
    const { context } = setUp();
    context.open("PROJ-140");
    await settle();
    const before = context.version();
    const outcome = await context.stop("Pause.");
    expect(outcome.kind).toBe("ok");
    expect(context.story()?.status).toBe("halted");
    expect(context.version()).toBeGreaterThan(before ?? 0);
    expect(TestBed.inject(StoriesStore).find("PROJ-140")?.status).toBe("halted");
  });

  it("sends a resume without a reason key when the reason is empty", async () => {
    const { context, server } = setUp();
    const bodies: unknown[] = [];
    const handle = server.handle.bind(server);
    server.handle = (request) => {
      if (request.method === "POST") bodies.push(request.body);
      return handle(request);
    };
    context.open("PROJ-126");
    await settle();
    await context.resume("");
    expect(bodies).toEqual([{ expectedVersion: expect.any(Number) }]);
  });

  it("lets go of the previous voyage when another key is opened", async () => {
    const { context, server } = setUp();
    context.open("PROJ-123");
    await settle();
    context.open("PROJ-140");
    expect(context.story()).toBeNull();
    await settle();
    expect(context.story()?.key).toBe("PROJ-140");
    // A change to the voyage left behind no longer reaches this context.
    const story = call(server, "GET", "/stories/PROJ-123").body as { version: number };
    call(server, "POST", "/stories/PROJ-123/stop", { expectedVersion: story.version, reason: "x" });
    await settle();
    expect(context.story()?.key).toBe("PROJ-140");
  });

  it("skips commands before a voyage is open", async () => {
    const { context } = setUp();
    expect(await context.stop("x")).toEqual({ kind: "skipped" });
    expect(await context.resume("")).toEqual({ kind: "skipped" });
    expect(await context.setBudget(1, "x")).toEqual({ kind: "skipped" });
  });
});
