import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { mockBackendInterceptor, provideMockBackend } from "@core/mock/mock-backend";
import { CLOCK, type Clock } from "@core/realtime/clock";
import type { ManualClock } from "@testing/mock-backend/clock";
import type { MockRequest, MockResponse } from "@testing/mock-backend/http";
import type { MockAhoyServer } from "@testing/mock-backend/server";
import { call, settle, testServer } from "@testing/mock-backend/spec-helpers";
import { CLOCK as UI_CLOCK } from "@ui/pipes/clock";
import { RUN_DETAIL_ROUTES } from "./run-detail.routes";

@Component({ selector: "ah-test-stub", template: `<p>Elsewhere</p>` })
class Stub {}

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return { now: () => new Date(manual.now()), schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }) };
}

interface Page {
  readonly server: MockAhoyServer;
  readonly clock: ManualClock;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  readonly requests: MockRequest[];
}

interface OpenOptions {
  /** Changes an answer of the mock before the page sees it. */
  readonly rewrite?: (request: MockRequest, response: MockResponse) => MockResponse;
}

/** The run detail route on the mock backend, opened at `url`. */
async function open(url: string, options: OpenOptions = {}): Promise<Page> {
  const { server, clock } = testServer();
  const requests: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request) => {
    requests.push(request);
    const response = handle(request);
    return options.rewrite?.(request, response) ?? response;
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: "voyages/:key/runs/:runId", children: RUN_DETAIL_ROUTES },
          { path: "voyages/:key/runs", component: Stub },
          { path: "voyages/:key", component: Stub },
          { path: "voyages", component: Stub },
        ],
        withComponentInputBinding(),
      ),
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(server),
      { provide: CLOCK, useValue: asClock(clock) },
      { provide: UI_CLOCK, useValue: () => new Date(clock.now()) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const page = { server, clock, harness, root: harness.fixture.nativeElement as HTMLElement, requests };
  await flush(page);
  return page;
}

async function flush(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
    await page.harness.fixture.whenStable();
  }
}

/** Moves the mock's clock in steps, letting the stream, the refetches and the view settle after each. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 500) {
    page.clock.advance(500);
    await flush(page);
  }
}

/** The text of an element as a reader sees it: text nodes joined with a space, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  if (element === null || element === undefined) return "";
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) parts.push(node.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function page(p: Page): HTMLElement {
  const element = p.root.querySelector<HTMLElement>("ah-run-detail");
  if (element === null) throw new Error("no run detail");
  return element;
}

/** The runs of a voyage as the mock lists them, oldest first. */
function runIds(server: MockAhoyServer, key: string): string[] {
  const { items } = call(server, "GET", `/stories/${key}/runs`).body as {
    items: { id: string; createdAt: string }[];
  };
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((run) => run.id);
}

function detail(p: Page): Map<string, string> {
  const dl = page(p).querySelector(".run__dl");
  const entries = new Map<string, string>();
  dl?.querySelectorAll("dt").forEach((dt) => entries.set(text(dt), text(dt.nextElementSibling)));
  return entries;
}

function steps(p: Page): string[] {
  return [...page(p).querySelectorAll(".ah-steps__row, .ah-steps__gap")].map((row) => text(row));
}

