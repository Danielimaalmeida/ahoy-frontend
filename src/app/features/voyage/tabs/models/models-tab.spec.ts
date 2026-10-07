import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { Title } from "@angular/platform-browser";
import { Router, provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { mockBackendInterceptor, provideMockBackend } from "@core/mock/mock-backend";
import { CLOCK, type Clock } from "@core/realtime/clock";
import type { ManualClock } from "@testing/mock-backend/clock";
import type { MockRequest } from "@testing/mock-backend/http";
import type { MockAhoyServer } from "@testing/mock-backend/server";
import { settle, testServer } from "@testing/mock-backend/spec-helpers";
import { CLOCK as UI_CLOCK } from "@ui/pipes/clock";
import { VOYAGE_ROUTES } from "../../voyage.routes";

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return { now: () => new Date(manual.now()), schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }) };
}

interface Page {
  readonly server: MockAhoyServer;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  /** Every request the mock answered, in order. */
  readonly requests: MockRequest[];
}

/** The voyage routes on the mock, opened at `url`. */
async function open(url: string, before?: (request: MockRequest, server: MockAhoyServer) => void): Promise<Page> {
  const { server, clock } = testServer();
  const requests: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request) => {
    requests.push(request);
    before?.(request, server);
    return handle(request);
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: "voyages/:key", children: VOYAGE_ROUTES }], withComponentInputBinding()),
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(server),
      { provide: CLOCK, useValue: asClock(clock) },
      { provide: UI_CLOCK, useValue: () => new Date(clock.now()) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const page = { server, harness, root: harness.fixture.nativeElement as HTMLElement, requests };
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

/** The text of an element as a reader sees it: whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function row(page: Page, slot: string): HTMLElement {
  const found = page.root.querySelector<HTMLElement>(`tr[data-slot="${slot}"]`);
  if (found === null) throw new Error(`no row ${slot}`);
  return found;
}

/** The open dialog (the CDK puts it in an overlay under `body`). */
function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".cdk-overlay-container .ah-dialog");
  if (element === null) throw new Error("no dialog open");
  return element;
}

function hasDialog(): boolean {
  return document.querySelector(".cdk-overlay-container .ah-dialog") !== null;
}

function buttonNamed(container: Element, label: string | RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? text(b) === label : label.test(text(b)),
  );
  if (found === undefined) throw new Error(`no button ${String(label)}`);
  return found;
}

function type(field: Element | null, value: string): void {
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) throw new Error("no field");
  field.value = value;
  field.dispatchEvent(new Event("input"));
}

function choose(field: Element | null, value: string): void {
  if (!(field instanceof HTMLSelectElement)) throw new Error("no select");
  field.value = value;
  field.dispatchEvent(new Event("change"));
}

function modelInput(label: string): HTMLInputElement {
  const found = dialog().querySelector<HTMLInputElement>(`input[aria-label="${label} model"]`);
  if (found === null) throw new Error(`no ${label} model input`);
  return found;
}

function effortSelect(label: string): HTMLSelectElement {
  const found = dialog().querySelector<HTMLSelectElement>(`select[aria-label="${label} effort"]`);
  if (found === null) throw new Error(`no ${label} effort select`);
  return found;
}

/** The commands (POSTs) the mock received. */
function commands(page: Page): MockRequest[] {
  return page.requests.filter((request) => request.method === "POST");
}

afterEach(() => {
  document.querySelector(".cdk-overlay-container")?.replaceChildren();
});

