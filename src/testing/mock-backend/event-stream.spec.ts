import { createMockFetch } from "./fetch-adapter";
import { call, settle, StreamTap, testServer } from "./spec-helpers";

const AIU = 1_000_000_000;

/** Opens `/events/stream` through the mock `fetch`. */
async function open(
  fetch: typeof globalThis.fetch,
  query = "",
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/v1/events/stream${query}`, {
    headers: { Accept: "text/event-stream", ...headers },
    ...(signal !== undefined ? { signal } : {}),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
  const tap = new StreamTap(response.body!);
  await settle();
  return tap;
}

describe("GET /events/stream on the mock", () => {
  it("says it is connected, replays every event after `after`, then streams new ones in id order", async () => {
    const { server, clock } = testServer({ seed: false });
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    call(server, "POST", "/stories", { key: "DEMO-1", budgetNanoAiu: 30 * AIU });
    const tap = await open(fetch, "?after=0");
    expect(tap.text.startsWith(": connected\n\n")).toBe(true);
    expect(tap.ids).toEqual(["1"]);
    expect(tap.types).toEqual(["story.started"]);
    clock.advance(2_000);
    await settle();
    expect(tap.types).toEqual(["story.started", "run.queued", "run.dispatched"]);
    expect(tap.ids).toEqual(["1", "2", "3"]);
    expect(tap.text).toContain('data: {"id":"2","storyKey":"DEMO-1","type":"run.queued"');
  });

  it("resumes after Last-Event-ID, which wins over `after`, without repeating an event", async () => {
    const { server } = testServer();
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    const total = server.state.lastEventId;
    const tap = await open(fetch, "?after=1", { "Last-Event-ID": String(total - 3) });
    expect(tap.ids).toEqual([String(total - 2), String(total - 1), String(total)]);
  });

  it("follows one story with `story=`", async () => {
    const { server, clock } = testServer();
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    const tap = await open(fetch, `?story=PROJ-140&after=${server.state.lastEventId}`);
    clock.advance(4_000); // PROJ-140 and PROJ-109 both move
    await settle();
    const stories = [...tap.text.matchAll(/"storyKey":"([^"]+)"/g)].map((m) => m[1]);
    expect(stories.length).toBeGreaterThan(0);
    expect(new Set(stories)).toEqual(new Set(["PROJ-140"]));
  });

  it("sends `: keepalive` to a stream idle for 15 s", async () => {
    const { server, clock } = testServer({ seed: false });
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    const tap = await open(fetch);
    clock.advance(14_999);
    await settle();
    expect(tap.text).toBe(": connected\n\n");
    clock.advance(1);
    await settle();
    expect(tap.text).toBe(": connected\n\n: keepalive\n\n");
  });

  it("breaks open streams on dropStreams, and an aborted request breaks its own", async () => {
    const { server } = testServer({ seed: false });
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    const dropped = await open(fetch);
    const controller = new AbortController();
    const aborted = await open(fetch, "", {}, controller.signal);
    controller.abort();
    await settle();
    expect(aborted.error).toBeInstanceOf(DOMException);
    expect(server.state.hub.open).toBe(1);
    expect(server.dropStreams()).toBe(1);
    await settle();
    expect(dropped.error).toBeInstanceOf(TypeError);
    expect(server.state.hub.open).toBe(0);
  });

  it("asks for the actor like every other operation", async () => {
    const { server } = testServer({ seed: false });
    const response = await createMockFetch(server)("/api/v1/events/stream");
    expect(response.status).toBe(401);
  });
});

describe("createMockFetch", () => {
  it("answers the API from the mock, sends the actor, and hands other URLs to the fallback", async () => {
    const { server } = testServer();
    const seen: string[] = [];
    const fetch = createMockFetch(server, {
      origin: "http://localhost:4200",
      actor: () => "sam@example.com",
      fallback: async (input) => {
        seen.push(String(input));
        return new Response("{}", { status: 404 });
      },
    });
    const created = await fetch("/api/v1/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "DEMO-9", budgetNanoAiu: AIU }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("Location")).toBe("/api/v1/stories/DEMO-9");
    expect((await created.json()) as unknown).toMatchObject({ owner: "sam@example.com" });
    expect((await fetch("/config.json")).status).toBe(404);
    expect(seen).toEqual(["/config.json"]);
    const bad = await fetch("http://localhost:4200/api/v1/stories", { method: "POST", body: "{oops" });
    expect([bad.status, bad.headers.get("Content-Type")]).toEqual([400, "application/problem+json; charset=utf-8"]);
  });

  it("answers artifact text and a 304 as a browser would", async () => {
    const { server } = testServer();
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    const url = "/api/v1/stories/PROJ-123/artifacts/content?path=implementation-plan.md";
    const first = await fetch(url);
    expect([first.status, first.headers.get("Content-Type")]).toEqual([200, "text/markdown"]);
    expect(await first.text()).toContain("# Implementation plan: PROJ-123");
    const again = await fetch(url, { headers: { "If-None-Match": first.headers.get("ETag") ?? "" } });
    expect([again.status, await again.text()]).toEqual([304, ""]);
  });

  it("waits latencyMs on the mock's clock, and an abort during the wait rejects", async () => {
    const { server, clock } = testServer();
    server.switches.latencyMs = 250;
    const fetch = createMockFetch(server, { actor: () => "alex@example.com" });
    let answered = false;
    const pending = fetch("/api/v1/health").then((r) => {
      answered = true;
      return r.status;
    });
    await settle();
    expect(answered).toBe(false);
    clock.advance(250);
    expect(await pending).toBe(200);
    const controller = new AbortController();
    const aborted = fetch("/api/v1/health", { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toThrow(/aborted/);
  });
});
