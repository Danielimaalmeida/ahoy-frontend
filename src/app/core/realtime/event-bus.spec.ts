import { TestBed } from "@angular/core/testing";
import type { Subscription } from "rxjs";
import { API_BASE } from "@core/api/api-base";
import { ApiClient } from "@core/api/api-client";
import { ok } from "@core/api/api-error";
import type { AhoyEvent, ListEventsQuery } from "@core/api/types";
import { CLOCK, RANDOM } from "./clock";
import { EventBus } from "./event-bus";
import { FETCH } from "./fetch";
import { POLLING } from "./polling";
import { FakeApi } from "./testing/fake-api";
import { FakeClock, settle } from "./testing/fake-clock";
import { FakeFetch, problemResponse } from "./testing/fake-fetch";
import { anEvent } from "./testing/events";

describe("EventBus", () => {
  let clock: FakeClock;
  let net: FakeFetch;
  let api: FakeApi;

  beforeEach(() => {
    clock = new FakeClock();
    net = new FakeFetch();
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: FETCH, useValue: net.fetch },
        { provide: CLOCK, useValue: clock },
        { provide: RANDOM, useValue: () => 0.5 },
        { provide: API_BASE, useValue: "/api/v1" },
        { provide: ApiClient, useValue: api },
      ],
    });
  });

  /** Makes the stream fail three times in a row, so that it is degraded and waits to reconnect. */
  async function degrade(): Promise<void> {
    net.answer(new TypeError("down"), new TypeError("down"), new TypeError("down"));
    await settle();
    await clock.advance(1_000);
    await clock.advance(2_000);
  }

  it("stays closed while nobody subscribes", async () => {
    const bus = TestBed.inject(EventBus);
    await settle();
    expect(bus.status()).toBe("offline");
    expect(net.requests).toHaveLength(0);
  });

  it("opens one connection, with no story filter, for all subscribers, and closes it with the last", async () => {
    net.stream();
    const bus = TestBed.inject(EventBus);
    const a = bus.events().subscribe();
    const b = bus.eventsFor("PROJ-123").subscribe();
    const c = bus.eventsFor("PROJ-131").subscribe();
    await settle();
    expect(net.requests).toHaveLength(1);
    expect(net.last!.url).toBe("/api/v1/events/stream");
    expect(bus.status()).toBe("live");
    expect(bus.subscribers()).toBe(3);
    a.unsubscribe();
    b.unsubscribe();
    await settle();
    expect(net.last!.signal?.aborted).toBe(false);
    c.unsubscribe();
    await settle();
    expect(bus.subscribers()).toBe(0);
    expect(net.last!.signal?.aborted).toBe(true);
    expect(bus.status()).toBe("offline");
    expect(clock.pending).toBe(0);
  });

  it("gives each subscriber the events it asked for", async () => {
    const body = net.stream();
    const bus = TestBed.inject(EventBus);
    const all: string[] = [];
    const one: string[] = [];
    const subs = [
      bus.events().subscribe((e) => all.push(e.id)),
      bus.eventsFor("PROJ-123").subscribe((e) => one.push(e.id)),
    ];
    await settle();
    body.sendEvent(anEvent(1, "story.started", {}, "PROJ-123"));
    body.sendEvent(anEvent(2, "story.started", {}, "PROJ-131"));
    body.sendEvent(anEvent(3, "run.queued", {}, "PROJ-123"));
    await settle();
    expect(all).toEqual(["1", "2", "3"]);
    expect(one).toEqual(["1", "3"]);
    expect(bus.lastEventId()).toBe("3");
    subs.forEach((s) => s.unsubscribe());
  });

  it("delivers an event once per story, even when a source sends it again", async () => {
    const body = net.stream();
    const bus = TestBed.inject(EventBus);
    const seen: string[] = [];
    const sub = bus.events().subscribe((e) => seen.push(`${e.storyKey}#${e.id}`));
    await settle();
    body.sendEvent(anEvent(5, "run.queued", {}, "PROJ-123"));
    body.sendEvent(anEvent(5, "run.queued", {}, "PROJ-123"));
    body.sendEvent(anEvent(4, "run.queued", {}, "PROJ-123"));
    body.sendEvent(anEvent(3, "run.queued", {}, "PROJ-131"));
    await settle();
    expect(seen).toEqual(["PROJ-123#5", "PROJ-131#3"]);
    sub.unsubscribe();
  });

  it("reports a refusal: offline, with the status, and no polling", async () => {
    net.answer(problemResponse(401, "unauthenticated"));
    const bus = TestBed.inject(EventBus);
    const sub = bus.events().subscribe();
    await settle();
    expect(bus.status()).toBe("offline");
    expect(bus.refusedWith()).toBe(401);
    await clock.advance(60_000);
    expect(net.requests).toHaveLength(1);
    expect(api.calls).toHaveLength(0);
    sub.unsubscribe();
  });

  describe("polling fallback", () => {
    let pages: Map<string, AhoyEvent[]>;

    beforeEach(() => {
      pages = new Map();
      api.on("listStoryEvents", (key: string, query: ListEventsQuery = {}) => {
        const after = query.after !== undefined ? Number(query.after) : 0;
        const items = (pages.get(key) ?? []).filter((e) => Number(e.id) > after);
        return Promise.resolve(ok({ items, lastEventId: items.at(-1)?.id ?? query.after ?? null }));
      });
    });

    it("does not poll while the stream is fine", async () => {
      net.stream();
      const bus = TestBed.inject(EventBus);
      const release = bus.watchStory("PROJ-123");
      const sub = bus.events().subscribe();
      await clock.advance(30_000);
      expect(bus.pollingActive).toBe(false);
      expect(api.calls).toHaveLength(0);
      sub.unsubscribe();
      release();
    });

    it("polls the open voyage every 3 s once degraded, after the last event it delivered", async () => {
      const first = net.stream();
      const bus = TestBed.inject(EventBus);
      const seen: string[] = [];
      const release = bus.watchStory("PROJ-123");
      const sub = bus.events().subscribe((e) => seen.push(e.id));
      await settle();
      first.sendEvent(anEvent(10, "run.queued"));
      await settle();
      first.fail();
      await degrade();
      expect(bus.degraded()).toBe(true);
      expect(bus.pollingActive).toBe(true);
      pages.set("PROJ-123", [anEvent(9, "story.started"), anEvent(10, "run.queued"), anEvent(11, "run.dispatched")]);
      await clock.advance(POLLING.eventsMs);
      const calls = api.callsOf("listStoryEvents");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.args).toEqual(["PROJ-123", { after: "10", limit: 500 }]);
      expect(seen).toEqual(["10", "11"]);
      pages.get("PROJ-123")!.push(anEvent(12, "run.finished"));
      await clock.advance(POLLING.eventsMs);
      expect(api.callsOf("listStoryEvents")[1]?.args).toEqual(["PROJ-123", { after: "11", limit: 500 }]);
      expect(seen).toEqual(["10", "11", "12"]);
      sub.unsubscribe();
      release();
    });

    it("polls only the stories a screen has open", async () => {
      const bus = TestBed.inject(EventBus);
      const sub = bus.events().subscribe();
      await degrade();
      await clock.advance(POLLING.eventsMs);
      expect(api.callsOf("listStoryEvents")).toHaveLength(0);
      const release = bus.watchStory("PROJ-131");
      await clock.advance(POLLING.eventsMs);
      expect(api.callsOf("listStoryEvents").map((c) => c.args[0])).toEqual(["PROJ-131"]);
      release();
      await clock.advance(POLLING.eventsMs);
      expect(api.callsOf("listStoryEvents")).toHaveLength(1);
      sub.unsubscribe();
    });

    it("asks for the story list every 10 s while degraded", async () => {
      const bus = TestBed.inject(EventBus);
      let resyncs = 0;
      const resync = bus.resync.subscribe(() => resyncs++);
      const sub = bus.events().subscribe();
      await degrade();
      expect(resyncs).toBe(0);
      await clock.advance(POLLING.storiesMs);
      expect(resyncs).toBe(1);
      await clock.advance(POLLING.storiesMs);
      expect(resyncs).toBe(2);
      sub.unsubscribe();
      resync.unsubscribe();
    });

    it("stops polling when the stream recovers, and the stream's replay is not delivered twice", async () => {
      const bus = TestBed.inject(EventBus);
      const seen: string[] = [];
      const release = bus.watchStory("PROJ-123");
      const sub = bus.events().subscribe((e) => seen.push(e.id));
      await degrade();
      pages.set("PROJ-123", [anEvent(1, "story.started"), anEvent(2, "run.queued")]);
      await clock.advance(POLLING.eventsMs);
      expect(seen).toEqual(["1", "2"]);
      const recovered = net.stream();
      await clock.advance(8_000);
      expect(bus.status()).toBe("live");
      expect(bus.degraded()).toBe(false);
      expect(bus.pollingActive).toBe(false);
      recovered.sendEvent(anEvent(2, "run.queued"));
      recovered.sendEvent(anEvent(3, "run.dispatched"));
      await settle();
      expect(seen).toEqual(["1", "2", "3"]);
      const calls = api.callsOf("listStoryEvents").length;
      await clock.advance(30_000);
      expect(api.callsOf("listStoryEvents")).toHaveLength(calls);
      sub.unsubscribe();
      release();
    });

    it("stops polling when the last subscriber leaves", async () => {
      const bus = TestBed.inject(EventBus);
      const release = bus.watchStory("PROJ-123");
      const sub = bus.events().subscribe();
      await degrade();
      expect(bus.pollingActive).toBe(true);
      sub.unsubscribe();
      expect(bus.pollingActive).toBe(false);
      expect(clock.pending).toBe(0);
      await clock.advance(60_000);
      expect(api.calls).toHaveLength(0);
      release();
    });

    it("tries again on the next round when a poll fails", async () => {
      let fail = true;
      api.on("listStoryEvents", () =>
        Promise.resolve(fail ? { ok: false, error: { kind: "network" } } : ok({ items: [], lastEventId: null })),
      );
      const bus = TestBed.inject(EventBus);
      const release = bus.watchStory("PROJ-123");
      const sub = bus.events().subscribe();
      await degrade();
      await clock.advance(POLLING.eventsMs);
      fail = false;
      await clock.advance(POLLING.eventsMs);
      expect(api.callsOf("listStoryEvents")).toHaveLength(2);
      sub.unsubscribe();
      release();
    });
  });

  it("leaves nothing running when the app is destroyed", async () => {
    net.stream();
    const bus = TestBed.inject(EventBus);
    const subs: Subscription[] = [bus.events().subscribe(), bus.eventsFor("PROJ-123").subscribe()];
    await settle();
    const request = net.last!;
    TestBed.resetTestingModule();
    await settle();
    expect(request.signal?.aborted).toBe(true);
    expect(clock.pending).toBe(0);
    expect(subs.every((s) => s.closed)).toBe(true);
  });
});
