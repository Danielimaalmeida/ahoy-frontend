import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { fail, ok, type ApiResult } from "@core/api/api-error";
import type { Story } from "@core/api/types";
import { AppConfigStore } from "@core/config/app-config";
import { aStory } from "@core/realtime/testing/events";
import { FakeApi } from "@core/realtime/testing/fake-api";
import { FakeClock, settle } from "@core/realtime/testing/fake-clock";
import { FakeFetch } from "@core/realtime/testing/fake-fetch";
import { provideFakes } from "@core/realtime/testing/providers";
import { StoriesStore } from "@core/stores/stories-store";
import { CLOCK as UI_CLOCK } from "@ui/pipes/clock";
import { BACKLOG_PORT, type BacklogItem, type BacklogPage, type BacklogPort, type BacklogQuery } from "./backlog-port";
import { Docks, priorityTrend } from "./docks";
import { StubBacklogAdapter } from "./stub-backlog-adapter";

/** An item for specs; fictional data. */
function anItem(key: string, changes: Partial<BacklogItem> = {}): BacklogItem {
  return {
    key,
    summary: `Summary of ${key}`,
    type: "Story",
    jiraStatus: "To Do",
    priority: "Medium",
    assignee: null,
    updatedAt: "2026-10-06T09:00:00.000Z",
    ...changes,
  };
}

/** A backlog written by the spec: it answers with `items` in pages of `size` and records every query. */
class FakeBacklog implements BacklogPort {
  readonly queries: BacklogQuery[] = [];
  /** What the next call answers instead, if set. */
  next: (() => Promise<ApiResult<BacklogPage>>) | null = null;

  constructor(
    private readonly items: readonly BacklogItem[],
    readonly planned = true,
    private readonly size = 100,
  ) {}

  list(query: BacklogQuery): Promise<ApiResult<BacklogPage>> {
    this.queries.push(query);
    const override = this.next;
    this.next = null;
    if (override !== null) return override();
    const from = query.cursor === undefined ? 0 : Number(query.cursor);
    const to = from + this.size;
    return Promise.resolve(
      ok({
        items: this.items.slice(from, to),
        total: this.items.length,
        nextCursor: to < this.items.length ? String(to) : null,
        facets: { jiraStatuses: ["To Do", "Done"], assignees: ["sam@example.com"] },
      }),
    );
  }
}

describe("priorityTrend", () => {
  it("points up for urgent priorities, down for minor ones and flat for the rest, ignoring case", () => {
    expect(priorityTrend("High")).toBe("up");
    expect(priorityTrend(" HIGHEST ")).toBe("up");
    expect(priorityTrend("low")).toBe("down");
    expect(priorityTrend("Lowest")).toBe("down");
    expect(priorityTrend("Medium")).toBe("flat");
    expect(priorityTrend("P2")).toBe("flat");
    expect(priorityTrend("")).toBe("flat");
  });
});

