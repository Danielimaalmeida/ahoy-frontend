import { Component, computed, effect, inject, input } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { apiErrorView } from "@core/commands/command-error";
import { Banner } from "@ui/banner/banner";
import { Button } from "@ui/button/button";
import { EmptyState } from "@ui/empty-state/empty-state";
import { Panel } from "@ui/panel/panel";
import { SectionTabs, type SectionTab } from "@ui/section-tabs/section-tabs";
import { Skeleton } from "@ui/skeleton/skeleton";
import { VOYAGE_TABS, VOYAGE_TAB_LABELS, type VoyageTab } from "../context/default-tab";
import { VoyageContext } from "../context/voyage-context";
import { AnchoredBanner } from "../header/anchored-banner";
import { VoyageHeader } from "../header/voyage-header";

/**
 * The voyage page at `/voyages/:key` (plan, lane 4A): breadcrumb, header, the Anchored banner when halted, the section
 * tabs (one URL each, with the counts) and the outlet the tabs render in. It provides the page's {@link VoyageContext},
 * which every tab injects. Until the story is read it shows the header's skeleton; a 404 shows "This voyage doesn't
 * exist" and any other failure "Lost contact with the harbour" with Try again.
 */
@Component({
  selector: "ah-voyage-shell",
  imports: [
    AnchoredBanner,
    Banner,
    Button,
    EmptyState,
    Panel,
    RouterLink,
    RouterOutlet,
    SectionTabs,
    Skeleton,
    VoyageHeader,
  ],
  providers: [VoyageContext],
  styleUrl: "./voyage-shell.scss",
  template: `
    <div class="voyage">
      <nav class="voyage__crumbs" aria-label="Breadcrumb">
        <a routerLink="/voyages">Voyages</a> / <span aria-current="page">{{ key() }}</span>
      </nav>
      @switch (context.status()) {
        @case ("ready") {
          <ah-voyage-header />
          <ah-anchored-banner />
          <ah-section-tabs label="Voyage sections" [items]="tabs()" />
          <router-outlet />
        }
        @case ("notFound") {
          <ah-panel>
            <ah-empty-state heading="This voyage doesn't exist"
              >There is no voyage {{ key() }}. It may have been mistyped.
              <a ahEmptyAction ahButton routerLink="/voyages">Go to Voyages</a>
            </ah-empty-state>
          </ah-panel>
        }
        @case ("error") {
          @if (errorView(); as e) {
            <ah-banner [variant]="e.variant" [heading]="e.heading" [tech]="e.tech ?? ''" icon="offline" announce="alert"
              >{{ e.text }}
              <span class="voyage__retry"
                ><button type="button" ahButton size="sm" (click)="retry()">Try again</button></span
              ></ah-banner
            >
          }
        }
        @default {
          <ah-panel>
            <div class="ah-panel__body voyage__skeleton" aria-busy="true">
              <span class="ah-sr" role="status">Loading the voyage…</span>
              <ah-skeleton width="30%" [height]="20" />
              <ah-skeleton width="55%" [height]="22" />
              <ah-skeleton width="85%" [height]="28" />
              <ah-skeleton width="65%" />
            </div>
          </ah-panel>
        }
      }
    </div>
  `,
})
export class VoyageShell {
  /** The Jira key from `/voyages/:key`. */
  readonly key = input.required<string>();

  protected readonly context = inject(VoyageContext);

  protected readonly tabs = computed((): readonly SectionTab[] => {
    const key = this.key();
    const counts: Partial<Record<VoyageTab, number | null>> = this.context.counts();
    return VOYAGE_TABS.map((tab) => ({
      id: tab,
      label: VOYAGE_TAB_LABELS[tab],
      link: ["/voyages", key, tab],
      ...(tab in counts ? { count: counts[tab] ?? null } : {}),
    }));
  });

  protected readonly errorView = computed(() => {
    const error = this.context.error();
    return error === null ? null : apiErrorView(error);
  });

  constructor() {
    effect(() => this.context.open(this.key()));
  }

  protected retry(): void {
    void this.context.refresh();
  }
}
