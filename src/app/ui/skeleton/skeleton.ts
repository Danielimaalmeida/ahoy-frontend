import { Component, computed, input } from "@angular/core";

/** The height of a text-like bar in pixels, as in the Skeleton preview; a badge placeholder is 20. */
export const BAR_HEIGHT = 10;

/** The widths text-like bars cycle through from one row to the next, so the rows do not look stamped. */
const TEXT_WIDTHS = ["85%", "65%", "75%"] as const;

/**
 * One grey placeholder bar. Size it like the content it stands for, so nothing jumps when the data arrives.
 * `<ah-skeleton width="85%" />`; `[height]="20"` is the height of a badge.
 */
@Component({
  selector: "ah-skeleton",
  host: { class: "ah-skeleton", "[style.width]": "width()", "[style.height.px]": "height()" },
  template: ``,
})
export class Skeleton {
  /** Any CSS length: "85%", "80px". */
  readonly width = input("100%");
  /** Height in pixels. */
  readonly height = input(BAR_HEIGHT);
}

/** One column of a skeleton row: its grid track and the height of its bar. */
export interface SkeletonColumn {
  /** The column's `grid-template-columns` track: "80px", "minmax(0, 1fr)". */
  readonly track: string;
  /** Bar height in pixels; a badge column is 20, text columns are 10 (the default). */
  readonly height?: number;
}

/**
 * Placeholder rows for a first load, in the shape of the table or list they stand for. The container is
 * `aria-busy="true"`; live updates replace rows in place and never bring the skeleton back.
 *
 * ```html
 * <ah-panel><ah-panel-body><ah-skeleton-rows [rows]="5" [columns]="columns" /></ah-panel-body></ah-panel>
 * ```
 */
@Component({
  selector: "ah-skeleton-rows",
  imports: [Skeleton],
  template: `
    <div class="ah-skeleton-rows" aria-busy="true">
      @for (row of rowIndexes(); track row) {
        <div class="ah-skeleton-row" [style.grid-template-columns]="tracks()">
          @for (column of columns(); track $index) {
            <ah-skeleton [width]="widthOf(column, row)" [height]="column.height ?? barHeight" />
          }
        </div>
      }
    </div>
  `,
})
export class SkeletonRows {
  /** How many rows. */
  readonly rows = input(3);
  /** The columns, left to right. */
  readonly columns = input.required<readonly SkeletonColumn[]>();

  protected readonly barHeight = BAR_HEIGHT;
  protected readonly rowIndexes = computed(() => Array.from({ length: Math.max(0, this.rows()) }, (_, i) => i));
  protected readonly tracks = computed(() =>
    this.columns()
      .map((c) => c.track)
      .join(" "),
  );

  /** Fixed-width columns fill their track; flexible ones vary a little from row to row. */
  protected widthOf(column: SkeletonColumn, row: number): string {
    return /^\d+(\.\d+)?px$/.test(column.track) ? "100%" : (TEXT_WIDTHS[row % TEXT_WIDTHS.length] ?? "100%");
  }
}
