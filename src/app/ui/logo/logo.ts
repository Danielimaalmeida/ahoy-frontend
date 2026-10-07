import { NgTemplateOutlet } from "@angular/common";
import { Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";

/**
 * The Ahoy logo: the ship's-wheel mark (`ahoy-mark.svg`, drawn in `accent` by the bundle) and the word "Ahoy" at
 * 17px/700. Links to `link` (home by default); with `link` set to `null` it is plain text.
 */
@Component({
  selector: "ah-logo",
  imports: [NgTemplateOutlet, RouterLink],
  template: `
    <ng-template #content>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="1.8" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
      </svg>
      Ahoy
    </ng-template>
    @let target = link();
    @if (target !== null) {
      <a class="ah-logo" [routerLink]="target"><ng-container [ngTemplateOutlet]="content" /></a>
    } @else {
      <span class="ah-logo"><ng-container [ngTemplateOutlet]="content" /></span>
    }
  `,
})
export class Logo {
  /** Where the logo links to, or `null` for no link. */
  readonly link = input<string | null>("/");
}
