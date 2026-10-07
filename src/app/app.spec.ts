import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { NavigationEnd, Router, provideRouter, withComponentInputBinding } from "@angular/router";
import { ok } from "@core/api/api-error";
import { parseAiu } from "@domain/aiu";
import type { Story } from "@core/api/types";
import { DEFAULT_APP_CONFIG } from "@core/config/app-config";
import { aStory, anEvent } from "@core/realtime/testing/events";
import { FakeApi } from "@core/realtime/testing/fake-api";
import { FakeClock, settle } from "@core/realtime/testing/fake-clock";
import { FakeFetch, type SseBody } from "@core/realtime/testing/fake-fetch";
import { provideFakes } from "@core/realtime/testing/providers";
import { THEME_STORAGE } from "@ui/theme/theme.service";
import { ToastService } from "@ui/toast/toast";
import { App, SEARCH_DEBOUNCE_MS } from "./app";
import { routes } from "./app.routes";

const NOW = "2026-10-06T10:10:00.000Z";
/** An AIU amount in integer nano-AIU, read as text so that no float is involved (CLAUDE.md "Numbers"). */
const aiu = (text: string): number => parseAiu(text)!;

const STORIES: readonly Story[] = [
  aStory("PROJ-140", { status: "running", phase: "planning", updatedAt: "2026-10-06T10:09:00.000Z" }),
  aStory("PROJ-131", { status: "awaiting_input", phase: "planning", updatedAt: "2026-10-06T09:22:00.000Z" }),
  aStory("PROJ-123", { status: "awaiting_decision", phase: "plan_review", updatedAt: "2026-10-06T09:48:00.000Z" }),
  aStory("PROJ-118", { status: "halted", haltReason: "run_failed", updatedAt: "2026-10-06T08:00:00.000Z" }),
  aStory("PROJ-126", { status: "halted", haltReason: "stopped_by_user", updatedAt: "2026-10-06T10:01:00.000Z" }),
  aStory("PROJ-097", { status: "terminal", phase: "done", updatedAt: "2026-10-05T10:00:00.000Z" }),
].map((story) => ({ ...story, budgetNanoAiu: aiu("30"), spentNanoAiu: aiu("3") }));

const text = (node: Node | null | undefined): string => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

interface Shell {
  readonly fixture: ComponentFixture<App>;
  readonly root: HTMLElement;
  readonly router: Router;
  readonly api: FakeApi;
  readonly clock: FakeClock;
  readonly stream: SseBody;
  go(url: string): Promise<void>;
  flush(): Promise<void>;
  /** Types into the search box, then pauses long enough for the search to go. */
  type(value: string): Promise<void>;
  /** Types into the search box and does not wait. */
  typeAndGo(value: string): Promise<void>;
}

/** How the shell starts: the theme the person chose before, and a stream that never answers. */
interface ShellOptions {
  readonly storedTheme?: string | null;
  readonly hang?: boolean;
}

