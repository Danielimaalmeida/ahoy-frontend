import { Component, computed, input } from "@angular/core";
import { budgetPercent, formatAiu } from "@domain/aiu";

/** A cap as it reads in "12.4 / 30 AIU": the amount at `decimals`, without trailing zeros ("30.0" is "30"). */
export function formatCap(capNanoAiu: number, decimals: number): string {
  const text = formatAiu(capNanoAiu, decimals);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * AIU spent against a voyage's or a run's hard cap, with the numbers always beside the bar ("12.4 / 30 AIU"). The bar
 * keeps its colour as it fills: the cap is a limit the owner chose, not a warning. Amounts are integer nano-AIU and are
 * formatted only for display. `variant="full"` reads "**12.4** / 30 AIU" for a header; `compact` reads "12.4 / 30" in
 * mono for a table whose column already says AIU.
 *
 * ```html
 * <ah-budget-meter [spentNanoAiu]="story.spentNanoAiu" [capNanoAiu]="story.budgetNanoAiu" [width]="120" />
 * ```
 */
@Component({
  selector: "ah-budget-meter",
  template: `
    <div class="ah-budget">
      <div
        class="ah-meter"
        role="meter"
        aria-valuemin="0"
        [style.width.px]="width()"
        [attr.aria-label]="label()"
        [attr.aria-valuemax]="view().max"
        [attr.aria-valuenow]="view().now"
        [attr.aria-valuetext]="view().valueText"
      >
        <i class="ah-meter__fill" [style.width.%]="view().percent"></i>
      </div>
      @if (variant() === "compact") {
        <span class="ah-mono">{{ view().spent }} / {{ view().cap }}</span>
      } @else {
        <span
          ><b>{{ view().spent }}</b> / {{ view().cap }} AIU</span
        >
      }
    </div>
  `,
})
export class BudgetMeter {
  /** AIU spent so far, in integer nano-AIU. */
  readonly spentNanoAiu = input.required<number>();
  /** The cap, in integer nano-AIU. */
  readonly capNanoAiu = input.required<number>();
  /** Decimals of the spent amount: 1 in lists, 2 on run detail (the cap drops trailing zeros). */
  readonly decimals = input(1);
  /** Width of the bar in pixels (120 in a header, 64 in a table row). */
  readonly width = input(120);
  /** `full` is "12.4 / 30 AIU" with the spent amount in bold; `compact` is "12.4 / 30" in mono. */
  readonly variant = input<"full" | "compact">("full");
  /** The meter's accessible name. */
  readonly label = input("Budget");

  protected readonly view = computed(() => {
    const spent = this.spentNanoAiu();
    const cap = this.capNanoAiu();
    const decimals = this.decimals();
    if (!Number.isSafeInteger(spent) || !Number.isSafeInteger(cap) || spent < 0 || cap < 0) {
      return { spent: "—", cap: "—", max: null, now: null, percent: 0, valueText: null };
    }
    const spentText = formatAiu(spent, decimals);
    const capText = formatCap(cap, decimals);
    // aria-valuenow may not exceed aria-valuemax; a run that overshoots its cap reads as full.
    const now = formatAiu(Math.min(spent, cap), decimals);
    return {
      spent: spentText,
      cap: capText,
      max: capText,
      now,
      percent: budgetPercent(cap, spent),
      valueText: `${spentText} of ${capText} AIU`,
    };
  });
}
