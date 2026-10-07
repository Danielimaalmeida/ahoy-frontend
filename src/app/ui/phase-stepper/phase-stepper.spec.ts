import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { PHASES } from "@domain/phases";
import type { StoryStatus } from "@domain/types";
import { PhaseStepper } from "./phase-stepper";
import { phaseProgress } from "./phase-steps";

@Component({
  imports: [PhaseStepper],
  template: `<ah-phase-stepper
    [phase]="phase()"
    [status]="status()"
    [stoppedAt]="stoppedAt()"
    [compact]="compact()"
  />`,
})
class Host {
  readonly phase = signal("planning");
  readonly status = signal<StoryStatus>("running");
  readonly stoppedAt = signal<string | null>(null);
  readonly compact = signal(false);
}

interface Options {
  readonly stoppedAt?: string | null;
  readonly compact?: boolean;
}

function render(phase: string, status: StoryStatus, options: Options = {}) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.phase.set(phase);
  fixture.componentInstance.status.set(status);
  fixture.componentInstance.stoppedAt.set(options.stoppedAt ?? null);
  fixture.componentInstance.compact.set(options.compact ?? false);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  /** The state of each of the seven steps, read from the bundle's classes. */
  const states = Array.from(root.querySelectorAll(".ah-step")).map((step) =>
    step.classList.contains("ah-step--done")
      ? "done"
      : step.classList.contains("ah-step--current")
        ? "current"
        : step.classList.contains("ah-step--stopped")
          ? "stopped"
          : "upcoming",
  );
  const dotStates = Array.from(root.querySelectorAll(".ah-dots > span")).map((dot) =>
    dot.classList.contains("is-done")
      ? "done"
      : dot.classList.contains("is-current")
        ? "current"
        : dot.classList.contains("is-stopped")
          ? "stopped"
          : "upcoming",
  );
  return { fixture, root, states, dotStates };
}

/** The expected states when the voyage is in phase `at` (1-based) and `marker` stands on it. */
function expectedAt(at: number, marker: "current" | "stopped"): string[] {
  return PHASES.map((_, i) => (i + 1 < at ? "done" : i + 1 === at ? marker : "upcoming"));
}

const IN_FLIGHT: readonly StoryStatus[] = ["ready", "running", "awaiting_input", "awaiting_decision"];

describe("ah-phase-stepper: every status in every phase", () => {
  for (const status of IN_FLIGHT)
    PHASES.forEach((phase, index) =>
      it(`${status} in ${phase}: passed phases are done and exactly one step is current`, () => {
        const { states, dotStates, root } = render(phase, status);
        expect(states).toEqual(expectedAt(index + 1, "current"));
        expect(states.filter((s) => s === "current").length).toBe(1);
        expect(root.querySelectorAll(".ah-step--stopped").length).toBe(0);
        expect(root.querySelectorAll("[aria-current='step']").length).toBe(1);
        // The compact form says the same in seven bars.
        const compact = render(phase, status, { compact: true });
        expect(compact.dotStates).toEqual(expectedAt(index + 1, "current"));
        expect(compact.root.querySelector(".ah-dots")!.getAttribute("aria-label")).toBe(`Phase ${index + 1} of 7`);
        expect(dotStates).toEqual([]);
      }),
    );

  PHASES.forEach((phase, index) =>
    it(`halted in ${phase}: that step is stopped, replaces current, and none is current`, () => {
      const { states, root } = render(phase, "halted");
      expect(states).toEqual(expectedAt(index + 1, "stopped"));
      expect(root.querySelectorAll(".ah-step--current").length).toBe(0);
      const compact = render(phase, "halted", { compact: true });
      expect(compact.dotStates).toEqual(expectedAt(index + 1, "stopped"));
      expect(compact.root.querySelector(".ah-dots")!.getAttribute("aria-label")).toBe(`Stopped at phase ${index + 1}`);
    }),
  );

  for (const phase of PHASES)
    it(`terminal in ${phase}: Docked, every step is done and none is current`, () => {
      const { states, root, fixture } = render(phase, "terminal");
      expect(states).toEqual(PHASES.map(() => "done"));
      expect(root.querySelectorAll(".ah-step--current, .ah-step--stopped").length).toBe(0);
      fixture.componentInstance.compact.set(true);
      fixture.detectChanges();
      expect(root.querySelectorAll(".ah-dots > .is-done").length).toBe(7);
      expect(root.querySelector(".ah-dots")!.getAttribute("aria-label")).toBe("Done");
    });

  PHASES.slice(0, 6).forEach((stopped, index) =>
    it(`terminal in blocked, stopped at ${stopped}: Aground, that step is stopped`, () => {
      const { states } = render("blocked", "terminal", { stoppedAt: stopped });
      expect(states).toEqual(expectedAt(index + 1, "stopped"));
      const compact = render("blocked", "terminal", { stoppedAt: stopped, compact: true });
      expect(compact.dotStates).toEqual(expectedAt(index + 1, "stopped"));
      expect(compact.root.querySelector(".ah-dots")!.getAttribute("aria-label")).toBe(`Blocked at phase ${index + 1}`);
    }),
  );

  it("terminal in blocked with no known stop shows the final state without a position", () => {
    for (const stoppedAt of [null, "", "blocked", "not_a_phase"]) {
      const { states, root } = render("blocked", "terminal", { stoppedAt });
      expect(states).toEqual(PHASES.map(() => "upcoming"));
      expect(root.querySelectorAll("[aria-current]").length).toBe(0);
      const compact = render("blocked", "terminal", { stoppedAt, compact: true });
      expect(compact.root.querySelector(".ah-dots")!.getAttribute("aria-label")).toBe("Blocked");
    }
  });

  it("marks nothing for a phase it does not know", () => {
    const { states, root } = render("a_new_phase", "running", { compact: false });
    expect(states).toEqual(PHASES.map(() => "upcoming"));
    expect(root.querySelectorAll("[aria-current]").length).toBe(0);
    expect(
      render("a_new_phase", "running", { compact: true }).root.querySelector(".ah-dots")!.getAttribute("aria-label"),
    ).toBe("Phase a_new_phase");
  });
});

