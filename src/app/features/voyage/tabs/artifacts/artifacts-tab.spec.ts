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
import { runIdFor } from "@testing/mock-backend/simulator";
import { settle, testServer } from "@testing/mock-backend/spec-helpers";
import { artifactFile, type ArtifactFile } from "@testing/mock-backend/voyage";
import { CLOCK as UI_CLOCK } from "@ui/pipes/clock";
import { VOYAGE_ROUTES } from "../../voyage.routes";

@Component({ selector: "ah-test-voyages", template: `<p>Voyages list</p>` })
class VoyagesStub {}

/** Markdown an agent could have written: a script and a remote image must not run or load. */
const HOSTILE = `# Plan

<script>alert("x")</script>

![remote](https://evil.example/x.png)
`;

/** PROJ-123's four runs, as the mock names them: the wireframe's r-01 to r-04. */
const R1 = runIdFor("PROJ-123", "intake", 1);
const R2 = runIdFor("PROJ-123", "planning", 1);
const R3 = runIdFor("PROJ-123", "planning", 2);
const R4 = runIdFor("PROJ-123", "planning", 3);
const CURRENT = `Revision 5 · current (${R4})`;

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return { now: () => new Date(manual.now()), schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }) };
}

interface Page {
  readonly server: MockAhoyServer;
  readonly clock: ManualClock;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  /** Every request the mock answered, in order. */
  readonly requests: MockRequest[];
}

interface OpenOptions {
  /** Runs on the fresh server before anything is read (a spec uses it to rewrite the seed). */
  readonly setup?: (server: MockAhoyServer) => void;
  /** Rewrites an answer on its way to the page. */
  readonly rewrite?: (request: MockRequest, response: MockResponse) => MockResponse;
}

/** The voyage routes on the mock, opened at `url`. */
async function open(url: string, options: OpenOptions = {}): Promise<Page> {
  const { server, clock } = testServer();
  options.setup?.(server);
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
          { path: "voyages/:key", children: VOYAGE_ROUTES },
          { path: "voyages", component: VoyagesStub },
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

/** Lets requests, signals and navigations settle. */
async function flush(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
    await page.harness.fixture.whenStable();
  }
}

/** Moves the mock's clock, then lets the stream, the refetches (300 ms apart) and the view settle. */
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
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;)”])/g, "$1")
    .trim();
}

/** The tab. */
function tab(page: Page): HTMLElement {
  const element = page.root.querySelector<HTMLElement>("ah-artifacts-tab");
  if (element === null) throw new Error("no artifacts tab");
  return element;
}

/** The row of one file in the list. */
function row(page: Page, path: string): HTMLElement {
  const found = [...tab(page).querySelectorAll<HTMLElement>(".artifacts__file")].find(
    (element) => element.querySelector(".artifacts__path")?.textContent?.trim() === path,
  );
  if (found === undefined) throw new Error(`no row for ${path}`);
  return found;
}

/** Whether the list has a row for one file. */
function hasRow(page: Page, path: string): boolean {
  return [...tab(page).querySelectorAll<HTMLElement>(".artifacts__file")].some(
    (element) => element.querySelector(".artifacts__path")?.textContent?.trim() === path,
  );
}

/** The state the list shows for one file ("same", "+9 −3", "new"…). */
function status(page: Page, path: string): string {
  return text(row(page, path).querySelector(".artifacts__status"));
}

/** The options of one of the two revision selects, as a reader sees them. */
function options(page: Page, id: "artifacts-base" | "artifacts-target"): string[] {
  const select = tab(page).querySelector<HTMLSelectElement>(`#${id}`);
  if (select === null) throw new Error(`no select #${id}`);
  return [...select.options].map((option) => option.textContent?.trim() ?? "");
}

/** The label of the option a select has selected, as a reader sees it. */
function selected(page: Page, id: "artifacts-base" | "artifacts-target"): string {
  const select = tab(page).querySelector<HTMLSelectElement>(`#${id}`);
  if (select === null) throw new Error(`no select #${id}`);
  return select.options[select.selectedIndex]?.textContent?.trim() ?? "";
}

/** Picks a revision in a select, as a person would (`[ngValue]` keeps the number in the control). */
async function pick(page: Page, id: "artifacts-base" | "artifacts-target", revision: number): Promise<void> {
  const select = tab(page).querySelector<HTMLSelectElement>(`#${id}`);
  if (select === null) throw new Error(`no select #${id}`);
  const wanted = new RegExp(`^Revision ${revision}( |$)`);
  const index = [...select.options].findIndex((option) => wanted.test(option.textContent?.trim() ?? ""));
  if (index < 0) throw new Error(`no option for revision ${revision}`);
  select.selectedIndex = index;
  select.dispatchEvent(new Event("change"));
  await flush(page);
}

