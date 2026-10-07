import { EnvironmentInjector, createEnvironmentInjector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ok } from "@core/api/api-error";
import type { AhoyEvent, Question, Story } from "@core/api/types";
import { EventBus } from "@core/realtime/event-bus";
import { aStory, anEvent } from "@core/realtime/testing/events";
import { FakeApi } from "@core/realtime/testing/fake-api";
import { FakeClock, settle } from "@core/realtime/testing/fake-clock";
import { FakeFetch, type SseBody } from "@core/realtime/testing/fake-fetch";
import { provideFakes } from "@core/realtime/testing/providers";
import { RowDetails } from "./row-details";

function question(id: string, answered: boolean): Question {
  return {
    id,
    round: 1,
    runId: "proj-131-planning-001-aaaa",
    text: `Question ${id}?`,
    recommendation: null,
    answer: answered ? "An answer." : null,
    answeredBy: answered ? "sam@example.com" : null,
    answeredAt: answered ? "2026-10-06T09:30:00.000Z" : null,
    consumed: false,
  };
}

const EVENTS: Readonly<Record<string, readonly AhoyEvent[]>> = {
  "PROJ-126": [
    { ...anEvent(1, "story.halted", { reason: "stopped_by_user" }, "PROJ-126"), actor: "priya@example.com" },
  ],
  "PROJ-102": [
    anEvent(2, "story.phase_changed", { from: "plan_review", to: "blocked" }, "PROJ-102"),
    {
      ...anEvent(3, "decision.recorded", { gate: "plan_accepted", decision: "reject" }, "PROJ-102"),
      actor: "jordan@example.com",
    },
  ],
};

/** A `RowDetails` over fakes, in an injector of its own so that the spec can destroy it as a page would. */
function rig() {
  const clock = new FakeClock();
  const net = new FakeFetch();
  const stream: SseBody = net.stream();
  const api = new FakeApi();
  api.on("listQuestions", () => Promise.resolve(ok([question("Q1", true), question("Q2", false)])));
  api.on("getStoryState", (key) =>
    Promise.resolve(ok({ key, version: 1, state: { revisions: { plan_accepted: 1 }, revision_ceiling: 4 } })),
  );
  api.on("listStoryEvents", (key) => Promise.resolve(ok({ items: EVENTS[key] ?? [], lastEventId: null })));
  TestBed.configureTestingModule({ providers: provideFakes({ api, clock, net }) });
  const page = createEnvironmentInjector([RowDetails], TestBed.inject(EnvironmentInjector));
  return { api, clock, stream, page, details: page.get(RowDetails), bus: TestBed.inject(EventBus) };
}

const asking: Story = aStory("PROJ-131", { status: "awaiting_input", phase: "planning" });
const deciding: Story = aStory("PROJ-123", { status: "awaiting_decision", phase: "plan_review" });
const stopped: Story = aStory("PROJ-126", { status: "halted", haltReason: "stopped_by_user" });
const aground: Story = aStory("PROJ-102", { status: "terminal", phase: "blocked" });
const docked: Story = aStory("PROJ-097", { status: "terminal", phase: "done" });
const working: Story = aStory("PROJ-140", { status: "running", phase: "planning" });
const queued: Story = aStory("PROJ-109", { status: "ready", phase: "intake" });

describe("RowDetails (Voyages)", () => {
  it("reads only what the note and the stepper of each status need", async () => {
    const { api, details } = rig();
    details.sync([asking, deciding, stopped, aground, docked, working, queued]);
    await settle();
    expect(api.callsOf("listQuestions").map((c) => c.args[0])).toEqual(["PROJ-131"]);
    expect(api.callsOf("getStoryState").map((c) => c.args[0])).toEqual(["PROJ-123"]);
    expect([...new Set(api.callsOf("listStoryEvents").map((c) => c.args[0]))].sort()).toEqual(["PROJ-102", "PROJ-126"]);
    expect(api.callsOf("listStoryRuns")).toEqual([]);
  });

  it("does not open a voyage whose note needs nothing beyond its story", async () => {
    const { api, bus, details } = rig();
    details.sync([docked, working, queued]);
    await settle();
    expect(api.calls).toEqual([]);
    expect(bus.subscribers()).toBe(0);
  });

  it("gives what was read: the questions, the state, who anchored and who rejected", async () => {
    const { details } = rig();
    expect(details.detail("PROJ-131")).toEqual({ questions: null, state: null, halt: null, rejection: null });
    details.sync([asking, deciding, stopped, aground]);
    await settle();
    expect(details.detail("PROJ-131").questions?.map((q) => q.id)).toEqual(["Q1", "Q2"]);
    expect(details.detail("PROJ-123").state?.revisions.get("plan_accepted")).toBe(1);
    expect(details.detail("PROJ-126").halt).toEqual({ actor: "priya@example.com" });
    expect(details.detail("PROJ-102").rejection).toEqual({ actor: "jordan@example.com", gate: "plan_accepted" });
  });

  it("gives the phase an aground voyage stopped in, and only for an aground voyage", async () => {
    const { details } = rig();
    expect(details.stoppedAt(aground)).toBeNull();
    details.sync([aground, stopped]);
    await settle();
    expect(details.stoppedAt(aground)).toBe("plan_review");
    expect(details.stoppedAt(stopped)).toBeNull();
  });

  it("lets go of a voyage that leaves the table, and only of that one", async () => {
    const { bus, details } = rig();
    details.sync([asking, deciding]);
    await settle();
    const both = bus.subscribers();
    expect(both).toBeGreaterThan(0);
    details.sync([deciding]);
    await settle();
    expect(bus.subscribers()).toBeLessThan(both);
    expect(bus.subscribers()).toBeGreaterThan(0);
    details.sync([]);
    await settle();
    expect(bus.subscribers()).toBe(0);
  });

  it("lets go of every voyage when the page goes", async () => {
    const { bus, page, details } = rig();
    details.sync([asking, deciding, stopped, aground]);
    await settle();
    expect(bus.subscribers()).toBeGreaterThan(0);
    page.destroy();
    expect(bus.subscribers()).toBe(0);
  });

  it("stops following what a voyage no longer needs once its status moves on", async () => {
    const { api, clock, stream, details } = rig();
    details.sync([asking]);
    await settle();
    expect(api.callsOf("listQuestions")).toHaveLength(1);
    details.sync([{ ...asking, status: "running", version: 2 }]);
    await settle();
    stream.sendEvent(anEvent(900, "question.answered", {}, "PROJ-131"));
    await settle();
    await clock.advance(300);
    expect(api.callsOf("listQuestions")).toHaveLength(1);
  });
});