describe("Docks", () => {
  let api: FakeApi;
  let stories: readonly Story[];
  let storiesAnswer: (() => Promise<ApiResult<{ items: readonly Story[]; nextCursor: string | null }>>) | null;

  beforeEach(() => {
    api = new FakeApi();
    stories = [];
    storiesAnswer = null;
    api.on("listStories", () => storiesAnswer?.() ?? Promise.resolve(ok({ items: stories, nextCursor: null })));
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock("2026-10-06T10:00:00.000Z"), net: new FakeFetch() }),
        // The relative times of the pipes read the kit's own clock, not the realtime one.
        { provide: UI_CLOCK, useValue: () => new Date("2026-10-06T10:00:00.000Z") },
        provideRouter([]),
      ],
    });
  });

  /** Opens the screen and waits for the backlog and the voyages to arrive. */
  async function mount(
    backlog: BacklogPort | null = null,
    jiraBaseUrl: string | null = null,
  ): Promise<ComponentFixture<Docks>> {
    if (backlog !== null) TestBed.overrideProvider(BACKLOG_PORT, { useValue: backlog });
    if (jiraBaseUrl !== null) {
      TestBed.inject(AppConfigStore).set({ apiBase: "/api/v1", actor: "alex@example.com", jiraBaseUrl });
    }
    const fixture = TestBed.createComponent(Docks);
    await refresh(fixture);
    return fixture;
  }

  async function refresh(fixture: ComponentFixture<Docks>): Promise<void> {
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  const root = (f: ComponentFixture<Docks>): HTMLElement => f.nativeElement as HTMLElement;
  const rows = (f: ComponentFixture<Docks>): HTMLTableRowElement[] =>
    [...root(f).querySelectorAll("tbody tr")] as HTMLTableRowElement[];
  const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const cell = (row: HTMLTableRowElement, index: number): HTMLTableCellElement => row.cells[index]!;
  const rowOf = (f: ComponentFixture<Docks>, key: string): HTMLTableRowElement => {
    const row = rows(f).find((r) => text(cell(r, 0)) === key);
    if (row === undefined) throw new Error(`no row for ${key}`);
    return row;
  };
  const byLabel = <T extends Element>(f: ComponentFixture<Docks>, label: string): T =>
    root(f).querySelector<T>(`[aria-label="${label}"]`)!;
  const pill = (f: ComponentFixture<Docks>, name: string): HTMLButtonElement =>
    [...root(f).querySelectorAll<HTMLButtonElement>('[aria-label="Ahoy state"] button')].find((b) => text(b) === name)!;

  async function type(f: ComponentFixture<Docks>, value: string): Promise<void> {
    const input = byLabel<HTMLInputElement>(f, "Search the backlog");
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await refresh(f);
  }

  async function choose(f: ComponentFixture<Docks>, label: string, value: string): Promise<void> {
    const select = byLabel<HTMLSelectElement>(f, label);
    select.value = value;
    select.dispatchEvent(new Event("change"));
    await refresh(f);
  }

  describe("with the planned stub", () => {
    beforeEach(() => {
      TestBed.overrideProvider(BACKLOG_PORT, {
        useValue: new StubBacklogAdapter(new Date("2026-10-06T10:00:00.000Z")),
      });
      stories = [
        aStory("PROJ-140", { status: "running", phase: "planning" }),
        aStory("PROJ-131", { status: "awaiting_input", phase: "planning" }),
        aStory("PROJ-123", { status: "awaiting_decision", phase: "plan_review" }),
        aStory("PROJ-118", { status: "halted", phase: "planning" }),
        aStory("PROJ-097", { status: "terminal", phase: "done" }),
        aStory("PROJ-102", { status: "terminal", phase: "blocked" }),
      ];
    });

    it("says in plain sight that the screen is planned and the backlog is not in the API", async () => {
      const f = await mount();
      expect(text(root(f).querySelector("h1"))).toBe("The Docks");
      expect(text(root(f))).toContain("Planned screen.");
      expect(text(root(f))).toContain("The backlog is not in the API yet.");
    });

    it("shows the nine stories of the wireframe in its columns", async () => {
      const f = await mount();
      const heads = [...root(f).querySelectorAll("thead th")].map((th) => text(th));
      expect(heads).toEqual([
        "Key",
        "Summary",
        "Type",
        "Jira status",
        "Priority",
        "Assignee",
        "Updated",
        "Ahoy",
        "Actions",
      ]);
      expect(rows(f)).toHaveLength(9);
      const first = rows(f)[0]!;
      expect(text(cell(first, 0))).toBe("PROJ-145");
      expect(text(cell(first, 1))).toBe("Show the VAT number on exported invoices");
      expect(text(cell(first, 2))).toBe("Story");
      expect(text(cell(first, 3))).toBe("To Do");
      expect(text(cell(first, 4))).toBe("High");
      expect(text(cell(first, 5))).toBe("Unassigned");
      expect(text(cell(first, 6))).toBe("2 h ago");
      expect(text(root(f))).toContain("Showing 9 of 9 · no bulk start: every voyage needs its own budget");
    });

    it("joins the Ahoy column with the real voyages: not started, under way, and docked", async () => {
      const f = await mount();
      expect(text(cell(rowOf(f, "PROJ-145"), 7))).toBe("Not started");
      const underWay = cell(rowOf(f, "PROJ-140"), 7);
      expect(text(underWay)).toBe("Under way planning");
      expect(underWay.querySelector("a")?.getAttribute("href")).toBe("/voyages/PROJ-140");
      expect(text(cell(rowOf(f, "PROJ-131"), 7))).toBe("Crew asks planning");
      expect(text(cell(rowOf(f, "PROJ-123"), 7))).toBe("Your orders plan_review");
      expect(text(cell(rowOf(f, "PROJ-118"), 7))).toBe("Anchored planning");
      expect(text(cell(rowOf(f, "PROJ-097"), 7))).toBe("Docked done");
    });

    it("offers Set sail with the key and the summary for a story that is not started", async () => {
      const f = await mount();
      const link = cell(rowOf(f, "PROJ-145"), 8).querySelector("a")!;
      expect(text(link)).toBe("Set sail");
      expect(link.getAttribute("href")).toBe(
        "/voyages/new?key=PROJ-145&title=Show%20the%20VAT%20number%20on%20exported%20invoices",
      );
    });

    it("offers Open voyage, not Set sail, for a story that already has a voyage", async () => {
      const f = await mount();
      const actions = cell(rowOf(f, "PROJ-123"), 8);
      expect(text(actions)).toBe("Open voyage");
      expect(actions.querySelector("a")?.getAttribute("href")).toBe("/voyages/PROJ-123");
    });

    it("never offers a bulk start", async () => {
      const f = await mount();
      expect(text(root(f)).toLowerCase()).not.toContain("start all");
      expect(text(root(f))).toContain("no bulk start");
    });

    it("counts the stories and the voyages in Ahoy", async () => {
      const f = await mount();
      expect(text(root(f))).toContain("9 stories · 6 in Ahoy");
    });

    it("follows the voyages as they change, without reading the backlog again", async () => {
      const f = await mount();
      expect(text(cell(rowOf(f, "PROJ-145"), 7))).toBe("Not started");
      TestBed.inject(StoriesStore).upsert(aStory("PROJ-145", { status: "running", phase: "planning" }));
      await refresh(f);
      expect(text(cell(rowOf(f, "PROJ-145"), 7))).toBe("Under way planning");
      expect(text(cell(rowOf(f, "PROJ-145"), 8))).toBe("Open voyage");
    });

    it("shows only the stories with no voyage under Not started", async () => {
      const f = await mount();
      pill(f, "Not started").click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-145", "PROJ-144", "PROJ-142", "PROJ-138"]);
      expect(pill(f, "Not started").getAttribute("aria-pressed")).toBe("true");
    });

    it("shows only the stories that have a voyage under In Ahoy", async () => {
      const f = await mount();
      pill(f, "In Ahoy").click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual([
        "PROJ-140",
        "PROJ-131",
        "PROJ-123",
        "PROJ-118",
        "PROJ-097",
      ]);
      pill(f, "All").click();
      await refresh(f);
      expect(rows(f)).toHaveLength(9);
    });

    it("searches by key or text", async () => {
      const f = await mount();
      await type(f, "csv");
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-144"]);
      expect(text(root(f))).toContain("1 story ·");
    });

    it("filters by Jira status and by assignee, and offers the values the backlog has", async () => {
      const f = await mount();
      const statuses = [...byLabel<HTMLSelectElement>(f, "Jira status").options].map((o) => o.text);
      expect(statuses).toEqual(["Jira status: all", "To Do", "In Progress", "Done"]);
      const assignees = [...byLabel<HTMLSelectElement>(f, "Assignee").options].map((o) => o.text);
      expect(assignees).toEqual([
        "Assignee: anyone",
        "alex@example.com",
        "jordan@example.com",
        "priya@example.com",
        "sam@example.com",
        "Unassigned",
      ]);
      await choose(f, "Jira status", "Done");
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-097"]);
      // The options do not shrink with the filter.
      expect(byLabel<HTMLSelectElement>(f, "Jira status").options).toHaveLength(4);
      await choose(f, "Jira status", "");
      await choose(f, "Assignee", "unassigned");
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-145", "PROJ-142"]);
      await choose(f, "Assignee", "sam@example.com");
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-144", "PROJ-131", "PROJ-118"]);
    });

    it("says which filter found nothing and clears every filter on request", async () => {
      const f = await mount();
      await type(f, "no such story");
      pill(f, "In Ahoy").click();
      await refresh(f);
      expect(rows(f)).toHaveLength(0);
      expect(text(root(f))).toContain("No stories match");
      const clear = [...root(f).querySelectorAll("button")].find((b) => text(b) === "Clear filters")!;
      clear.click();
      await refresh(f);
      expect(rows(f)).toHaveLength(9);
      expect(byLabel<HTMLInputElement>(f, "Search the backlog").value).toBe("");
      expect(pill(f, "All").getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("Jira links", () => {
    it("are not shown when no jiraBaseUrl is configured", async () => {
      const f = await mount(new FakeBacklog([anItem("PROJ-145")]));
      expect(text(root(f))).not.toContain("Jira ↗");
      expect(root(f).querySelector('a[title="Open in Jira"]')).toBeNull();
    });

    it("open the story in Jira in a new tab when it is configured", async () => {
      const f = await mount(new FakeBacklog([anItem("PROJ-145"), anItem("A B/C-1")]), "https://jira.example.com");
      const links = [...root(f).querySelectorAll<HTMLAnchorElement>('a[title="Open in Jira"]')];
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        "https://jira.example.com/browse/PROJ-145",
        "https://jira.example.com/browse/A%20B%2FC-1",
      ]);
      expect(links[0]!.target).toBe("_blank");
      expect(links[0]!.rel).toBe("noopener noreferrer");
      expect(text(links[0])).toBe("Jira ↗");
    });
  });

  describe("with another backlog", () => {
    it("renders whatever adapter is provided, and drops the planned banner when it is not planned", async () => {
      const f = await mount(new FakeBacklog([anItem("REAL-1", { priority: "Low" })], false));
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["REAL-1"]);
      expect(text(root(f))).not.toContain("Planned screen.");
    });

    it("asks for the first page, with the page size and the scope, and no empty filters", async () => {
      const backlog = new FakeBacklog([anItem("PROJ-1")]);
      await mount(backlog);
      expect(backlog.queries).toEqual([{ scope: "all", limit: 25 }]);
    });

    it("asks with each filter the person sets, and with the keys of the voyages for a scope", async () => {
      stories = [aStory("PROJ-2"), aStory("PROJ-1")];
      const backlog = new FakeBacklog([anItem("PROJ-1")]);
      const f = await mount(backlog);
      await type(f, " vat ");
      await choose(f, "Jira status", "Done");
      await choose(f, "Assignee", "unassigned");
      pill(f, "In Ahoy").click();
      await refresh(f);
      expect(backlog.queries.at(-1)).toEqual({
        q: "vat",
        jiraStatus: "Done",
        assignee: null,
        scope: "in_ahoy",
        ahoyKeys: ["PROJ-1", "PROJ-2"],
        limit: 25,
      });
    });

    it("loads more pages and appends them until there are no more", async () => {
      const items = ["PROJ-1", "PROJ-2", "PROJ-3", "PROJ-4", "PROJ-5"].map((k) => anItem(k));
      const backlog = new FakeBacklog(items, true, 2);
      const f = await mount(backlog);
      expect(rows(f)).toHaveLength(2);
      expect(text(root(f))).toContain("Showing 2 of 5");
      const more = (): HTMLButtonElement =>
        [...root(f).querySelectorAll("button")].find((b) => text(b) === "Load more")!;
      more().click();
      await refresh(f);
      expect(rows(f)).toHaveLength(4);
      expect(backlog.queries.at(-1)).toMatchObject({ cursor: "2" });
      more().click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(items.map((i) => i.key));
      expect(text(root(f))).toContain("Showing 5 of 5");
      expect(root(f).textContent).not.toContain("Load more");
    });

    it("shows an empty backlog as empty and not as a filter with no matches", async () => {
      const f = await mount(new FakeBacklog([]));
      expect(text(root(f))).toContain("The backlog is empty");
      expect(text(root(f))).not.toContain("Clear filters");
    });

    it("shows an error with Try again when the backlog cannot be read, and recovers", async () => {
      const backlog = new FakeBacklog([anItem("PROJ-1")]);
      backlog.next = () => Promise.resolve(fail({ kind: "network" }));
      const f = await mount(backlog);
      expect(text(root(f))).toContain("Could not read the backlog");
      expect(rows(f)).toHaveLength(0);
      [...root(f).querySelectorAll("button")].find((b) => text(b) === "Try again")!.click();
      await refresh(f);
      expect(rows(f)).toHaveLength(1);
      expect(text(root(f))).not.toContain("Could not read the backlog");
    });

    it("shows placeholder rows until the first page arrives", async () => {
      const backlog = new FakeBacklog([anItem("PROJ-1")]);
      backlog.next = () => new Promise(() => undefined);
      const f = await mount(backlog);
      expect(root(f).querySelector(".ah-skeleton-rows")).not.toBeNull();
      expect(root(f).querySelector("section")?.getAttribute("aria-busy")).toBe("true");
      expect(rows(f)).toHaveLength(0);
    });

    it("drops the answer to a query that was replaced while it was in flight", async () => {
      const backlog = new FakeBacklog([anItem("PROJ-1")]);
      let release: (value: ApiResult<BacklogPage>) => void = () => undefined;
      backlog.next = () => new Promise((resolve) => (release = resolve));
      const f = await mount(backlog);
      await type(f, "fresh");
      expect(rows(f)).toHaveLength(1);
      release(
        ok({ items: [anItem("OLD-1")], total: 1, nextCursor: null, facets: { jiraStatuses: [], assignees: [] } }),
      );
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-1"]);
    });
  });

  describe("while the voyages are not known", () => {
    it("does not claim that a story is not started, and offers no Set sail, until the voyages are read", async () => {
      storiesAnswer = () => new Promise(() => undefined);
      const f = await mount(new FakeBacklog([anItem("PROJ-145")]));
      expect(text(cell(rowOf(f, "PROJ-145"), 7))).toBe("");
      expect(root(f).querySelector("tbody ah-skeleton")).not.toBeNull();
      expect(text(cell(rowOf(f, "PROJ-145"), 8))).toBe("");
    });

    it("does not read the backlog for Not started or In Ahoy until the voyages are read", async () => {
      storiesAnswer = () => new Promise(() => undefined);
      const backlog = new FakeBacklog([anItem("PROJ-145")]);
      const f = await mount(backlog);
      expect(backlog.queries).toHaveLength(1);
      pill(f, "Not started").click();
      await refresh(f);
      expect(backlog.queries).toHaveLength(1);
      expect(rows(f)).toHaveLength(0);
      expect(root(f).querySelector(".ah-skeleton-rows")).not.toBeNull();
    });

    it("says so when the voyages cannot be read, and the scope filters wait for them", async () => {
      storiesAnswer = () => Promise.resolve(fail({ kind: "network" }));
      const f = await mount(new FakeBacklog([anItem("PROJ-145")]));
      expect(text(root(f))).toContain("Could not read the voyages in Ahoy");
      expect(text(cell(rowOf(f, "PROJ-145"), 7))).toBe("Unknown");
      expect(text(cell(rowOf(f, "PROJ-145"), 8))).toBe("");
      pill(f, "In Ahoy").click();
      await refresh(f);
      expect(text(root(f))).toContain("These filters need the voyages from Ahoy");
      storiesAnswer = null;
      stories = [aStory("PROJ-145")];
      [...root(f).querySelectorAll("button")].find((b) => text(b) === "Try again")!.click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(["PROJ-145"]);
    });
  });
});