describe("RunDetailPage on the mock backend", () => {
  describe("a run that ended (PROJ-123, the last one)", () => {
    async function openLast(): Promise<{ p: Page; id: string; ids: string[] }> {
      const { server } = testServer();
      const ids = runIds(server, "PROJ-123");
      const id = ids.at(-1) ?? "";
      return { p: await open(`/voyages/PROJ-123/runs/${id}`), id, ids };
    }

    it("shows the breadcrumb, the title with the crew member and the voyage's title", async () => {
      const { p, id } = await openLast();
      const crumbs = page(p).querySelector(".run__crumbs");
      expect(text(crumbs)).toBe(`Voyages / PROJ-123 / Runs / ${id}`);
      expect(text(page(p).querySelector("h1"))).toBe(`Run ${id} · Cartographer`);
      expect(text(page(p).querySelector(".run__title > .run__sub"))).toBe(
        "PROJ-123 · Show invoice due date on the billing page",
      );
      expect(text(page(p).querySelector(".run__badges ah-outcome-pill"))).toBe("succeeded");
    });

    it("says 'planning · revision round 2' because the plan was sent back once before this run", async () => {
      const { p } = await openLast();
      expect(text(page(p).querySelector(".run__badges .run__sub"))).toBe("planning · revision round 2");
    });

    it("has the four tiles, AIU with two decimals", async () => {
      const { p } = await openLast();
      const tiles = [...page(p).querySelectorAll(".run__tile")].map((tile) => text(tile));
      expect(tiles.length).toBe(4);
      expect(tiles[0]).toMatch(/^AIU spent \d+\.\d\d of this run's [\d.]+ AIU cap$/);
      expect(tiles[1]).toMatch(/^Requests \d+ model requests$/);
      expect(tiles[2]).toMatch(/^Tokens \S+ \S+ in · \S+ out$/);
      expect(tiles[3]).toMatch(/^Duration .+ \w{3} \d\d:\d\d → \d\d:\d\d$/);
    });

    it("lists the details, with the full agent config sha and the effort's origin", async () => {
      const { p } = await openLast();
      const d = detail(p);
      expect([...d.keys()]).toEqual([
        "Agent",
        "Model",
        "Reasoning effort",
        "Status",
        "Exit reason",
        "Started by",
        "Queued",
        "Started",
        "Ended",
        "Runtime",
        "Agent config",
      ]);
      expect(d.get("Agent")).toBe("Cartographer");
      expect(d.get("Status")).toBe("succeeded");
      expect(d.get("Started by")).toBe("alex@example.com");
      expect(d.get("Queued")).toMatch(/^\w{3} \d\d:\d\d:\d\d$/);
      expect(d.get("Agent config")).toMatch(/^[0-9a-f]{40}$/);
      expect(d.get("Reasoning effort")).toMatch(
        /\S+ (Server default|Chosen for this voyage|Agent config|Model's own)$/,
      );
      expect(page(p).querySelector(".run__details")?.textContent).not.toContain("Offline replay");
    });

    it("shows the automated gate verdict with its gate and message", async () => {
      const { p } = await openLast();
      const panel = [...page(p).querySelectorAll("ah-panel")].find(
        (e) => text(e.querySelector("h2")) === "Automated gate",
      );
      expect(text(panel?.querySelector("ah-outcome-pill"))).toBe("pass");
      expect(text(panel)).toMatch(/pass plan · Plan revision \d passes all checks\.$/);
    });

    it("has the Steps panel as history, with no controls and no steps invented for a run that logged none", async () => {
      const { p } = await openLast();
      const panel = [...page(p).querySelectorAll("ah-panel")].find((e) => text(e.querySelector("h2")) === "Steps");
      expect(text(panel?.querySelector("h2 ~ span, .ah-muted"))).toBe("The live steps, kept as history");
      expect(panel?.querySelector("[role=log]")).not.toBeNull();
      expect(panel?.querySelectorAll("button, input, textarea").length).toBe(0);
      expect(text(panel)).toContain("this list is never complete");
    });

    it("pages to the run before and has no run after: the last button is disabled", async () => {
      const { p, ids } = await openLast();
      const pager = page(p).querySelector(".run__pager");
      const previous = pager?.querySelector<HTMLAnchorElement>("a:first-child");
      expect(text(previous)).toBe(`← ${ids.at(-2)}`);
      expect(previous?.getAttribute("href")).toBe(`/voyages/PROJ-123/runs/${ids.at(-2)}`);
      const all = pager?.querySelectorAll("a")[1];
      expect(text(all)).toBe("All runs");
      expect(all?.getAttribute("href")).toBe("/voyages/PROJ-123/runs");
      const last = pager?.querySelector<HTMLButtonElement>("button:last-child");
      expect(text(last)).toBe("→");
      expect(last?.disabled).toBe(true);
    });
  });

  it("disables the previous button on the first run and links to the next", async () => {
    const { server } = testServer();
    const ids = runIds(server, "PROJ-123");
    const p = await open(`/voyages/PROJ-123/runs/${ids[0]}`);
    const pager = page(p).querySelector(".run__pager");
    const first = pager?.querySelector<HTMLButtonElement>("button");
    expect(first?.disabled).toBe(true);
    expect(text(first)).toBe("←");
    expect(pager?.querySelectorAll("a")[1]?.getAttribute("href")).toBe(`/voyages/PROJ-123/runs/${ids[1]}`);
    expect(text(page(p).querySelector(".run__badges .run__sub"))).toBe("intake");
    expect(text(page(p).querySelector("h1"))).toContain("Navigator");
  });

  describe("a run without a gate, and a replay", () => {
    it("shows '—' for the gate of a run that has none", async () => {
      const { server } = testServer();
      const id = runIds(server, "PROJ-140").at(-1) ?? "";
      const p = await open(`/voyages/PROJ-140/runs/${id}`);
      const panel = [...page(p).querySelectorAll("ah-panel")].find(
        (e) => text(e.querySelector("h2")) === "Automated gate",
      );
      expect(text(panel)).toContain("—");
      expect(panel?.querySelector("ah-outcome-pill")).toBeNull();
    });

    it("says that an offline replay is not charged again", async () => {
      const { server } = testServer();
      const id = runIds(server, "PROJ-123").at(-1) ?? "";
      const p = await open(`/voyages/PROJ-123/runs/${id}`, {
        rewrite: (request, response) =>
          request.path === `/runs/${id}` && response.kind === "json"
            ? {
                ...response,
                body: { ...(response.body as object), runtime: "replay", replayOf: "proj-123-planning-000-ffff" },
              }
            : response,
      });
      expect(text(page(p).querySelector(".run__details"))).toContain(
        "Offline replay of proj-123-planning-000-ffff: usage is not charged again.",
      );
      expect(detail(p).get("Runtime")).toBe("replay");
    });
  });

  describe("a run that does not exist", () => {
    it("says so for an unknown run id, with a link back to the voyage", async () => {
      const p = await open("/voyages/PROJ-123/runs/proj-123-planning-099-0000");
      expect(text(page(p).querySelector("ah-empty-state"))).toContain("This run doesn't exist");
      const link = page(p).querySelector<HTMLAnchorElement>("ah-empty-state a");
      expect(link?.getAttribute("href")).toBe("/voyages/PROJ-123");
    });

    it("says so for a run of another voyage", async () => {
      const { server } = testServer();
      const other = runIds(server, "PROJ-140")[0] ?? "";
      const p = await open(`/voyages/PROJ-123/runs/${other}`);
      expect(text(page(p).querySelector("ah-empty-state"))).toContain("This run doesn't exist");
      expect(page(p).querySelector("h1")).toBeNull();
    });

    it("never sends a key that is not a Jira key", async () => {
      const p = await open("/voyages/not-a-key/runs/whatever");
      expect(text(page(p).querySelector("ah-empty-state"))).toContain("This run doesn't exist");
      expect(page(p).querySelector<HTMLAnchorElement>("ah-empty-state a")?.getAttribute("href")).toBe("/voyages");
      expect(p.requests.filter((request) => request.path.includes("not-a-key"))).toEqual([]);
    });

    it("tells a failure to read from a missing run, and tries again", async () => {
      let fail = true;
      const { server } = testServer();
      const id = runIds(server, "PROJ-123").at(-1) ?? "";
      const p = await open(`/voyages/PROJ-123/runs/${id}`, {
        rewrite: (request, response) =>
          fail && request.path === `/runs/${id}`
            ? {
                kind: "json",
                status: 503,
                headers: { "content-type": "application/problem+json" },
                body: { type: "urn:ahoy:problem:unavailable", title: "unavailable", status: 503, code: "unavailable" },
              }
            : response,
      });
      expect(page(p).querySelector("ah-banner")).not.toBeNull();
      expect(text(page(p).querySelector("ah-empty-state"))).not.toContain("doesn't exist");
      fail = false;
      page(p).querySelector<HTMLButtonElement>("ah-banner button")?.click();
      await flush(p);
      expect(text(page(p).querySelector("h1"))).toContain(`Run ${id}`);
    });
  });

  describe("PROJ-140, whose run is on", () => {
    async function openLive(): Promise<Page> {
      const { server } = testServer();
      const id = runIds(server, "PROJ-140").at(-1) ?? "";
      return open(`/voyages/PROJ-140/runs/${id}`);
    }

    it("shows the archived steps with '38 steps not shown' and a [REDACTED] mask, and only this run's", async () => {
      const p = await openLive();
      const rows = steps(p);
      expect(rows).toContain("38 steps not shown");
      expect([...page(p).querySelectorAll(".ah-steps .ah-redacted")].map((e) => text(e))).toEqual(["[REDACTED]"]);
      expect(rows.length).toBe(5);
    });

    it("keeps the steps and swaps the spend for the final charge when the run ends", async () => {
      const p = await openLive();
      const before = steps(p);
      expect(detail(p).get("Status")).toBe("running");
      await advance(p, 6_000);
      expect(detail(p).get("Status")).toBe("succeeded");
      const tile = text(page(p).querySelector(".run__tile"));
      expect(tile).toMatch(/^AIU spent 1\.80 of this run's 8 AIU cap$/);
      expect(steps(p).slice(0, before.length)).toEqual(before);
      expect(steps(p).length).toBeGreaterThan(before.length);
    });
  });

  it("shows only this run's steps: the intake run of PROJ-140 has none of the planning run's", async () => {
    const { server } = testServer();
    const first = runIds(server, "PROJ-140")[0] ?? "";
    const p = await open(`/voyages/PROJ-140/runs/${first}`);
    const rows = steps(p);
    expect(rows).not.toContain("38 steps not shown");
    expect(page(p).querySelectorAll(".ah-steps .ah-redacted").length).toBe(0);
    expect(rows.every((row) => !row.includes("audit"))).toBe(true);
  });
});