/** Renders the shell over fakes at `url`, with the real routes. */
async function shell(url = "/", options: ShellOptions = {}): Promise<Shell> {
  const clock = new FakeClock(NOW);
  const net = new FakeFetch();
  // The first request is the event stream: a hang leaves it connecting for the first time.
  if (options.hang === true) net.answer(() => new Promise<Response>(() => undefined));
  const stream = net.stream();
  const api = new FakeApi();
  api.on("listStories", () => Promise.resolve(ok({ items: STORIES, nextCursor: null })));
  api.on("listQuestions", () => Promise.resolve(ok([])));
  api.on("getStoryState", (key) => Promise.resolve(ok({ key, version: 1, state: {} })));
  api.on("listStoryEvents", () => Promise.resolve(ok({ items: [], lastEventId: null })));
  api.on("listStoryRuns", () => Promise.resolve(ok([])));
  const storedTheme = options.storedTheme ?? null;
  TestBed.configureTestingModule({
    providers: [
      ...provideFakes({ api, clock, net }),
      provideRouter(routes, withComponentInputBinding()),
      { provide: THEME_STORAGE, useValue: { getItem: () => storedTheme, setItem: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(App);
  const router = TestBed.inject(Router);
  const flush = async (): Promise<void> => {
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();
  };
  const go = async (to: string): Promise<void> => {
    await router.navigateByUrl(to);
    await flush();
  };
  const root = fixture.nativeElement as HTMLElement;
  const typeAndGo = async (value: string): Promise<void> => {
    const input = root.querySelector<HTMLInputElement>("input[type=search]");
    if (input === null) throw new Error("no search box");
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await flush();
  };
  const type = async (value: string): Promise<void> => {
    await typeAndGo(value);
    await clock.advance(SEARCH_DEBOUNCE_MS);
    await flush();
  };
  fixture.detectChanges();
  await go(url);
  return { fixture, root, router, api, clock, stream, go, flush, type, typeAndGo };
}

describe("App shell", () => {
  beforeEach(() => document.documentElement.removeAttribute("data-theme"));

  it("puts the top bar, the page and the toasts in that order, with the page in one main landmark", async () => {
    const { root } = await shell();
    expect(Array.from(root.children).map((child) => child.tagName.toLowerCase())).toEqual([
      "ah-top-bar",
      "main",
      "ah-toast-host",
    ]);
    expect(root.querySelector("main ah-all-hands")).not.toBeNull();
  });

  describe("top bar", () => {
    it("counts the voyages that wait on a person on All hands: Crew asks, Your orders and Anchored", async () => {
      const { root } = await shell();
      expect(text(root.querySelector(".ah-nav__item[aria-current=page]"))).toBe("All hands 4");
      expect(text(root.querySelector(".ah-count"))).toBe("4");
    });

    it("shows Live while the stream is open", async () => {
      const { root } = await shell();
      expect(text(root.querySelector(".ah-live"))).toBe("Live");
    });

    it("does not say the stream dropped while it connects for the first time", async () => {
      const { root } = await shell("/", { hang: true });
      expect(text(root.querySelector(".ah-live"))).toBe("Live");
      expect(text(root)).not.toContain("Reconnecting");
    });

    it("says it is reconnecting when the stream drops, and keeps the page on screen", async () => {
      const { root, stream, flush } = await shell();
      stream.fail();
      await flush();
      expect(text(root)).toContain("Reconnecting to live updates…");
      expect(root.querySelector(".ah-live")).toBeNull();
      expect(root.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    });

    it("shows who is signed in", async () => {
      const { root } = await shell();
      const avatar = root.querySelector(".ah-avatar");
      expect(avatar?.getAttribute("aria-label")).toBe(`Signed in as ${DEFAULT_APP_CONFIG.actor}`);
      expect(text(avatar)).toBe("DE");
    });

    it("follows the count when the stream changes a voyage", async () => {
      const { root, api, stream, clock, flush } = await shell();
      api.on("getStory", () => Promise.resolve(ok({ ...STORIES[1]!, status: "running" as const, version: 2 })));
      stream.sendEvent(anEvent(901, "question.answered", {}, "PROJ-131"));
      await settle();
      await clock.advance(300);
      await flush();
      expect(text(root.querySelector(".ah-count"))).toBe("3");
    });
  });

  describe("search", () => {
    it("goes to the voyages that match, from any page", async () => {
      const { router, type } = await shell("/");
      await type("invoice");
      expect(router.url).toBe("/voyages?q=invoice");
    });

    it("waits until the person pauses, then goes once with the text typed last", async () => {
      const { router, clock, flush, typeAndGo } = await shell("/");
      const arrivals: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) arrivals.push(event.urlAfterRedirects);
      });
      await typeAndGo("i");
      await clock.advance(SEARCH_DEBOUNCE_MS - 50);
      await typeAndGo("in");
      await clock.advance(SEARCH_DEBOUNCE_MS - 50);
      await typeAndGo("inv");
      expect(arrivals).toEqual([]);
      expect(router.url).toBe("/");
      await clock.advance(SEARCH_DEBOUNCE_MS);
      await flush();
      expect(arrivals).toEqual(["/voyages?q=inv"]);
    });

    it("does not carry the query of the page it leaves", async () => {
      const { router, type } = await shell("/voyages/new?key=PROJ-9&title=Nine");
      await type("nine");
      expect(router.url).toBe("/voyages?q=nine");
    });

    it("keeps the status of the voyages page, and drops the query when the box is cleared", async () => {
      const { router, type } = await shell("/voyages?status=halted");
      await type("search");
      expect(router.url).toBe("/voyages?status=halted&q=search");
      await type("");
      expect(router.url).toBe("/voyages?status=halted");
    });

    it("treats a box with only spaces as empty", async () => {
      const { router, type } = await shell("/voyages?q=abc");
      await type("   ");
      expect(router.url).toBe("/voyages");
    });

    it("shows the text of the current ?q= in the box, and empties it on a page that has none", async () => {
      const { root, go } = await shell("/voyages?q=receipts");
      const box = () => root.querySelector<HTMLInputElement>("input[type=search]");
      expect(box()?.value).toBe("receipts");
      await go("/");
      expect(box()?.value).toBe("");
      await go("/voyages?q=pdf");
      expect(box()?.value).toBe("pdf");
    });

    it("filters the table as the person types", async () => {
      const { root, type } = await shell("/voyages");
      expect(root.querySelectorAll("tbody tr")).toHaveLength(6);
      await type("PROJ-13");
      expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
      expect(text(root.querySelector("tbody a.ah-key"))).toBe("PROJ-131");
    });
  });

  describe("theme", () => {
    it("applies the theme the person chose before, on the first page and not only in the kit gallery", async () => {
      await shell("/", { storedTheme: "dark" });
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("is light when none was chosen", async () => {
      await shell("/");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("titles", () => {
    it("names the page in the document title", async () => {
      const { go } = await shell("/");
      expect(document.title).toBe("All hands · Ahoy");
      await go("/voyages?status=halted");
      expect(document.title).toBe("Voyages · Ahoy");
    });
  });

  describe("toasts", () => {
    it("shows a confirmation above whatever page is open", async () => {
      const { root, flush } = await shell("/voyages");
      TestBed.inject(ToastService).show("Voyage PROJ-145 set sail.");
      await flush();
      expect(text(root.querySelector("ah-toast-host .ah-toast"))).toBe("Voyage PROJ-145 set sail.");
    });
  });

  describe("relative times", () => {
    it("move on as the minutes pass, with no event and no navigation", async () => {
      const { root, clock, flush } = await shell("/voyages?q=PROJ-140");
      const updated = () => text(root.querySelector("tbody tr td:last-child"));
      expect(updated()).toBe("1 m ago");
      await clock.advance(60_000);
      await flush();
      expect(updated()).toBe("2 m ago");
    });
  });
});
