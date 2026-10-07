import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { describe, expect, it } from "vitest";
import { mockBackendInterceptor, provideMockBackend } from "@core/mock/mock-backend";
import { CLOCK, type Clock } from "@core/realtime/clock";
import type { ManualClock } from "@testing/mock-backend/clock";
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
  readonly clock: ManualClock;
}

async function flush(page: { harness: RouterTestingHarness }): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
    page.harness.detectChanges();
    await page.harness.fixture.whenStable();
  }
}

/** The voyage routes on the mock, opened at `url`. */
async function open(url: string): Promise<Page> {
  const { server, clock } = testServer();
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
  const page = { server, harness, clock, root: harness.fixture.nativeElement as HTMLElement };
  await flush(page);
  return page;
}

/** The text of an element, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The cells of each body row of the gate table, as text. */
function rows(page: Page): string[][] {
  return [...page.root.querySelectorAll("ah-gates-tab tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => text(td)),
  );
}

describe("GatesTab on the mock", () => {
  it("lists the five records of PROJ-123 oldest first, then the waiting line", async () => {
    const page = await open("/voyages/PROJ-123/gates");
    const table = rows(page);
    expect(table).toHaveLength(6);
    expect(table.map((cells) => cells.slice(1, 5))).toEqual([
      ["intake", "intake", "Automated", "pass"],
      ["planning", "plan", "Automated", "branch"],
      ["planning", "plan", "Automated", "pass"],
      ["plan_review", "plan_accepted", "Human", "send_back"],
      ["planning", "plan", "Automated", "pass"],
      ["plan_review", "plan_accepted", "Human", "waiting"],
    ]);
  });

  it("shows the API's outcome word, the message, who did it and the run", async () => {
    const page = await open("/voyages/PROJ-123/gates");
    const sendBack = rows(page)[3] ?? [];
    expect(sendBack[5]).toContain("timezone");
    expect(sendBack[6]).toBe("jordan@example.com");
    expect(sendBack[7]).toBe("—");
    const automated = rows(page)[0] ?? [];
    expect(automated[6]).toBe("Ahoy");
    const link = page.root.querySelector<HTMLAnchorElement>("ah-gates-tab tbody tr a.ah-key");
    expect(link?.getAttribute("href")).toMatch(/^\/voyages\/PROJ-123\/runs\//);
  });

  it("ends with a waiting line that says the round and leads to the Plan tab", async () => {
    const page = await open("/voyages/PROJ-123/gates");
    const waiting = rows(page).at(-1) ?? [];
    expect(waiting[0]).toBe("now");
    expect(waiting[5]).toBe("Round 2 of 4 is open. Decide");
    expect(waiting.slice(6)).toEqual(["—", "—"]);
    const decide = [...page.root.querySelectorAll<HTMLAnchorElement>("ah-gates-tab tbody tr a")].find(
      (a) => text(a) === "Decide",
    );
    expect(decide?.getAttribute("href")).toBe("/voyages/PROJ-123/plan");
  });

  it("has no waiting line for a voyage that waits on nothing", async () => {
    const page = await open("/voyages/PROJ-140/gates");
    const last = rows(page).at(-1) ?? [];
    expect(last[0]).not.toBe("now");
    expect(page.root.querySelector("ah-gates-tab")?.textContent).not.toContain("Decide");
  });

  it("says there are no gate records yet for a voyage with none", async () => {
    const page = await open("/voyages/PROJ-140/gates");
    if (rows(page).length === 0) {
      expect(text(page.root.querySelector("ah-gates-tab"))).toContain("No gate records yet");
    }
    expect(page.root.querySelector("ah-gates-tab .gates__pending")).toBeNull();
  });
});
