import { Component, computed, input, model } from "@angular/core";
import { IN_PORT, statusPresentation } from "@domain/status";
import type { StoryStatus } from "@domain/types";

/** What a list can be filtered by: one status, or everything. */
export type StatusFilter = StoryStatus | "all";

/** How many voyages each chip holds; a missing entry shows no count (still loading). */
export type StatusCounts = Readonly<Partial<Record<StatusFilter, number>>>;

/** The name `vocabulary.md` gives the filter that groups Docked and Aground; `statusPresentation` has no such badge. */
export const IN_PORT_LABEL = "In port";

/** The statuses that get a chip, in the order of the Voyages board. `terminal` is the "In port" chip. */
export const CHIP_STATUSES: readonly StoryStatus[] = [
  "ready",
  "running",
  "awaiting_input",
  "awaiting_decision",
  "halted",
  IN_PORT,
];

interface Chip {
  readonly value: StoryStatus;
  readonly label: string;
  readonly modifier: string;
  readonly api: string;
}

function chipFor(status: StoryStatus): Chip {
  if (status === IN_PORT) return { value: status, label: IN_PORT_LABEL, modifier: "done", api: IN_PORT };
  const { label, modifier, api } = statusPresentation(status);
  return { value: status, label, modifier, api };
}

/**
 * Toggle chips that filter a list by status: "All", then one chip per status with its badge, the API word and the
 * count, so people learn the mapping by using it. "In port" groups the two terminal outcomes. One chip is pressed at a
 * time (`aria-pressed`); pressing it again does nothing. `selected` is two-way, so the URL can own it.
 *
 * ```html
 * <ah-filter-chips [counts]="counts()" [(selected)]="status" />
 * ```
 */
@Component({
  selector: "ah-filter-chips",
  template: `
    <div class="ah-chips" role="group" [attr.aria-label]="label()">
      <button type="button" class="ah-chip" [attr.aria-pressed]="selected() === 'all'" (click)="select('all')">
        All
        @if (counts()["all"] !== undefined) {
          <span class="ah-chip__count">{{ counts()["all"] }}</span>
        }
      </button>
      @for (chip of chips(); track chip.value) {
        <button
          type="button"
          class="ah-chip"
          [attr.aria-pressed]="selected() === chip.value"
          (click)="select(chip.value)"
        >
          <span [class]="'ah-badge ah-badge--' + chip.modifier"><i class="ah-badge__dot"></i>{{ chip.label }}</span>
          <span class="ah-chip__api">{{ chip.api }}</span>
          @if (counts()[chip.value] !== undefined) {
            <span class="ah-chip__count">{{ counts()[chip.value] }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class FilterChips {
  /** The count of voyages per status; `all` is the total and `terminal` is "In port". */
  readonly counts = input<StatusCounts>({});
  /** The pressed chip. */
  readonly selected = model<StatusFilter>("all");
  /** The group's accessible name. */
  readonly label = input("Filter by status");

  protected readonly chips = computed(() => CHIP_STATUSES.map(chipFor));

  protected select(value: StatusFilter): void {
    if (value !== this.selected()) this.selected.set(value);
  }
}
