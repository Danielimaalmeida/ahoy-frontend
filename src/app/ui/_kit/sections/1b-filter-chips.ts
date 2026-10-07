import { Component, signal } from "@angular/core";
import type { StatusCounts, StatusFilter } from "@ui/filter-chips/filter-chips";
import { FilterChips } from "@ui/filter-chips/filter-chips";

/** Gallery: the FilterChips preview with the full Voyages board set; the chip you press stays pressed. */
@Component({
  selector: "ah-kit-filter-chips",
  imports: [FilterChips],
  template: `<ah-filter-chips [counts]="counts" [(selected)]="selected" />`,
})
export class KitFilterChips {
  protected readonly counts: StatusCounts = {
    all: 8,
    ready: 1,
    running: 1,
    awaiting_input: 1,
    awaiting_decision: 1,
    halted: 2,
    terminal: 2,
  };
  protected readonly selected = signal<StatusFilter>("all");
}
