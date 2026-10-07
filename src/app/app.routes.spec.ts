import { TestBed } from "@angular/core/testing";
import { Router, provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { routes } from "./app.routes";

/** Every route of §5.3, with the placeholder text and the document title it must show. */
const CASES = [
  { url: "/", text: "All hands", lane: "3A", title: "All hands · Ahoy" },
  { url: "/voyages", text: "Voyages", lane: "3A", title: "Voyages · Ahoy" },
  { url: "/voyages?status=halted&q=PROJ", text: "Voyages", lane: "3A", title: "Voyages · Ahoy" },
  { url: "/docks", text: "The Docks", lane: "3C", title: "The Docks · Ahoy" },
  { url: "/voyages/PROJ-123/plan", text: "Plan", lane: "4B", title: "Plan · Ahoy" },
  { url: "/voyages/PROJ-123/questions", text: "Questions", lane: "4C", title: "Questions · Ahoy" },
  { url: "/voyages/PROJ-123/runs", text: "Runs", lane: "5A", title: "Runs · Ahoy" },
  { url: "/voyages/PROJ-123/gates", text: "Gates", lane: "5B", title: "Gates · Ahoy" },
  { url: "/voyages/PROJ-123/artifacts", text: "Artifacts", lane: "5C", title: "Artifacts · Ahoy" },
  { url: "/voyages/PROJ-123/log", text: "Ship's log", lane: "5B", title: "Ship's log · Ahoy" },
  { url: "/voyages/PROJ-123/models", text: "Models", lane: "4D", title: "Models · Ahoy" },
  { url: "/voyages/PROJ-123/runs/r-02", text: "Run detail", lane: "5A", title: "Run · Ahoy" },
  { url: "/no/such/page", text: "Not found", lane: "6A", title: "Not found · Ahoy" },
] as const;

describe("app routes", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  for (const c of CASES) {
    it(`shows the lane ${c.lane} placeholder and its title at ${c.url}`, async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(c.url);
      const root = harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector("h1")?.textContent).toBe(c.text);
      expect(root.textContent).toContain(`Not built yet · lane ${c.lane}`);
      expect(document.title).toBe(c.title);
    });
  }

  it("redirects a voyage to a tab and passes the key to the shell", async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/voyages/PROJ-123");
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe("/voyages/PROJ-123/plan");
    expect(root.textContent).toContain("Voyage PROJ-123 · not built yet · lane 4A");
    expect(root.querySelector("h1")?.textContent).toBe("Plan");
  });
});
