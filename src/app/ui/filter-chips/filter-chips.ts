import { Component, computed, input, model } from '@angular/core';
import {
  AGROUND,
  IN_PORT,
  statusPresentation,
  type BoardStatus,
} from '@domain/status';

/** What a list can be filtered by: one board status (an API status, or Blocked), or everything. */
export type StatusFilter = BoardStatus | 'all';

/** How many voyages each chip holds; a missing entry shows no count (still loading). */
export type StatusCounts = Readonly<Partial<Record<StatusFilter, number>>>;

/**
 * The filter of the voyages that are over (`terminal`, Done). A Blocked voyage is not one of them: it has its own chip,
 * beside Halted, because it waits for a person to Unblock it.
 */
export const IN_PORT_LABEL = 'Ended';

/**
 * The statuses that get a chip, in the order of the Voyages board: those that move, those that wait for a person
 * (Blocked among them), then `terminal`, the "Ended" chip.
 */
export const CHIP_STATUSES: readonly BoardStatus[] = [
  'ready',
  'running',
  'awaiting_input',
  'awaiting_decision',
  'halted',
  AGROUND,
  IN_PORT,
];

interface Chip {
  readonly value: BoardStatus;
  readonly label: string;
  readonly modifier: string;
  readonly api: string;
}

function chipFor(status: BoardStatus): Chip {
  if (status === IN_PORT)
    return {
      value: status,
      label: IN_PORT_LABEL,
      modifier: 'queued',
      api: IN_PORT,
    };
  if (status === AGROUND) {
    const { label, modifier } = statusPresentation('terminal', 'blocked');
    return { value: status, label, modifier, api: 'terminal · blocked' };
  }
  const { label, modifier, api } = statusPresentation(status);
  return { value: status, label, modifier, api };
}

/**
 * Toggle chips that filter a list by status: "All", then one chip per status with its badge, the API word and the
 * count, so people learn the mapping by using it. "Blocked" is the terminal voyages at phase `blocked`, which wait for a
 * person; "Ended" is the rest of `terminal`, the Done ones. One chip is pressed at a
 * time (`aria-pressed`); pressing it again does nothing. `selected` is two-way, so the URL can own it.
 *
 * ```html
 * <ah-filter-chips [counts]="counts()" [(selected)]="status" />
 * ```
 */
@Component({
  selector: 'ah-filter-chips',
  template: `
    <div class="ah-chips" role="group" [attr.aria-label]="label()">
      <button
        type="button"
        class="ah-chip"
        [attr.aria-pressed]="selected() === 'all'"
        (click)="select('all')"
      >
        All
        @if (counts()['all'] !== undefined) {
          <span class="ah-chip__count">{{ counts()['all'] }}</span>
        }
      </button>
      @for (chip of chips(); track chip.value) {
        <button
          type="button"
          class="ah-chip"
          [attr.aria-pressed]="selected() === chip.value"
          (click)="select(chip.value)"
        >
          <span [class]="'ah-badge ah-badge--' + chip.modifier"
            ><i class="ah-badge__dot"></i>{{ chip.label }}</span
          >
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
  /** The count of voyages per board status; `all` is the total, `blocked` is "Blocked" and `terminal` is "Ended". */
  readonly counts = input<StatusCounts>({});
  /** The pressed chip. */
  readonly selected = model<StatusFilter>('all');
  /** The group's accessible name. */
  readonly label = input('Filter by status');

  protected readonly chips = computed(() => CHIP_STATUSES.map(chipFor));

  protected select(value: StatusFilter): void {
    if (value !== this.selected()) this.selected.set(value);
  }
}