describe("ah-phase-stepper, full form", () => {
  it("shows the seven API phase names in order, with a separator between each pair", () => {
    const { root } = render("plan_review", "awaiting_decision");
    const steps = Array.from(root.querySelectorAll(".ah-step"));
    expect(steps.map((s) => s.textContent!.replace(/^\S/, "").trim())).toEqual([...PHASES]);
    expect(root.querySelectorAll(".ah-step__sep").length).toBe(6);
    expect(root.querySelector(".ah-stepper")!.lastElementChild!.classList.contains("ah-step")).toBe(true);
  });

  it("shows a check in done steps, the number in the current one and in those ahead, and ! where it stopped", () => {
    const circles = (root: HTMLElement) => Array.from(root.querySelectorAll(".ah-step__n")).map((n) => n.textContent);
    expect(circles(render("plan_review", "awaiting_decision").root)).toEqual(["✓", "✓", "3", "4", "5", "6", "7"]);
    expect(circles(render("planning", "halted").root)).toEqual(["✓", "!", "3", "4", "5", "6", "7"]);
    expect(circles(render("done", "terminal").root)).toEqual(["✓", "✓", "✓", "✓", "✓", "✓", "✓"]);
  });

  it("is a labelled list whose items name their state in words, so colour never carries it alone", () => {
    const { root } = render("planning", "halted");
    const list = root.querySelector(".ah-stepper")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe("Phases");
    const items = Array.from(list.querySelectorAll("[role='listitem']"));
    expect(items.map((i) => i.getAttribute("aria-label"))).toEqual([
      "intake, done",
      "planning, stopped",
      "plan_review, ahead",
      "implementation, ahead",
      "pr_review, ahead",
      "delivery_gate, ahead",
      "done, ahead",
    ]);
    expect(list.querySelector(".ah-step__sep")!.getAttribute("aria-hidden")).toBe("true");
    expect(list.querySelector(".ah-step__n")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks the current step with aria-current=step", () => {
    const { root } = render("implementation", "running");
    expect(root.querySelector("[aria-current='step']")!.textContent).toContain("implementation");
  });

  it("draws no compact bars", () => {
    expect(render("planning", "running").root.querySelector(".ah-dots")).toBeNull();
  });
});

describe("ah-phase-stepper, compact form", () => {
  it("draws seven bars, as an image named by the position", () => {
    const { root } = render("plan_review", "awaiting_decision", { compact: true });
    const dots = root.querySelector(".ah-dots")!;
    expect(dots.children.length).toBe(7);
    expect(dots.getAttribute("role")).toBe("img");
    expect(dots.getAttribute("aria-label")).toBe("Phase 3 of 7");
    expect(root.querySelector(".ah-stepper")).toBeNull();
  });

  it("follows its inputs", () => {
    const { fixture, root } = render("planning", "running", { compact: true });
    fixture.componentInstance.status.set("halted");
    fixture.detectChanges();
    expect(root.querySelector(".ah-dots")!.getAttribute("aria-label")).toBe("Stopped at phase 2");
    fixture.componentInstance.compact.set(false);
    fixture.detectChanges();
    expect(root.querySelector(".ah-dots")).toBeNull();
    expect(root.querySelectorAll(".ah-step--stopped").length).toBe(1);
  });
});

describe("phaseProgress", () => {
  it("never marks more than one step as current or stopped, for any status, phase and stop", () => {
    const statuses: StoryStatus[] = ["ready", "running", "awaiting_input", "awaiting_decision", "halted", "terminal"];
    for (const status of statuses)
      for (const phase of [...PHASES, "blocked", "unknown"])
        for (const stoppedAt of [null, ...PHASES, "unknown"]) {
          const marked = phaseProgress(phase, status, stoppedAt).steps.filter(
            (s) => s.state === "current" || s.state === "stopped",
          );
          expect(marked.length).toBeLessThanOrEqual(1);
        }
  });

  it("numbers the steps 1 to 7 in the order of the domain's phases", () => {
    const { steps } = phaseProgress("intake", "ready");
    expect(steps.map((s) => [s.n, s.phase])).toEqual(PHASES.map((p, i) => [i + 1, p]));
  });
});
