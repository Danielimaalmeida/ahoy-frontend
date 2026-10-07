import { Component, computed, input } from "@angular/core";
import type { IconName } from "./icons";
import { ICONS } from "./icons";

/** The icon sizes the design system uses: 16 by default, 12 inside step rows, 18 in banners and dialog tiles. */
export type IconSize = 12 | 16 | 18;

/**
 * A design-system line icon, inlined as SVG with `stroke="currentColor"` so it takes the text colour.
 * Decorative (`aria-hidden`) by default; give it a `label` when it stands alone, such as in an icon-only button.
 */
@Component({
  selector: "ah-icon",
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [attr.data-icon]="name()"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
    >
      @for (shape of shapes(); track $index) {
        @switch (shape.kind) {
          @case ("path") {
            <path [attr.d]="shape.d" />
          }
          @case ("circle") {
            <circle [attr.cx]="shape.cx" [attr.cy]="shape.cy" [attr.r]="shape.r" />
          }
          @case ("rect") {
            <rect
              [attr.x]="shape.x"
              [attr.y]="shape.y"
              [attr.width]="shape.width"
              [attr.height]="shape.height"
              [attr.rx]="shape.rx"
            />
          }
        }
      }
    </svg>
  `,
})
export class Icon {
  /** Which icon to draw. */
  readonly name = input.required<IconName>();
  /** Width and height in pixels. */
  readonly size = input<IconSize>(16);
  /** Accessible name for an icon that stands alone; leave empty when a word sits next to it. */
  readonly label = input("");

  protected readonly shapes = computed(() => ICONS[this.name()]);
}
