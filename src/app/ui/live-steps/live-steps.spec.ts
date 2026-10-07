import { Component, signal } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import type { LiveStep } from "./live-steps";
import { LiveSteps, clipMessage, gapLabel, redactedSegments, stepTime } from "./live-steps";

const STEPS: readonly LiveStep[] = [
  { kind: "tool", at: "2026-10-06T10:41:05", tool: "grep", summary: '"assignRole|revokeRole" in services/' },
  { kind: "message", at: "2026-10-06T10:41:19", text: "Role changes go through RoleService only." },
  { kind: "gap", count: 38 },
  {
    kind: "tool",
    at: "2026-10-06T10:43:40",
    tool: "bash",
    summary: "psql -c '\\d audit_events' PGPASSWORD=[REDACTED]",
  },
];

@Component({
  imports: [LiveSteps],
  template: `<ah-live-steps [steps]="steps()" />`,
})
class Host {
  readonly steps = signal<readonly LiveStep[]>(STEPS);
}

let fixture: ComponentFixture<Host>;

async function render(): Promise<{ root: HTMLElement; host: Host }> {
  fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

/** Gives a jsdom element a scroll box: jsdom does no layout, so the sizes are set by hand. */
function fakeScrollBox(el: HTMLElement, clientHeight: number): { setContent: (h: number) => void } {
  let scrollHeight = clientHeight;
  let scrollTop = 0;
  Object.defineProperty(el, "clientHeight", { get: () => clientHeight });
  Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight });
  Object.defineProperty(el, "scrollTop", {
    get: () => scrollTop,
    set: (v: number) => (scrollTop = Math.max(0, Math.min(v, scrollHeight - clientHeight))),
  });
  return { setContent: (h) => (scrollHeight = h) };
}

describe("ah-live-steps", () => {
  it("is a labelled log of tool, message and gap rows, as in the preview", async () => {
    const { root } = await render();
    const log = root.querySelector(".ah-steps")!;
    expect(log.getAttribute("role")).toBe("log");
    expect(log.getAttribute("aria-label")).toBe("Live steps");
    const children = Array.from(log.children);
    expect(children.map((c) => c.className)).toEqual([
      "ah-steps__row",
      "ah-steps__row ah-steps__row--message",
      "ah-steps__gap",
      "ah-steps__row",
    ]);
    const grep = children[0]!;
    expect(grep.querySelector(".ah-steps__time")!.textContent).toBe("10:41:05");
    expect(grep.querySelector(".ah-steps__icon svg")!.getAttribute("data-icon")).toBe("tool");
    expect(grep.querySelector(".ah-steps__icon svg")!.getAttribute("width")).toBe("12");
    expect(grep.querySelector(".ah-steps__tool")!.textContent).toBe("grep");
    expect(grep.querySelector(".ah-steps__text")!.className).toBe("ah-steps__text ah-mono");
    expect(grep.querySelector(".ah-steps__text")!.textContent).toBe('"assignRole|revokeRole" in services/');
    const message = children[1]!;
    expect(message.querySelector(".ah-steps__icon svg")!.getAttribute("data-icon")).toBe("message");
    expect(message.querySelector(".ah-steps__tool")!.textContent).toBe("message");
    expect(message.querySelector(".ah-steps__text")!.className).toBe("ah-steps__text");
    expect(children[2]!.textContent).toBe("38 steps not shown");
    expect(root.querySelector(".ah-live-steps__foot")!.textContent).toContain("This is a view, not a control");
    expect(root.querySelector("button, input, textarea, a")).toBeNull();
  });

  it("highlights [REDACTED] in ah-redacted by interpolation, never as HTML", async () => {
    const { root, host } = await render();
    const last = root.querySelectorAll(".ah-steps__row")[2]!;
    const text = last.querySelector(".ah-steps__text")!;
    expect(text.textContent).toBe("psql -c '\\d audit_events' PGPASSWORD=[REDACTED]");
    const masks = Array.from(text.querySelectorAll(".ah-redacted"));
    expect(masks.map((m) => m.textContent)).toEqual(["[REDACTED]"]);

    host.steps.set([
      { kind: "message", text: '<img src=x onerror="alert(1)"> token [REDACTED] and <b>[REDACTED]</b>' },
    ]);
    await fixture.whenStable();
    const row = root.querySelector(".ah-steps__text")!;
    expect(row.querySelector("img, b")).toBeNull();
    expect(row.textContent).toBe('<img src=x onerror="alert(1)"> token [REDACTED] and <b>[REDACTED]</b>');
    expect(row.querySelectorAll(".ah-redacted")).toHaveLength(2);
  });

  it("shows an empty log until the first step", async () => {
    const { root, host } = await render();
    host.steps.set([]);
    await fixture.whenStable();
    expect(root.querySelector(".ah-steps")!.textContent).toBe("No steps yet.");
  });

  it("follows new steps while the reader is at the bottom", async () => {
    const { root, host } = await render();
    const log = root.querySelector<HTMLElement>(".ah-steps")!;
    const box = fakeScrollBox(log, 100);
    box.setContent(300);
    host.steps.set([...STEPS, { kind: "tool", tool: "read", summary: "a.ts" }]);
    await fixture.whenStable();
    expect(log.scrollTop).toBe(200);
  });

  it("doesn't take the scroll back when the reader has scrolled up", async () => {
    const { root, host } = await render();
    const log = root.querySelector<HTMLElement>(".ah-steps")!;
    const box = fakeScrollBox(log, 100);
    box.setContent(300);
    log.scrollTop = 40;
    log.dispatchEvent(new Event("scroll"));
    box.setContent(400);
    host.steps.set([...STEPS, { kind: "tool", tool: "read", summary: "a.ts" }]);
    await fixture.whenStable();
    expect(log.scrollTop).toBe(40);

    // Back at the bottom (within the slack): following resumes.
    log.scrollTop = 290;
    log.dispatchEvent(new Event("scroll"));
    box.setContent(500);
    host.steps.set([...host.steps(), { kind: "tool", tool: "read", summary: "b.ts" }]);
    await fixture.whenStable();
    expect(log.scrollTop).toBe(400);
  });
});

describe("live-steps helpers", () => {
  it("splits text around every [REDACTED]", () => {
    expect(redactedSegments("a [REDACTED] b[REDACTED]")).toEqual([
      { text: "a ", redacted: false },
      { text: "[REDACTED]", redacted: true },
      { text: " b", redacted: false },
      { text: "[REDACTED]", redacted: true },
    ]);
    expect(redactedSegments("")).toEqual([]);
    expect(redactedSegments("[REDACTED]")).toEqual([{ text: "[REDACTED]", redacted: true }]);
  });

  it("clips messages to 200 characters, counting emoji as one", () => {
    expect(clipMessage("short")).toBe("short");
    expect(clipMessage("x".repeat(200))).toBe("x".repeat(200));
    expect(clipMessage("x".repeat(201))).toBe(`${"x".repeat(200)}…`);
    expect(clipMessage("🙂".repeat(201))).toBe(`${"🙂".repeat(200)}…`);
  });

  it("formats step times and says how many steps were left out", () => {
    expect(stepTime("2026-10-06T09:05:07")).toBe("09:05:07");
    expect(stepTime(undefined)).toBe("");
    expect(stepTime("not a date")).toBe("");
    expect(gapLabel(1)).toBe("1 step not shown");
    expect(gapLabel(38)).toBe("38 steps not shown");
  });
});
