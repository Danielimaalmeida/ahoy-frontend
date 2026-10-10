import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** One tab. With a `link` it is a route (`<a>`, `aria-current="page"` when active); without, a button that selects. */
export interface SectionTab {
  /** Unique within the tabs; the value of `selected` for a button tab. */
  readonly id: string;
  readonly label: string;
  /** The route to go to, as `routerLink` takes it: `"/voyages/PROJ-123/plan"` or `["/voyages", key, "plan"]`. */
  readonly link?: string | readonly string[];
  /** Query parameters of the route, for tabs that differ only by them. */
  readonly queryParams?: Readonly<Record<string, string>>;
  /** A muted number after the label, straight from the API. Absent or `null` shows none; `0` shows 0. */
  readonly count?: number | null;
  /** Active only on exactly this URL, not on the ones below it. */
  readonly exact?: boolean;
}

/** `tabs` is the segmented bar of a voyage's sections; `pill` is the compact control (All / Not started / In Ahoy). */
export type SectionTabsVariant = 'tabs' | 'pill';

const EXACT = { exact: true } as const;
const PREFIX = { exact: false } as const;

/**
 * Segmented tabs. Route tabs are links, so each section has its own URL and the current one carries
 * `aria-current="page"`; the tabs wrap onto another line instead of scrolling. Tabs without a `link` are toggle buttons
 * (`aria-pressed`) for a segmented control such as View / Compare, and `selected` says which is on.
 *
 * ```html
 * <ah-section-tabs label="Voyage sections" [items]="tabs()" />
 * <ah-section-tabs variant="pill" label="Ahoy state" [items]="states" [(selected)]="state" />
 * ```
 */
@Component({
  selector: 'ah-section-tabs',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  template: `
    <ng-template #tabList>
      @for (view of views(); track view.tab.id) {
        @if (view.tab.link !== undefined) {
          <a
            class="ah-tabs__item"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLink]="view.tab.link"
            [queryParams]="view.tab.queryParams"
            [routerLinkActiveOptions]="view.options"
            >{{ view.tab.label }}
            @if (view.tab.count !== undefined && view.tab.count !== null) {
              <span class="ah-tabs__count">{{ view.tab.count }}</span>
            }
          </a>
        } @else {
          <button
            type="button"
            class="ah-tabs__item"
            [attr.aria-pressed]="selected() === view.tab.id"
            (click)="selected.set(view.tab.id)"
          >
            {{ view.tab.label }}
            @if (view.tab.count !== undefined && view.tab.count !== null) {
              <span class="ah-tabs__count">{{ view.tab.count }}</span>
            }
          </button>
        }
      }
    </ng-template>
    @if (hasLinks()) {
      <nav [class]="classes()" [attr.aria-label]="label()">
        <ng-container [ngTemplateOutlet]="tabList" />
      </nav>
    } @else {
      <div [class]="classes()" role="group" [attr.aria-label]="label()">
        <ng-container [ngTemplateOutlet]="tabList" />
      </div>
    }
  `,
})
export class SectionTabs {
  /** The tabs, in order. */
  readonly items = input.required<readonly SectionTab[]>();
  /** The accessible name of the group ("Voyage sections"). */
  readonly label = input.required<string>();
  /** The look: the segmented bar or the compact pill. */
  readonly variant = input<SectionTabsVariant>('tabs');
  /** For button tabs: the `id` of the one that is on. */
  readonly selected = model<string | null>(null);

  protected readonly classes = computed(() =>
    this.variant() === 'pill' ? 'ah-tabs ah-tabs--pill' : 'ah-tabs'
  );
  protected readonly hasLinks = computed(() =>
    this.items().some((tab) => tab.link !== undefined)
  );
  protected readonly views = computed(() =>
    this.items().map((tab) => ({
      tab,
      options: tab.exact === true ? EXACT : PREFIX,
    }))
  );
}
