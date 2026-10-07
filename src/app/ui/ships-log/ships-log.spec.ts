import { Component, signal } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { absoluteTime } from "@domain/time";
import type { ShipsLogEntry } from "./ships-log";
import { ShipsLog } from "./ships-log";

const ENTRIES: readonly ShipsLogEntry[] = [
  {
    id: "e3",
    at: "2026-10-06T09:49:00Z",
    title: "Waiting at the human gate",
    details: "plan_accepted, round 2",
    actor: "ahoy-reconciler",
    kind: "wait",
  },
  {
    id: "e2",
    at: "2026-10-06T09:48:00Z",
    title: "Gate evaluated",
    details: "plan · pass",
    actor: "ahoy-reconciler",
    kind: "pass",
    run: { id: "r-04", link: ["/voyages", "PROJ-123", "runs", "r-04"] },
  },
  {
    id: "e1",
    at: "2026-10-06T09:30:00Z",
    title: "Budget changed",
    details: '20 → 30 AIU · "Revision needs more room"',
    actor: "alex@example.com",
    kind: "human",
  },
  { id: "e0", at: "2026-10-06T09:00:00Z", title: "Voyage started", actor: "alex@example.com", kind: "system" },
];

@Component({
  imports: [ShipsLog],
  template: `<ah-ships-log [entries]="entries()" />`,
})
class Host {
  readonly entries = signal<readonly ShipsLogEntry[]>(ENTRIES);
}

let fixture: ComponentFixture<Host>;

async function render(): Promise<{ root: HTMLElement; host: Host }> {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

const text = (el: Element): string => el.textContent!.replace(/\s+/g, " ").trim();

describe("ah-ships-log", () => {
  it("lists the entries in the given order, with time, dot, event, details and who", async () => {
    const { root } = await render();
    const list = root.querySelector(".ah-log")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe("Ship's log");
    const rows = Array.from(list.querySelectorAll(".ah-log__row"));
    expect(rows).toHaveLength(4);
    const first = rows[0]!;
    expect(first.getAttribute("role")).toBe("listitem");
    const time = first.querySelector("time")!;
    expect(time.textContent).toBe(absoluteTime("2026-10-06T09:49:00Z"));
    expect(time.getAttribute("datetime")).toBe("2026-10-06T09:49:00Z");
    expect(first.querySelector("b")!.textContent).toBe("Waiting at the human gate");
    expect(text(first.children[2]!)).toBe("Waiting at the human gate plan_accepted, round 2");
    expect(rows.map((r) => r.querySelector(".ah-log__who")!.textContent)).toEqual([
      "Ahoy",
      "Ahoy",
      "alex@example.com",
      "alex@example.com",
    ]);
  });

  it("colours the dot by kind and hides it from screen readers", async () => {
    const { root } = await render();
    const dots = Array.from(root.querySelectorAll(".ah-log__dot"));
    expect(dots.map((d) => d.className)).toEqual([
      "ah-log__dot ah-log__dot--wait",
      "ah-log__dot ah-log__dot--pass",
      "ah-log__dot ah-log__dot--human",
      "ah-log__dot",
    ]);
    expect(dots.every((d) => d.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("links the run id to its run detail", async () => {
    const { root } = await render();
    const row = root.querySelectorAll(".ah-log__row")[1]!;
    const link = row.querySelector("a.ah-key")!;
    expect(link.textContent).toBe("r-04");
    expect(link.getAttribute("href")).toBe("/voyages/PROJ-123/runs/r-04");
    expect(text(row.children[2]!)).toBe("Gate evaluated plan · pass · r-04");
    expect(root.querySelectorAll("a")).toHaveLength(1);
    expect(text(root.querySelectorAll(".ah-log__row")[3]!.children[2]!)).toBe("Voyage started");
  });

  it("shows agent and user text as text", async () => {
    const { root, host } = await render();
    host.entries.set([
      { id: "x", at: "2026-10-06T09:00:00Z", title: "<b>Hi</b>", details: "<img src=x>", actor: "a", kind: "human" },
    ]);
    await fixture.whenStable();
    expect(root.querySelector(".ah-log img")).toBeNull();
    expect(text(root.querySelector(".ah-log__row")!.children[2]!)).toBe("<b>Hi</b> <img src=x>");
  });

  it("says when the log is empty", async () => {
    const { root, host } = await render();
    host.entries.set([]);
    await fixture.whenStable();
    expect(text(root.querySelector(".ah-log")!)).toBe("Nothing in the log yet.");
  });
});
