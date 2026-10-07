import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { StatusCounts, StatusFilter } from "./filter-chips";
import { CHIP_STATUSES, FilterChips } from "./filter-chips";

@Component({
  imports: [FilterChips],
  template: `<ah-filter-chips [counts]="counts()" [(selected)]="selected" />`,
})
class Host {
  readonly counts = signal<StatusCounts>({
    all: 8,
    ready: 1,
    running: 1,
    awaiting_input: 1,
    awaiting_decision: 1,
    halted: 2,
    terminal: 2,
  });
  readonly selected = signal<StatusFilter>("all");
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const chips = () => Array.from(root.querySelectorAll<HTMLButtonElement>(".ah-chip"));
  const pressed = () => chips().map((c) => c.getAttribute("aria-pressed"));
  return { fixture, root, chips, pressed };
}

/** The chips of the Voyages board and the FilterChips README: badge label, class, API word. */
const CHIPS = [
  ["Queued", "ah-badge--queued", "ready"],
  ["Under way", "ah-badge--running", "running"],
  ["Crew asks", "ah-badge--input", "awaiting_input"],
  ["Your orders", "ah-badge--decision", "awaiting_decision"],
  ["Anchored", "ah-badge--halted", "halted"],
  ["In port", "ah-badge--done", "terminal"],
] as const;

describe("ah-filter-chips", () => {
  it("is a labelled group of seven chips: All, then the six statuses in the order of the board", () => {
    const { root, chips } = render();
    const group = root.querySelector(".ah-chips")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Filter by status");
    expect(chips().length).toBe(7);
    expect(chips().every((chip) => chip.getAttribute("type") === "button")).toBe(true);
    expect(CHIP_STATUSES).toEqual(["ready", "running", "awaiting_input", "awaiting_decision", "halted", "terminal"]);
  });

  CHIPS.forEach(([label, modifier, api], index) =>
    it(`chip ${index + 1} shows the ${label} badge, the API word ${api} and its count`, () => {
      const chip = render().chips()[index + 1]!;
      const badge = chip.querySelector(".ah-badge")!;
      expect(badge.className).toBe(`ah-badge ${modifier}`);
      expect(badge.textContent).toBe(label);
      expect(badge.firstElementChild!.className).toBe("ah-badge__dot");
      expect(chip.querySelector(".ah-chip__api")!.textContent).toBe(api);
      expect(chip.querySelector(".ah-chip__count")!.textContent).toBe(
        api === "halted" || api === "terminal" ? "2" : "1",
      );
    }),
  );

  it("shows All with the total and no badge or API word", () => {
    const all = render().chips()[0]!;
    expect(all.textContent!.replace(/\s+/g, " ").trim()).toBe("All 8");
    expect(all.querySelector(".ah-badge, .ah-chip__api")).toBeNull();
  });

  it("shows no count for a chip whose count is not known yet", () => {
    const { fixture, chips } = render();
    fixture.componentInstance.counts.set({ halted: 0 });
    fixture.detectChanges();
    const counts = chips().map((chip) => chip.querySelector(".ah-chip__count")?.textContent ?? null);
    expect(counts).toEqual([null, null, null, null, null, "0", null]);
  });

  it("presses exactly one chip at a time, starting with All", () => {
    const { pressed } = render();
    expect(pressed()).toEqual(["true", "false", "false", "false", "false", "false", "false"]);
  });

  it("presses the chip that is clicked, releases the one before and reports it through selected", () => {
    const { fixture, chips, pressed } = render();
    chips()[5]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe("halted");
    expect(pressed()).toEqual(["false", "false", "false", "false", "false", "true", "false"]);
    chips()[0]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe("all");
    expect(pressed()).toEqual(["true", "false", "false", "false", "false", "false", "false"]);
  });

  it("maps the In port chip to the terminal status", () => {
    const { fixture, chips } = render();
    chips()[6]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe("terminal");
  });

  it("does nothing when the pressed chip is clicked again: one chip stays pressed", () => {
    const { fixture, chips, pressed } = render();
    chips()[2]!.click();
    fixture.detectChanges();
    chips()[2]!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe("running");
    expect(pressed().filter((p) => p === "true").length).toBe(1);
  });

  it("follows the selection set from outside, such as the URL", () => {
    const { fixture, pressed } = render();
    fixture.componentInstance.selected.set("awaiting_decision");
    fixture.detectChanges();
    expect(pressed()).toEqual(["false", "false", "false", "false", "true", "false", "false"]);
  });
});
