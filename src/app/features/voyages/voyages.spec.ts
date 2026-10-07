import { TestBed } from "@angular/core/testing";
import { Router, provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { fail, ok } from "@core/api/api-error";
import { parseAiu } from "@domain/aiu";
import type { AhoyEvent, Question, Story } from "@core/api/types";
import { aStory, anEvent } from "@core/realtime/testing/events";
import { FakeApi } from "@core/realtime/testing/fake-api";
import { FakeClock, settle } from "@core/realtime/testing/fake-clock";
import { FakeFetch, type SseBody } from "@core/realtime/testing/fake-fetch";
import { provideFakes } from "@core/realtime/testing/providers";
import { CLOCK as UI_CLOCK } from "@ui/pipes/clock";
import { VoyagesPage } from "./voyages";

const NOW = "2026-10-06T10:10:00.000Z";
/** An AIU amount in integer nano-AIU, read as text so that no float is involved (CLAUDE.md "Numbers"). */
const aiu = (text: string): number => parseAiu(text)!;

/** The eight voyages of the wireframes (fictional), most recently updated first, as the `Voyages` board shows them. */
const EIGHT: readonly Story[] = [
  aStory("PROJ-140", {
    title: "Add audit trail to admin role changes",
    owner: "jordan@example.com",
    phase: "planning",
    status: "running",
    budgetNanoAiu: aiu("30"),
    spentNanoAiu: aiu("3.2"),
    updatedAt: "2026-10-06T10:10:00.000Z",
  }),
  aStory("PROJ-109", {
    title: "Migrate email templates to the new sender",
    owner: "alex@example.com",
    phase: "intake",
    status: "ready",
    budgetNanoAiu: aiu("20"),
    spentNanoAiu: 0,
    updatedAt: "2026-10-06T10:09:00.000Z",
  }),
  aStory("PROJ-126", {
    title: "Search orders by customer email",
    owner: "priya@example.com",
    phase: "intake",
    status: "halted",
    haltReason: "stopped_by_user",
    budgetNanoAiu: aiu("15"),
    spentNanoAiu: aiu("0.6"),
    updatedAt: "2026-10-06T10:01:00.000Z",
  }),
  aStory("PROJ-123", {
    title: "Show invoice due date on the billing page",
    owner: "alex@example.com",
    phase: "plan_review",
    status: "awaiting_decision",
    budgetNanoAiu: aiu("30"),
    spentNanoAiu: aiu("12.4"),
    updatedAt: "2026-10-06T09:48:00.000Z",
  }),
  aStory("PROJ-131", {
    title: "Let customers download receipts as PDF",
    owner: "sam@example.com",
    phase: "planning",
    status: "awaiting_input",
    budgetNanoAiu: aiu("25"),
    spentNanoAiu: aiu("6.1"),
    updatedAt: "2026-10-06T09:22:00.000Z",
  }),
  aStory("PROJ-118", {
    title: "Rate-limit the public search endpoint",
    owner: "sam@example.com",
    phase: "planning",
    status: "halted",
    haltReason: "run_failed",
    budgetNanoAiu: aiu("20"),
    spentNanoAiu: aiu("9.8"),
    updatedAt: "2026-10-06T08:00:00.000Z",
  }),
  aStory("PROJ-097", {
    title: "Fix the timezone in the weekly report",
    owner: "alex@example.com",
    phase: "done",
    status: "terminal",
    budgetNanoAiu: aiu("40"),
    spentNanoAiu: aiu("27.1"),
    updatedAt: "2026-10-05T09:00:00.000Z",
  }),
  aStory("PROJ-102", {
    title: "Remove the legacy coupon flow",
    owner: "jordan@example.com",
    phase: "blocked",
    status: "terminal",
    budgetNanoAiu: aiu("20"),
    spentNanoAiu: aiu("8.3"),
    updatedAt: "2026-10-03T10:00:00.000Z",
  }),
];

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
    {
      ...anEvent(2, "story.halted", { reason: "stopped_by_user", detail: "Waiting for the ticket" }, "PROJ-126"),
      actor: "priya@example.com",
    },
  ],
  "PROJ-118": [anEvent(1, "story.halted", { reason: "run_failed", detail: "Refused." }, "PROJ-118")],
  "PROJ-102": [
    anEvent(4, "story.phase_changed", { from: "plan_review", to: "blocked" }, "PROJ-102"),
    {
      ...anEvent(5, "decision.recorded", { gate: "plan_accepted", decision: "reject" }, "PROJ-102"),
      actor: "jordan@example.com",
    },
  ],
};

