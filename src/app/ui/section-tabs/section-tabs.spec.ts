import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import type { SectionTab, SectionTabsVariant } from "./section-tabs";
import { SectionTabs } from "./section-tabs";

@Component({ template: `` })
class Page {}

const VOYAGE_TABS: readonly SectionTab[] = [
  { id: "plan", label: "Plan", link: "/voyages/PROJ-123/plan" },
  { id: "questions", label: "Questions", link: "/voyages/PROJ-123/questions", count: 2 },
  { id: "runs", label: "Runs", link: "/voyages/PROJ-123/runs", count: 4 },
  { id: "gates", label: "Gates", link: "/voyages/PROJ-123/gates", count: 0 },
  { id: "artifacts", label: "Artifacts", link: "/voyages/PROJ-123/artifacts", count: null },
  { id: "log", label: "Ship's log", link: "/voyages/PROJ-123/log" },
  { id: "models", label: "Models", link: "/voyages/PROJ-123/models", exact: true },
];

@Component({
  imports: [SectionTabs],
  template: `<ah-section-tabs [items]="items()" [label]="label()" [variant]="variant()" [(selected)]="selected" />`,
})
class Host {
  readonly items = signal<readonly SectionTab[]>(VOYAGE_TABS);
  readonly label = signal("Voyage sections");
  readonly variant = signal<SectionTabsVariant>("tabs");
  readonly selected = signal<string | null>(null);
}

async function render(url = "/voyages/PROJ-123/plan") {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: "**", component: Page }])] });
  const fixture = TestBed.createComponent(Host);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const items = () => Array.from(root.querySelectorAll<HTMLElement>(".ah-tabs__item"));
  const current = () =>
    items()
      .filter((i) => i.getAttribute("aria-current") === "page")
      .map((i) => i.textContent!.trim());
  async function go(to: string) {
    await router.navigateByUrl(to);
    fixture.detectChanges();
    await fixture.whenStable();
  }
  return { fixture, root, items, current, go };
}

describe("ah-section-tabs, route tabs", () => {
  it("is a labelled nav with one link per tab, each with its own URL", async () => {
    const { root, items } = await render();
    const nav = root.querySelector("nav.ah-tabs")!;
    expect(nav.getAttribute("aria-label")).toBe("Voyage sections");
    expect(nav.classList.contains("ah-tabs--pill")).toBe(false);
    expect(items().map((i) => i.tagName)).toEqual(Array(7).fill("A"));
    expect(items().map((i) => i.getAttribute("href"))).toEqual([
      "/voyages/PROJ-123/plan",
      "/voyages/PROJ-123/questions",
      "/voyages/PROJ-123/runs",
      "/voyages/PROJ-123/gates",
      "/voyages/PROJ-123/artifacts",
      "/voyages/PROJ-123/log",
      "/voyages/PROJ-123/models",
    ]);
  });

  it("marks only the tab of the current URL with aria-current=page, and follows navigation", async () => {
    const { current, go } = await render("/voyages/PROJ-123/plan");
    expect(current()).toEqual(["Plan"]);
    await go("/voyages/PROJ-123/questions");
    expect(current()).toEqual(["Questions 2"]);
    await go("/voyages/PROJ-123/log");
    expect(current()).toEqual(["Ship's log"]);
    await go("/");
    expect(current()).toEqual([]);
  });

  it("keeps a tab current on the pages below it, unless it is exact", async () => {
    const { current, go } = await render("/voyages/PROJ-123/runs/r-02");
    expect(current()).toEqual(["Runs 4"]);
    await go("/voyages/PROJ-123/models/extra");
    expect(current()).toEqual([]);
    await go("/voyages/PROJ-123/models");
    expect(current()).toEqual(["Models"]);
  });

  it("shows the counts muted after the label: a number, 0, and nothing for null or none", async () => {
    const { items } = await render();
    expect(items().map((i) => i.querySelector(".ah-tabs__count")?.textContent ?? null)).toEqual([
      null,
      "2",
      "4",
      "0",
      null,
      null,
      null,
    ]);
  });

  it("lets tabs differ by query parameters, so only the matching one is current", async () => {
    const { fixture, items, current, go } = await render("/artifacts?view=compare");
    fixture.componentInstance.items.set([
      { id: "view", label: "View", link: "/artifacts", queryParams: { view: "view" } },
      { id: "compare", label: "Compare", link: "/artifacts", queryParams: { view: "compare" } },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(items().map((i) => i.getAttribute("href"))).toEqual(["/artifacts?view=view", "/artifacts?view=compare"]);
    expect(current()).toEqual(["Compare"]);
    await go("/artifacts?view=view");
    expect(current()).toEqual(["View"]);
  });

  it("accepts a link given as route segments", async () => {
    const { fixture, items } = await render();
    fixture.componentInstance.items.set([{ id: "plan", label: "Plan", link: ["/voyages", "PROJ-123", "plan"] }]);
    fixture.detectChanges();
    expect(items()[0]!.getAttribute("href")).toBe("/voyages/PROJ-123/plan");
  });

  it("renders no buttons and no pill class", async () => {
    const { root } = await render();
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector(".ah-tabs--pill")).toBeNull();
  });
});

describe("ah-section-tabs, pill variant of buttons", () => {
  const STATES: readonly SectionTab[] = [
    { id: "all", label: "All", count: 142 },
    { id: "not-started", label: "Not started" },
    { id: "in-ahoy", label: "In Ahoy", count: 9 },
  ];

  async function renderPill() {
    const view = await render();
    view.fixture.componentInstance.items.set(STATES);
    view.fixture.componentInstance.label.set("Ahoy state");
    view.fixture.componentInstance.variant.set("pill");
    view.fixture.componentInstance.selected.set("all");
    view.fixture.detectChanges();
    const pressed = () => view.items().map((i) => i.getAttribute("aria-pressed"));
    return { ...view, pressed };
  }

  it("is a labelled group of toggle buttons with the pill class", async () => {
    const { root, items } = await renderPill();
    const group = root.querySelector(".ah-tabs")!;
    expect(group.tagName).toBe("DIV");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Ahoy state");
    expect(group.className).toBe("ah-tabs ah-tabs--pill");
    expect(items().map((i) => [i.tagName, i.getAttribute("type")])).toEqual(Array(3).fill(["BUTTON", "button"]));
    expect(root.querySelector("a, nav")).toBeNull();
  });

  it("presses the selected tab, and a click moves the selection and reports it", async () => {
    const { fixture, items, pressed } = await renderPill();
    expect(pressed()).toEqual(["true", "false", "false"]);
    items()[2]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe("in-ahoy");
    expect(pressed()).toEqual(["false", "false", "true"]);
  });

  it("shows counts like the route tabs do", async () => {
    const { items } = await renderPill();
    expect(items().map((i) => i.querySelector(".ah-tabs__count")?.textContent ?? null)).toEqual(["142", null, "9"]);
  });

  it("presses nothing while nothing is selected", async () => {
    const { fixture, pressed } = await renderPill();
    fixture.componentInstance.selected.set(null);
    fixture.detectChanges();
    expect(pressed()).toEqual(["false", "false", "false"]);
  });
});
