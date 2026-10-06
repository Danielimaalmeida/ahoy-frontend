import { NgComponentOutlet } from "@angular/common";
import { Component, ViewEncapsulation, inject } from "@angular/core";
import { Button } from "@ui/button/button";
import { Logo } from "@ui/logo/logo";
import type { Theme } from "@ui/theme/theme.service";
import { THEMES, ThemeService } from "@ui/theme/theme.service";
import type { KitSection } from "./kit-section";
import { KIT_SECTIONS_1A } from "./sections/1a-sections";
import { KIT_SECTIONS_1B } from "./sections/1b-sections";
import { KIT_SECTIONS_1C } from "./sections/1c-sections";

/** Every gallery section; each lane lists its own in `sections/<lane>-sections.ts`. */
export const KIT_SECTIONS: readonly KitSection[] = [...KIT_SECTIONS_1A, ...KIT_SECTIONS_1B, ...KIT_SECTIONS_1C];

const THEME_LABELS: Readonly<Record<Theme, string>> = { light: "Light", dark: "Dark" };

/**
 * The `/_kit` gallery (development builds only): every design-system component in all its variants, with a light/dark
 * switch, to compare with the `preview.html` files in `docs/design/design-system/components/`. Its layout classes
 * (`kit-*`) are global but load only with this lazy, dev-only page.
 */
@Component({
  selector: "ah-kit",
  imports: [Button, Logo, NgComponentOutlet],
  encapsulation: ViewEncapsulation.None,
  styles: `
    .kit {
      box-sizing: border-box;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: var(--space-6) var(--space-6) var(--space-8);
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
    }
    .kit__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .kit__title {
      margin: 0;
      font-size: 24px;
      line-height: 29px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .kit__theme {
      display: flex;
      gap: var(--space-1);
      margin-left: auto;
    }
    .kit__section,
    .kit__section > :not(.kit__section-title),
    .kit-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }
    .kit__section-title {
      margin: 0;
      font-size: 15px;
      line-height: 20px;
      font-weight: 700;
    }
    .kit-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .kit-grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3\\.5);
    }
    .kit-icons {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .kit-icon {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    /* The DataTable README allows a sideways-scrolling box below tablet width. position: relative keeps the
       bundle's absolutely positioned .ah-sr text inside it; without it the page itself scrolls sideways. */
    .kit-scroll {
      position: relative;
      overflow-x: auto;
    }
    @media (max-width: 600px) {
      .kit {
        padding: var(--space-4);
      }
      .kit-grid-2 {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <main class="kit ah">
      <header class="kit__head">
        <ah-logo />
        <h1 class="kit__title">Kit</h1>
        <span class="ah-muted">Design-system components · development builds only</span>
        <div class="kit__theme" role="group" aria-label="Theme">
          @for (t of themes; track t) {
            <button
              type="button"
              [ahButton]="theme.theme() === t ? 'soft' : 'ghost'"
              size="sm"
              [attr.aria-pressed]="theme.theme() === t"
              (click)="theme.set(t)"
            >
              {{ labels[t] }}
            </button>
          }
        </div>
      </header>
      @for (section of sections; track section.id) {
        <section class="kit__section" [id]="section.id" [attr.aria-labelledby]="section.id + '-title'">
          <h2 class="kit__section-title" [id]="section.id + '-title'">
            {{ section.title }} <span class="ah-api">lane {{ section.lane }}</span>
          </h2>
          <ng-container *ngComponentOutlet="section.component" />
        </section>
      }
    </main>
  `,
})
export class Kit {
  protected readonly theme = inject(ThemeService);
  protected readonly themes = THEMES;
  protected readonly labels = THEME_LABELS;
  protected readonly sections = KIT_SECTIONS;
}