describe("ModelsTab on the mock backend", () => {
  it("shows Models per phase for PROJ-118: five rows with their crew and the sources of each value", async () => {
    const page = await open("/voyages/PROJ-118/models");
    const rows = [...page.root.querySelectorAll("tbody tr")];
    expect(rows.map((r) => r.getAttribute("data-slot"))).toEqual([
      "intake",
      "planning",
      "implementation",
      "review-design",
      "review-defect",
    ]);
    expect(text(row(page, "planning").children[1])).toBe("Cartographer");
    expect(text(row(page, "planning").children[2])).toMatch(/^\S+ · \S+$/);
    expect(text(page.root.querySelector("ah-panel-head"))).toContain("Models per phase");
    expect(text(page.root.querySelector("ah-panel-foot"))).toContain("The two Lookouts must use different models.");
    // Nothing is chosen on this voyage: no Change or Reset on the rows.
    expect(page.root.querySelectorAll("tbody button")).toHaveLength(0);
  });

  it("titles the page Models · Ahoy", async () => {
    await open("/voyages/PROJ-118/models");
    expect(TestBed.inject(Title).getTitle()).toBe("Models · Ahoy");
  });

  it("marks the slot whose last run failed on the model it still has: refused last run", async () => {
    const page = await open("/voyages/PROJ-118/models");
    const refused = [...page.root.querySelectorAll("tbody tr")]
      .filter((r) => text(r).includes("refused last run"))
      .map((r) => r.getAttribute("data-slot"));
    expect(refused).toEqual(["implementation"]);
  });

  it("marks nothing on a voyage that is not anchored by a failed run", async () => {
    const page = await open("/voyages/PROJ-123/models");
    expect(text(page.root.querySelector("tbody"))).not.toContain("refused last run");
  });

  describe("Change models", () => {
    it("sends only the slot that changed, with its model and effort, and shows it as chosen", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      expect(hasDialog()).toBe(true);

      type(modelInput("Planning"), "claude-sonnet-5");
      choose(effortSelect("Planning"), "high");
      type(dialog().querySelector("textarea"), "gpt-5.6-terra isn't enabled for this account");
      await flush(page);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);

      const [sent] = commands(page);
      expect(commands(page)).toHaveLength(1);
      expect(sent?.path).toBe("/stories/PROJ-118/models");
      expect(sent?.body).toMatchObject({
        models: { planning: { model: "claude-sonnet-5", reasoningEffort: "high" } },
        reason: "gpt-5.6-terra isn't enabled for this account",
      });
      expect(Object.keys((sent?.body as { models: object }).models)).toEqual(["planning"]);
      expect(typeof (sent?.body as { expectedVersion: unknown }).expectedVersion).toBe("number");
      expect(hasDialog()).toBe(false);
      expect(text(row(page, "planning").children[5])).toBe("claude-sonnet-5 · high");
      expect(text(row(page, "planning").children[2])).toContain("claude-sonnet-5 · high");
      expect(text(row(page, "planning").children[3])).toBe("Chosen for this voyage");
    });

    it("sends only {model} for a model chosen without an effort, and no reason when there is none", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      type(modelInput("Intake"), "claude-sonnet-5");
      await flush(page);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);
      expect((commands(page)[0]?.body as Record<string, unknown>)["models"]).toEqual({
        intake: { model: "claude-sonnet-5" },
      });
      expect(commands(page)[0]?.body).not.toHaveProperty("reason");
    });

    it("cannot be saved with nothing changed: no request", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      expect(buttonNamed(dialog(), "Save models").disabled).toBe(true);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);
      expect(commands(page)).toHaveLength(0);
      expect(hasDialog()).toBe(true);
    });

    it("refuses two Lookouts on the same model on both rows, and sends nothing", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      // The defect reviewer's current model is the effective one of the untouched row.
      const defectModel =
        [...dialog().querySelectorAll<HTMLInputElement>("input.ah-input--mono")][4]?.placeholder ?? "";
      const model = defectModel.replace(/^Default: /, "");
      expect(model).not.toBe("");
      type(modelInput("Design reviewer"), model);
      await flush(page);

      const errors = [...dialog().querySelectorAll(".ah-field__error")].map((e) => text(e));
      expect(errors).toEqual([
        `The two Lookouts must use different models: both would run on ${model}.`,
        `The two Lookouts must use different models: both would run on ${model}.`,
      ]);
      expect(buttonNamed(dialog(), "Save models").disabled).toBe(true);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);
      expect(commands(page)).toHaveLength(0);
    });

    it("keeps what was typed when the voyage changed meanwhile, and sends again with the new version", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      type(modelInput("Planning"), "claude-sonnet-5");
      choose(effortSelect("Planning"), "high");
      type(dialog().querySelector("textarea"), "Not enabled for us");
      await flush(page);
      page.server.switches.conflictNext = "stale_version";
      buttonNamed(dialog(), "Save models").click();
      await flush(page);

      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector(".ah-banner"))).toContain("This voyage changed since you opened it");
      expect(modelInput("Planning").value).toBe("claude-sonnet-5");
      expect(effortSelect("Planning").value).toBe("high");
      expect(dialog().querySelector("textarea")?.value).toBe("Not enabled for us");

      buttonNamed(dialog(), "Save models").click();
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
    });

    it("puts the server's 400 about the reviewers on both Lookout rows when the client could not tell", async () => {
      const page = await open("/voyages/PROJ-118/models");
      // First choose a model for the design reviewer, so that its default is no longer known to the form.
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      type(modelInput("Design reviewer"), "claude-opus-5");
      await flush(page);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);

      buttonNamed(page.root, "Change models").click();
      await flush(page);
      // Design goes back to its default (unknown here), the defect reviewer takes the model that default really is.
      type(modelInput("Design reviewer"), "");
      type(modelInput("Defect reviewer"), "claude-sonnet-5");
      await flush(page);
      expect([...dialog().querySelectorAll(".ah-field__error")]).toHaveLength(0);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);

      expect(hasDialog()).toBe(true);
      const errors = [...dialog().querySelectorAll(".ah-field__error")].map((e) => text(e));
      expect(errors).toEqual([
        "review-design and review-defect must run on different models",
        "review-design and review-defect must run on different models",
      ]);
      expect(text(dialog().querySelector(".ah-banner"))).toContain("Check the highlighted fields");
      expect(modelInput("Defect reviewer").value).toBe("claude-sonnet-5");
    });

    it("does not send twice on a double click", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      type(modelInput("Planning"), "claude-sonnet-5");
      await flush(page);
      const save = buttonNamed(dialog(), "Save models");
      save.click();
      save.click();
      await flush(page);
      expect(commands(page)).toHaveLength(1);
    });
  });

  it("says it could not read the models, and tries again", async () => {
    let failed = false;
    const page = await open("/voyages/PROJ-118/models", (request, server) => {
      // Only the first read of the model plan fails.
      if (!failed && request.method === "GET" && request.path === "/stories/PROJ-118/models") {
        failed = true;
        server.switches.failNext = 500;
      }
    });
    expect(text(page.root.querySelector("ah-panel-body ah-banner"))).toContain("Try again");
    expect(page.root.querySelector("table")).toBeNull();
    buttonNamed(page.root, "Try again").click();
    await flush(page);
    expect(page.root.querySelector("table")).not.toBeNull();
  });

  describe("Reset", () => {
    it("sends {planning: null} and takes the slot back to its default", async () => {
      const page = await open("/voyages/PROJ-118/models");
      buttonNamed(page.root, "Change models").click();
      await flush(page);
      type(modelInput("Planning"), "claude-sonnet-5");
      choose(effortSelect("Planning"), "high");
      await flush(page);
      buttonNamed(dialog(), "Save models").click();
      await flush(page);
      expect(page.root.querySelectorAll("tbody button")).toHaveLength(2);

      buttonNamed(row(page, "planning"), "Reset").click();
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect((commands(page)[1]?.body as Record<string, unknown>)["models"]).toEqual({ planning: null });
      expect(text(row(page, "planning").children[5])).toBe("—");
      expect(page.root.querySelectorAll("tbody button")).toHaveLength(0);
    });
  });

  describe("?change=<slot>", () => {
    it("opens the dialog on its own, with the focus on that slot, and drops the link", async () => {
      await open("/voyages/PROJ-118/models?change=planning");
      expect(hasDialog()).toBe(true);
      expect(document.activeElement).toBe(modelInput("Planning"));
      expect(TestBed.inject(Router).url).toBe("/voyages/PROJ-118/models");
    });

    it("opens once: closing it does not bring it back", async () => {
      const page = await open("/voyages/PROJ-118/models?change=review-design");
      expect(document.activeElement).toBe(modelInput("Design reviewer"));
      buttonNamed(dialog(), "Cancel").click();
      await flush(page);
      expect(hasDialog()).toBe(false);
      await flush(page);
      expect(hasDialog()).toBe(false);
    });

    it("ignores anything that is not a slot", async () => {
      const page = await open("/voyages/PROJ-118/models?change=%3Cscript%3E");
      expect(hasDialog()).toBe(false);
      expect(page.root.querySelector("table")).not.toBeNull();
    });
  });
});