/** The requests for a file's content. */
function contentRequests(page: Page): MockRequest[] {
  return page.requests.filter((request) => request.path.endsWith("/artifacts/content"));
}

/** The files of one revision of a seeded voyage, replaced as a spec needs (the mock is not touched). */
function putFile(
  server: MockAhoyServer,
  key: string,
  revisionNumber: number,
  path: string,
  content: string,
  mediaType?: string,
): void {
  const voyage = server.state.voyages.get(key);
  const revision = voyage?.revisions[revisionNumber - 1];
  if (revision === undefined) throw new Error(`${key} has no revision ${revisionNumber}`);
  const existing = revision.files.find((file) => file.path === path);
  const made = artifactFile(path, content, existing?.runId ?? null);
  const file: ArtifactFile = mediaType === undefined ? made : { ...made, mediaType };
  const files =
    existing === undefined ? [...revision.files, file] : revision.files.map((f) => (f.path === path ? file : f));
  Object.defineProperty(revision, "files", { value: files });
}

/** Adds a revision 6 to PROJ-123 that drops `path`, and tells the app about it. */
async function dropInRevisionSix(page: Page, path: string): Promise<void> {
  const voyage = page.server.state.voyages.get("PROJ-123");
  const fifth = voyage?.revisions[4];
  if (voyage === undefined || fifth === undefined) throw new Error("PROJ-123 has a fifth revision");
  const sixth = {
    number: 6,
    createdAt: new Date(page.clock.now()).toISOString(),
    files: fifth.files.filter((file) => file.path !== path),
  };
  Object.defineProperty(voyage, "revisions", { value: [...voyage.revisions, sixth] });
  page.server.state.append(voyage, "artifacts.updated", "alex@example.com", { revision: 6 });
  await advance(page, 600);
}

