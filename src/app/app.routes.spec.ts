import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { Router, provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { mockBackendInterceptor, provideMockBackend } from "@core/mock/mock-backend";
import { FakeApi } from "@core/realtime/testing/fake-api";
import { FakeClock } from "@core/realtime/testing/fake-clock";
import { FakeFetch } from "@core/realtime/testing/fake-fetch";
import { provideFakes } from "@core/realtime/testing/providers";
import { settle, testServer } from "@testing/mock-backend/spec-helpers";
import { routes } from "./app.routes";

/**
 * Every route of §5.3 that is still a placeholder, with the placeholder text and the document title it must show. The
 * screens of lane 3A (`/` and `/voyages`) are real now: `app.spec.ts` and the specs of `features/harbour` and
 * `features/voyages` cover them and their titles. A lane that replaces a placeholder takes its row out of this table.
 */
const CASES = [{ url: "/no/such/page", text: "Not found", lane: "6A", title: "Not found · Ahoy" }] as const;

describe("app routes", () => {
  // The voyage shell (lane 4A) reads the story before it shows a tab: the mock backend answers it.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([mockBackendInterceptor])),
        provideMockBackend(testServer().server),
      ],
    });
  });

  async function open(url: string): Promise<{ root: HTMLElement; harness: RouterTestingHarness }> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    for (let i = 0; i < 3; i++) {
      await settle();
      await harness.fixture.whenStable();
    }
    return { root: harness.fixture.nativeElement as HTMLElement, harness };
  }

  for (const c of CASES) {
    it(`shows the lane ${c.lane} placeholder and its title at ${c.url}`, async () => {
      const { root } = await open(c.url);
      expect(root.querySelector("ah-placeholder h1")?.textContent).toBe(c.text);
      expect(root.textContent).toContain(`Not built yet · lane ${c.lane}`);
      expect(document.title).toBe(c.title);
    });
  }

  it("shows The Docks, the real screen of lane 3C, and its title at /docks", async () => {
    TestBed.configureTestingModule({
      providers: provideFakes({ api: new FakeApi(), clock: new FakeClock(), net: new FakeFetch() }),
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/docks");
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector("h1")?.textContent).toBe("The Docks");
    expect(root.textContent).toContain("Planned screen.");
    expect(root.textContent).not.toContain("Not built yet");
    expect(document.title).toBe("The Docks · Ahoy");
  });

  it("opens a voyage on its default tab and passes the key to the shell", async () => {
    const { root } = await open("/voyages/PROJ-123");
    // PROJ-123 waits on the plan decision, so it opens on Plan (§5.3).
    expect(TestBed.inject(Router).url).toBe("/voyages/PROJ-123/plan");
    expect(root.querySelector("nav[aria-label='Breadcrumb']")?.textContent).toContain("PROJ-123");
    expect(root.querySelector("ah-plan-tab")).not.toBeNull();
  });
});