const text = (node: Node | null | undefined): string => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The text of an element's direct children, apart: a badge, an API word and a count have only a gap between them. */
function partsText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType !== Node.COMMENT_NODE)
    .map((node) => text(node))
    .filter((part) => part !== "")
    .join(" ");
}

/** Renders the page at `url` over fakes. */
async function open(url: string, stories: readonly Story[] = EIGHT, wire: (api: FakeApi) => void = () => undefined) {
  const clock = new FakeClock(NOW);
  const net = new FakeFetch();
  const stream: SseBody = net.stream();
  const api = new FakeApi();
  api.on("listStories", () => Promise.resolve(ok({ items: stories, nextCursor: null })));
  api.on("listQuestions", () =>
    Promise.resolve(ok([question("Q1", true), question("Q2", false), question("Q3", false)])),
  );
  api.on("getStoryState", (key) =>
    Promise.resolve(ok({ key, version: 9, state: { revisions: { plan_accepted: 1 }, revision_ceiling: 4 } })),
  );
  api.on("listStoryEvents", (key) =>
    Promise.resolve(ok({ items: EVENTS[key] ?? [], lastEventId: EVENTS[key]?.at(-1)?.id ?? null })),
  );
  wire(api);
  TestBed.configureTestingModule({
    providers: [
      ...provideFakes({ api, clock, net }),
      provideRouter([{ path: "voyages", component: VoyagesPage }], withComponentInputBinding()),
      { provide: UI_CLOCK, useValue: () => clock.now() },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  const flush = async (): Promise<void> => {
    await settle();
    harness.detectChanges();
    await harness.fixture.whenStable();
    await settle();
    harness.detectChanges();
  };
  await harness.navigateByUrl(url, VoyagesPage);
  await flush();
  const root = harness.fixture.nativeElement as HTMLElement;

  const chips = () =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("button.ah-chip")).map((button) => ({
      text: partsText(button),
      pressed: button.getAttribute("aria-pressed") === "true",
      button,
    }));
  const rows = () =>
    Array.from(root.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => partsText(td)),
    );
  const keys = () => rows().map((cells) => cells[1]?.split(" ")[0]);
  const click = async (el: HTMLElement | undefined): Promise<void> => {
    if (el === undefined) throw new Error("nothing to click");
    el.click();
    await flush();
  };
  const press = (label: string) => click(chips().find((chip) => chip.text.startsWith(label))?.button);
  return { harness, router, root, api, clock, stream, flush, chips, rows, keys, click, press };
}

describe("Voyages", () => {
  it("says what the list is", async () => {
    const { root } = await open("/voyages");
    expect(text(root.querySelector("h1"))).toBe("Voyages");
    expect(text(root)).toContain("Every story in Ahoy, most recently updated first.");
  });

  describe("chips", () => {
    it("show All and the six statuses with the API word and the count of each", async () => {
      const { chips } = await open("/voyages");
      expect(chips().map((chip) => chip.text)).toEqual([
        "All 8",
        "Queued ready 1",
        "Under way running 1",
        "Crew asks awaiting_input 1",
        "Your orders awaiting_decision 1",
        "Anchored halted 2",
        "In port terminal 2",
      ]);
    });

    it("press All when the address has no status, and list every voyage, the latest update first", async () => {
      const { chips, keys } = await open("/voyages");
      expect(
        chips()
          .filter((chip) => chip.pressed)
          .map((chip) => chip.text),
      ).toEqual(["All 8"]);
      expect(keys()).toEqual([
        "PROJ-140",
        "PROJ-109",
        "PROJ-126",
        "PROJ-123",
        "PROJ-131",
        "PROJ-118",
        "PROJ-097",
        "PROJ-102",
      ]);
    });

    it("press the chip of the status in the address and list only those voyages", async () => {
      const { chips, keys } = await open("/voyages?status=halted");
      expect(
        chips()
          .filter((chip) => chip.pressed)
          .map((chip) => chip.text),
      ).toEqual(["Anchored halted 2"]);
      expect(keys()).toEqual(["PROJ-126", "PROJ-118"]);
    });

    it("put the status in the address when pressed, and take it out for All", async () => {
      const { router, press, keys } = await open("/voyages");
      await press("Crew asks");
      expect(router.url).toBe("/voyages?status=awaiting_input");
      expect(keys()).toEqual(["PROJ-131"]);
      await press("In port");
      expect(router.url).toBe("/voyages?status=terminal");
      expect(keys()).toEqual(["PROJ-097", "PROJ-102"]);
      await press("All");
      expect(router.url).toBe("/voyages");
      expect(keys()).toHaveLength(8);
    });

    it("keep the search in the address when a status is pressed", async () => {
      const { router, press, keys } = await open("/voyages?q=search");
      await press("Anchored");
      expect(router.url).toBe("/voyages?q=search&status=halted");
      expect(keys()).toEqual(["PROJ-126", "PROJ-118"]);
    });

    it("follow the address when it changes, as the back button does", async () => {
      const { harness, chips, keys, flush } = await open("/voyages?status=halted");
      await harness.navigateByUrl("/voyages?status=running", VoyagesPage);
      await flush();
      expect(
        chips()
          .filter((chip) => chip.pressed)
          .map((chip) => chip.text),
      ).toEqual(["Under way running 1"]);
      expect(keys()).toEqual(["PROJ-140"]);
    });

    it("read a status that is not one of the six, which anyone can type in the address, as All", async () => {
      const { chips, keys, router } = await open("/voyages?status=%3Cscript%3E");
      expect(
        chips()
          .filter((chip) => chip.pressed)
          .map((chip) => chip.text),
      ).toEqual(["All 8"]);
      expect(keys()).toHaveLength(8);
      expect(router.url).toBe("/voyages?status=%3Cscript%3E");
    });
  });

  describe("search", () => {
    it("filters by title from ?q=, ignoring case", async () => {
      const { keys } = await open("/voyages?q=INVOICE");
      expect(keys()).toEqual(["PROJ-123"]);
    });

    it("filters by key from ?q=", async () => {
      const { keys } = await open("/voyages?q=proj-09");
      expect(keys()).toEqual(["PROJ-097"]);
    });

    it("counts on the chips what the search leaves", async () => {
      const { chips } = await open("/voyages?q=search");
      expect(chips().map((chip) => chip.text)).toEqual([
        "All 2",
        "Queued ready 0",
        "Under way running 0",
        "Crew asks awaiting_input 0",
        "Your orders awaiting_decision 0",
        "Anchored halted 2",
        "In port terminal 0",
      ]);
    });

    it("combines with the status", async () => {
      const { keys } = await open("/voyages?status=halted&q=rate");
      expect(keys()).toEqual(["PROJ-118"]);
    });

    it("takes the text literally, so a pattern matches nothing", async () => {
      const { keys, root } = await open("/voyages?q=.*");
      expect(keys()).toEqual([]);
      expect(text(root)).toContain("No voyages match “.*”");
    });
  });

  describe("the table", () => {
    it("has the columns of the board, with Updated marked as the order", async () => {
      const { root } = await open("/voyages");
      const heads = Array.from(root.querySelectorAll("thead th"));
      expect(heads.map((th) => text(th))).toEqual([
        "Status",
        "Voyage",
        "Phase",
        "Progress",
        "Note",
        "Owner",
        "Budget (AIU)",
        "Updated ↓",
      ]);
      expect(heads.map((th) => th.getAttribute("aria-sort"))).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "descending",
      ]);
    });

    it("shows each voyage as the board does: status, voyage, phase, note, owner, budget and update", async () => {
      const { rows } = await open("/voyages");
      const byKey = Object.fromEntries(rows().map((cells) => [cells[1]?.split(" ")[0], cells]));
      expect(byKey["PROJ-123"]).toEqual([
        "Your orders",
        "PROJ-123 Show invoice due date on the billing page",
        "plan_review",
        "",
        "Plan waiting for approval · round 2 of 4",
        "alex@example.com",
        "12.4 / 30",
        "22 m ago",
      ]);
      expect(byKey["PROJ-102"]?.[6]).toBe("8.3 / 20");
      expect(byKey["PROJ-140"]?.[7]).toBe("just now");
      expect(byKey["PROJ-109"]?.[7]).toBe("1 m ago");
      expect(byKey["PROJ-097"]?.[7]).toBe("1 d ago");
      expect(byKey["PROJ-102"]?.[7]).toBe("3 d ago");
    });

    it("writes the note of each status", async () => {
      const { rows } = await open("/voyages");
      expect(Object.fromEntries(rows().map((cells) => [cells[1]?.split(" ")[0], cells[4]]))).toEqual({
        "PROJ-140": "Cartographer at work",
        "PROJ-109": "Navigator goes next",
        "PROJ-126": "Stopped by priya@example.com",
        "PROJ-123": "Plan waiting for approval · round 2 of 4",
        "PROJ-131": "2 open questions",
        "PROJ-118": "A crew member's run failed, for example a refused model or a crash.",
        "PROJ-097": "Delivered",
        "PROJ-102": "Plan rejected by jordan@example.com",
      });
    });

    it("draws the seven bars of progress, and where an aground voyage stopped from its event", async () => {
      const { root } = await open("/voyages");
      const labels = Array.from(root.querySelectorAll("tbody tr")).map((tr) => ({
        key: text(tr.querySelector("a.ah-key")),
        label: tr.querySelector(".ah-dots")?.getAttribute("aria-label"),
        bars: tr.querySelectorAll(".ah-dots > span").length,
      }));
      expect(labels.map((l) => [l.key, l.label])).toEqual([
        ["PROJ-140", "Phase 2 of 7"],
        ["PROJ-109", "Phase 1 of 7"],
        ["PROJ-126", "Stopped at phase 1"],
        ["PROJ-123", "Phase 3 of 7"],
        ["PROJ-131", "Phase 2 of 7"],
        ["PROJ-118", "Stopped at phase 2"],
        ["PROJ-097", "Done"],
        ["PROJ-102", "Blocked at phase 3"],
      ]);
      expect(labels.every((l) => l.bars === 7)).toBe(true);
    });

    it("reads events only for the voyages whose row needs them, and not for the others", async () => {
      const { api } = await open("/voyages");
      const eventsOf = api.callsOf("listStoryEvents").map((call) => call.args[0]);
      expect([...new Set(eventsOf)].sort()).toEqual(["PROJ-102", "PROJ-118", "PROJ-126"]);
      expect(api.callsOf("listQuestions").map((call) => call.args[0])).toEqual(["PROJ-131"]);
      expect(api.callsOf("getStoryState").map((call) => call.args[0])).toEqual(["PROJ-123"]);
    });

    it("links the key to the voyage", async () => {
      const { root } = await open("/voyages?status=terminal");
      expect(Array.from(root.querySelectorAll("a.ah-key")).map((a) => a.getAttribute("href"))).toEqual([
        "/voyages/PROJ-097",
        "/voyages/PROJ-102",
      ]);
    });

    it("scrolls inside a box that a keyboard can reach", async () => {
      const { root } = await open("/voyages");
      const box = root.querySelector("[role=region]");
      expect(box?.getAttribute("tabindex")).toBe("0");
      expect(box?.getAttribute("aria-label")).toBe("Voyages");
      expect(box?.querySelector("table")).not.toBeNull();
    });
  });

  describe("Load more", () => {
    const MANY = Array.from({ length: 120 }, (_, i) =>
      aStory(`PROJ-${1000 + i}`, {
        status: "running",
        updatedAt: new Date(Date.parse(NOW) - i * 60_000).toISOString(),
      }),
    );

    it("says how many of the voyages it shows, and has nothing more to load when it shows them all", async () => {
      const { root } = await open("/voyages");
      expect(text(root.querySelector(".ah-panel__foot span"))).toBe("Showing 8 of 8");
      expect(root.querySelector<HTMLButtonElement>(".ah-panel__foot button")?.disabled).toBe(true);
    });

    it("shows 50 first and 50 more each time, the latest first", async () => {
      const { root, keys, click } = await open("/voyages", MANY);
      expect(keys()).toHaveLength(50);
      expect(keys()[0]).toBe("PROJ-1000");
      expect(text(root.querySelector(".ah-panel__foot span"))).toBe("Showing 50 of 120");
      const more = () => root.querySelector<HTMLButtonElement>(".ah-panel__foot button");
      expect(more()?.disabled).toBe(false);
      await click(more() ?? undefined);
      expect(keys()).toHaveLength(100);
      expect(text(root.querySelector(".ah-panel__foot span"))).toBe("Showing 100 of 120");
      await click(more() ?? undefined);
      expect(keys()).toHaveLength(120);
      expect(text(root.querySelector(".ah-panel__foot span"))).toBe("Showing 120 of 120");
      expect(more()?.disabled).toBe(true);
    });

    it("starts again at 50 when the filter changes", async () => {
      const { root, keys, click, press } = await open("/voyages", MANY);
      await click(root.querySelector<HTMLButtonElement>(".ah-panel__foot button") ?? undefined);
      expect(keys()).toHaveLength(100);
      await press("Under way");
      expect(keys()).toHaveLength(50);
      expect(text(root.querySelector(".ah-panel__foot span"))).toBe("Showing 50 of 120");
    });
  });

  describe("states", () => {
    it("shows skeleton rows of the table, with no counts on the chips, while the list loads", async () => {
      const never = new Promise<never>(() => undefined);
      const { root, chips } = await open("/voyages", EIGHT, (api) => api.on("listStories", () => never));
      expect(root.querySelector("[aria-busy=true]")).not.toBeNull();
      expect(chips().map((chip) => chip.text)).toEqual([
        "All",
        "Queued ready",
        "Under way running",
        "Crew asks awaiting_input",
        "Your orders awaiting_decision",
        "Anchored halted",
        "In port terminal",
      ]);
      expect(root.querySelector("table")).toBeNull();
      expect(text(root)).not.toContain("No voyages");
    });

    it("says which status has no voyage and offers to show all of them", async () => {
      const calm = EIGHT.filter((story) => story.status !== "halted");
      const { root, router, keys, click } = await open("/voyages?status=halted", calm);
      expect(text(root)).toContain("No anchored voyages");
      expect(text(root)).toContain("Every voyage is moving or in port.");
      expect(root.querySelector("table")).toBeNull();
      const show = Array.from(root.querySelectorAll("button")).find((b) => text(b) === "Show all statuses");
      await click(show);
      expect(router.url).toBe("/voyages");
      expect(keys()).toHaveLength(6);
    });

    it("says which words found nothing and offers to clear the search", async () => {
      const { root, router, keys, click } = await open("/voyages?q=zebra");
      expect(text(root)).toContain("No voyages match “zebra”");
      const clear = Array.from(root.querySelectorAll("button")).find((b) => text(b) === "Clear search");
      await click(clear);
      expect(router.url).toBe("/voyages");
      expect(keys()).toHaveLength(8);
    });

    it("keeps the status when the search is cleared", async () => {
      const { router, root, click } = await open("/voyages?status=halted&q=zebra");
      await click(Array.from(root.querySelectorAll("button")).find((b) => text(b) === "Clear search"));
      expect(router.url).toBe("/voyages?status=halted");
    });

    it("invites to set sail when there is no voyage at all", async () => {
      const { root } = await open("/voyages", []);
      expect(text(root)).toContain("No voyages yet");
      const link = Array.from(root.querySelectorAll<HTMLAnchorElement>("a")).find((a) => text(a) === "Set sail");
      expect(link?.getAttribute("href")).toBe("/voyages/new");
    });

    it("says contact was lost, that nothing was lost, and tries again on request", async () => {
      let attempt = 0;
      const { root, click } = await open("/voyages", EIGHT, (api) =>
        api.on("listStories", () => {
          attempt++;
          return Promise.resolve(
            attempt === 1
              ? fail({ kind: "problem", status: 503, code: "unavailable", title: "Unavailable", instance: "req-7" })
              : ok({ items: EIGHT, nextCursor: null }),
          );
        }),
      );
      const banner = root.querySelector(".ah-banner");
      expect(text(banner)).toContain("Lost contact with the harbour");
      expect(text(banner)).toContain("Nothing you did was lost, and no voyage stopped because of this.");
      expect(text(banner)).toContain("503 · unavailable · request req-7");
      expect(root.querySelector("table")).toBeNull();
      await click(Array.from(root.querySelectorAll("button")).find((b) => text(b) === "Try again"));
      expect(root.querySelector(".ah-banner")).toBeNull();
      expect(root.querySelectorAll("tbody tr")).toHaveLength(8);
    });

    it("says Ahoy sent something unexpected when the answer cannot be read, which is not a verdict", async () => {
      const { root } = await open("/voyages", EIGHT, (api) =>
        api.on("listStories", () => Promise.resolve(fail({ kind: "invalid_response", what: "listStories: bad" }))),
      );
      expect(text(root)).toContain("Ahoy sent something unexpected");
      expect(text(root)).not.toContain("Lost contact with the harbour");
    });
  });

  describe("live", () => {
    it("changes the row, the note and the counts when the stream says a voyage moved, with no reload", async () => {
      const { api, stream, clock, flush, chips, rows } = await open("/voyages");
      api.on("getStory", () =>
        Promise.resolve(
          ok({
            ...EIGHT[4]!,
            status: "running" as const,
            version: 2,
            updatedAt: "2026-10-06T10:10:20.000Z",
          }),
        ),
      );
      stream.sendEvent(anEvent(901, "question.answered", {}, "PROJ-131"));
      await settle();
      await clock.advance(300);
      await flush();
      expect(rows()[0]?.slice(0, 5)).toEqual([
        "Under way",
        "PROJ-131 Let customers download receipts as PDF",
        "planning",
        "",
        "Cartographer at work",
      ]);
      expect(chips().map((chip) => chip.text)).toContain("Crew asks awaiting_input 0");
      expect(chips().map((chip) => chip.text)).toContain("Under way running 2");
    });
  });
});