describe("Artifacts tab on the mock", () => {
  it("shows PROJ-123's revision 5 against 4 as the Records board does: six files, their states and four hunks", async () => {
    const page = await open("/voyages/PROJ-123/artifacts");

    expect(text(tab(page).querySelector("ah-panel-head"))).toContain(
      "Every change makes a new revision of the whole set.",
    );
    expect(selected(page, "artifacts-base")).toBe("Revision 4 (send-back)");
    expect(selected(page, "artifacts-target")).toBe(CURRENT);

    expect(status(page, "jira-snapshot.md")).toBe("same");
    expect(status(page, "implementation-plan.md")).toBe("+9 −3");
    expect(status(page, "plan-sources.md")).toBe("+2");
    expect(status(page, "plan-round-1.md")).toBe("new");
    expect(status(page, "questions.json")).toBe("same");
    expect(status(page, "state.json")).toBe("changed");
    expect(text(row(page, "implementation-plan.md").querySelector(".artifacts__meta"))).toMatch(/^Markdown · /);

    // The open file is the plan; its diff has one hunk per section, named as in the wireframe.
    expect(text(tab(page).querySelector(".artifacts__detail-head .ah-mono"))).toBe("implementation-plan.md");
    const diff = tab(page).querySelector("ah-artifact-diff");
    const hunks = [...tab(page).querySelectorAll(".ah-diff__hunk")].map((hunk) => text(hunk));
    expect(hunks).toEqual([
      "@@ Summary @@",
      "@@ Acceptance criteria @@",
      "@@ WP1 Due date in the invoice API @@",
      "@@ WP2 Billing page and invoice list @@",
    ]);
    expect(text(diff)).toContain("+ - AC4 Due dates and overdue checks use the customer's timezone.");
    expect(text(diff)).toContain("− - Add `dueDate` to the invoice response.");
    expect(text(diff)).toContain('+ - An "Overdue" badge and sort order for overdue invoices.');
  });

  it("labels each revision with what made it: its run, or the send-back", async () => {
    const page = await open("/voyages/PROJ-123/artifacts");
    expect(options(page, "artifacts-target")).toEqual([
      CURRENT,
      "Revision 4 (send-back)",
      `Revision 3 (${R3})`,
      `Revision 2 (${R2})`,
      `Revision 1 (${R1})`,
    ]);
    expect(options(page, "artifacts-base")).toEqual(options(page, "artifacts-target").slice(1));
  });

  it("compares revision 3 with 5, the wireframe's pick, with the same states", async () => {
    const page = await open("/voyages/PROJ-123/artifacts?compare=3");
    expect(selected(page, "artifacts-base")).toBe(`Revision 3 (${R3})`);
    expect(
      [
        "jira-snapshot.md",
        "implementation-plan.md",
        "plan-sources.md",
        "plan-round-1.md",
        "questions.json",
        "state.json",
      ].map((path) => status(page, path)),
    ).toEqual(["same", "+9 −3", "+2", "new", "same", "changed"]);
  });

  it("marks a file new against an earlier revision and shows it all added", async () => {
    const page = await open("/voyages/PROJ-123/artifacts?compare=3&file=plan-round-1.md");

    expect(status(page, "plan-round-1.md")).toBe("new");
    expect(text(tab(page).querySelector(".artifacts__note"))).toBe("New file: it was not in revision 3.");
    const diff = tab(page).querySelector("ah-artifact-diff");
    expect(diff?.querySelectorAll(".ah-diff__del")).toHaveLength(0);
    expect((diff?.querySelectorAll(".ah-diff__add").length ?? 0) > 0).toBe(true);
  });

  it("keeps a file it has seen after a new revision drops it, and shows it as removed", async () => {
    const page = await open("/voyages/PROJ-123/artifacts");
    expect(status(page, "plan-round-1.md")).toBe("new");

    await dropInRevisionSix(page, "plan-round-1.md");

    // Revision 6 is current now; the file that was in 5 is not in it and stays listed, as removed.
    expect(options(page, "artifacts-target")[0]).toBe("Revision 6 · current");
    expect(status(page, "plan-round-1.md")).toBe("removed");
    expect(status(page, "implementation-plan.md")).toBe("same");

    await page.harness.navigateByUrl("/voyages/PROJ-123/artifacts?file=plan-round-1.md");
    await flush(page);
    expect(text(tab(page).querySelector(".artifacts__note"))).toContain("Removed file: it is not in revision 6.");
  });

  it("registers the listing in View too, so a file dropped later stays listed and compares as removed", async () => {
    // The tab opens in View, where no comparison (and so no seed) runs: the listing itself must teach the reader its paths.
    const page = await open("/voyages/PROJ-123/artifacts?mode=view&file=implementation-plan.md");
    expect(hasRow(page, "plan-round-1.md")).toBe(true);

    await dropInRevisionSix(page, "plan-round-1.md");

    expect(hasRow(page, "plan-round-1.md")).toBe(true);
    await page.harness.navigateByUrl("/voyages/PROJ-123/artifacts?compare=5&file=plan-round-1.md");
    await flush(page);
    expect(status(page, "plan-round-1.md")).toBe("removed");
  });

  it("keeps the reader when the tab is left and opened again (it is a route provider)", async () => {
    const page = await open("/voyages/PROJ-123/artifacts");
    const first = contentRequests(page).length;
    expect(first).toBeGreaterThan(0);

    // Gates reads no artifact content, so every request after this point is the Artifacts tab's.
    await page.harness.navigateByUrl("/voyages/PROJ-123/gates");
    await flush(page);
    await page.harness.navigateByUrl("/voyages/PROJ-123/artifacts");
    await flush(page);

    // The tab is recreated, but the route-level reader is not: the comparison is served from its cache, with no request.
    expect(contentRequests(page)).toHaveLength(first);
  });

  it("asks for the same comparison only once: leaving it and coming back makes no request", async () => {
    const page = await open("/voyages/PROJ-123/artifacts");
    const first = contentRequests(page).length;
    expect(first).toBeGreaterThan(0);

    expect(status(page, "state.json")).toBe("changed");
    await pick(page, "artifacts-base", 2);
    const second = contentRequests(page).length;
    expect(second).toBeGreaterThan(first);
    // The probe of the older revision went out with the current revision's ETag (If-None-Match).
    expect(
      contentRequests(page).some(
        (request) => request.query.get("revision") === "2" && request.headers["if-none-match"] !== undefined,
      ),
    ).toBe(true);
    expect(status(page, "state.json")).toBe("new");

    await pick(page, "artifacts-base", 4);
    expect(contentRequests(page)).toHaveLength(second);
    expect(status(page, "state.json")).toBe("changed");
  });

  it("calls a JSON artifact changed, and re-indents it in the viewer", async () => {
    const page = await open("/voyages/PROJ-123/artifacts?file=state.json");

    expect(status(page, "state.json")).toBe("changed");
    expect(text(row(page, "state.json").querySelector(".artifacts__meta"))).toMatch(/^JSON · /);

    await page.harness.navigateByUrl("/voyages/PROJ-123/artifacts?mode=view&file=state.json");
    await flush(page);
    expect(page.root.querySelector("#artifacts-base")).toBeNull();
    expect(page.root.querySelector(".artifacts__pre")?.textContent).toBe(
      '{\n  "storyKey": "PROJ-123",\n  "phase": "plan_review",\n  "planRevision": 2,\n  "revisionRounds": {\n    "plan_accepted": 1\n  }\n}',
    );
  });

  it("treats a file the listing types as JSON as JSON everywhere, whatever its name", async () => {
    const setup = (server: MockAhoyServer): void => {
      putFile(server, "PROJ-123", 4, "verdict", '{"gate":"plan","result":"fail"}', "application/json");
      putFile(server, "PROJ-123", 5, "verdict", '{"gate":"plan","result":"pass"}', "application/json");
    };
    const page = await open("/voyages/PROJ-123/artifacts?file=verdict", { setup });

    expect(status(page, "verdict")).toBe("changed");
    expect(text(tab(page).querySelector(".artifacts__detail-head .ah-tag"))).toBe("JSON");
    const diff = tab(page).querySelector("ah-artifact-diff");
    expect(text(diff)).toContain('− "result": "fail"');
    expect(text(diff)).toContain('+ "result": "pass"');
  });

  it("shows the file in View, and says when it is not in that revision", async () => {
    const page = await open("/voyages/PROJ-123/artifacts?mode=view&file=jira-snapshot.md");
    const doc = tab(page).querySelector("ah-markdown");
    expect(text(doc)).toContain("Example ticket for the Ahoy mock backend");
    expect(selected(page, "artifacts-target")).toBe(CURRENT);

    await page.harness.navigateByUrl("/voyages/PROJ-123/artifacts?mode=view&file=plan-round-1.md&to=1");
    await flush(page);
    expect(text(tab(page).querySelector(".artifacts__note"))).toBe("This file was not in revision 1.");
  });

  it("renders agent markdown as text: a script does not run and a remote image does not load", async () => {
    const page = await open("/voyages/PROJ-123/artifacts?mode=view&file=implementation-plan.md", {
      setup: (server) => putFile(server, "PROJ-123", 5, "implementation-plan.md", HOSTILE),
    });

    const doc = tab(page).querySelector("ah-markdown");
    expect(doc).not.toBeNull();
    expect(doc?.querySelector("script")).toBeNull();
    expect(doc?.querySelector("img")).toBeNull();
    expect(text(doc)).toContain('<script>alert("x")</script>');
    expect(text(doc)).toContain("[image: remote]");
  });

  it("ignores query parameters that do not fit", async () => {
    const page = await open("/voyages/PROJ-123/artifacts?to=99&compare=99&file=../etc/passwd");
    expect(selected(page, "artifacts-target")).toBe(CURRENT);
    expect(selected(page, "artifacts-base")).toBe("Revision 4 (send-back)");
    expect(text(tab(page).querySelector(".artifacts__detail-head .ah-mono"))).toBe("implementation-plan.md");
  });

  it("has no artifacts on a voyage that has none", async () => {
    const page = await open("/voyages/PROJ-109/artifacts");
    expect(text(tab(page).querySelector("ah-empty-state"))).toContain("No artifacts yet");
  });

  it("shows 'Lost contact with the harbour' when the list cannot be read, and Try again reads it", async () => {
    let fails = 1;
    const page = await open("/voyages/PROJ-123/artifacts", {
      rewrite: (request, response) => {
        if (fails > 0 && request.method === "GET" && request.path.endsWith("/artifacts")) {
          fails -= 1;
          return { kind: "text", status: 503, headers: {}, body: "down" };
        }
        return response;
      },
    });
    const banner = tab(page).querySelector("ah-banner");
    expect(text(banner)).toContain("Lost contact with the harbour");
    expect(text(banner)).toContain("Try again");

    banner?.querySelector("button")?.click();
    await flush(page);
    expect(status(page, "implementation-plan.md")).toBe("+9 −3");
  });

  it("shows a file that could not be read as an error, and Try again reads it", async () => {
    let failJira = true;
    const page = await open("/voyages/PROJ-123/artifacts?mode=view&file=jira-snapshot.md", {
      rewrite: (request, response) => {
        if (
          failJira &&
          request.path.endsWith("/artifacts/content") &&
          request.query.get("path") === "jira-snapshot.md"
        ) {
          return { kind: "text", status: 503, headers: {}, body: "down" };
        }
        return response;
      },
    });
    const banner = tab(page).querySelector("ah-banner");
    expect(text(banner)).toContain("Lost contact with the harbour");
    expect(tab(page).querySelector("ah-markdown")).toBeNull();

    failJira = false;
    banner?.querySelector("button")?.click();
    await flush(page);
    expect(text(tab(page).querySelector("ah-markdown"))).toContain("Example ticket for the Ahoy mock backend");
  });
});
