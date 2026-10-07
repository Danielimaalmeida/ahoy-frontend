import { Component, DestroyRef, computed, effect, inject, signal, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AppConfigStore } from "@core/config/app-config";
import { StoriesStore } from "@core/stores/stories-store";
import { Banner } from "@ui/banner/banner";
import { Button } from "@ui/button/button";
import { EmptyState } from "@ui/empty-state/empty-state";
import { RelativePipe } from "@ui/pipes/relative.pipe";
import { SectionTabs, type SectionTab } from "@ui/section-tabs/section-tabs";
import { Skeleton, SkeletonRows, type SkeletonColumn } from "@ui/skeleton/skeleton";
import { StatusBadge } from "@ui/status-badge/status-badge";
import { Api, Key, Nowrap, Table } from "@ui/table/table";
import {
  BACKLOG_PORT,
  type BacklogFacets,
  type BacklogItem,
  type BacklogQuery,
  type BacklogScope,
} from "./backlog-port";

/** How many backlog items one page asks for. */
export const DOCKS_PAGE_SIZE = 25;

/** The value of the Assignee select that stands for "nobody": it cannot be an e-mail, which always has an `@`. */
export const UNASSIGNED = "unassigned";

/** The arrow of a Jira priority: up for the urgent ones, down for the minor ones, a dash for the rest. */
export type PriorityTrend = "up" | "flat" | "down";

/** Which arrow a Jira priority name gets. Jira's names are free text, so an unknown one is a dash. */
export function priorityTrend(priority: string): PriorityTrend {
  const name = priority.trim().toLowerCase();
  if (name === "highest" || name === "high" || name === "critical" || name === "blocker") return "up";
  if (name === "lowest" || name === "low" || name === "minor" || name === "trivial") return "down";
  return "flat";
}

const SCOPE_TABS: readonly SectionTab[] = [
  { id: "all", label: "All" },
  { id: "not_started", label: "Not started" },
  { id: "in_ahoy", label: "In Ahoy" },
];

const SKELETON_COLUMNS: readonly SkeletonColumn[] = [
  { track: "80px" },
  { track: "minmax(0, 1fr)" },
  { track: "60px" },
  { track: "90px", height: 20 },
  { track: "70px" },
  { track: "130px" },
  { track: "60px" },
  { track: "110px", height: 20 },
];

const NO_FACETS: BacklogFacets = { jiraStatuses: [], assignees: [] };

/**
 * The Docks: every story of the team's Jira backlog, with its state in Ahoy beside it (lane 3C). **A planned screen:** the
 * API has no backlog, so the rows come from the `BACKLOG_PORT` (today a stub) and a banner says so. The Ahoy column is real:
 * it joins each row with the voyages in the `StoriesStore`.
 */
@Component({
  selector: "ah-docks",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Banner,
    Button,
    EmptyState,
    SectionTabs,
    Skeleton,
    SkeletonRows,
    StatusBadge,
    RelativePipe,
    Table,
    Nowrap,
    Key,
    Api,
  ],
  styles: `
    /* The shell does not give pages a gutter yet (lane 3A); this is the Docks wireframe's own page box. */
    :host {
      display: block;
    }
    .docks {
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-sizing: border-box;
      width: 100%;
      max-width: 1360px;
      margin: 0 auto;
      padding: 22px 24px 36px;
    }
    .docks__title {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .docks__filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .docks__search {
      flex: 1 1 280px;
      max-width: 360px;
      width: auto;
    }
    .docks__select {
      width: auto;
      max-width: 100%;
    }
    .docks__spacer {
      flex: 1;
    }
    .docks__table {
      overflow-x: auto;
    }
    .docks__prio {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .docks__prio svg {
      flex: none;
    }
    .docks__prio--up {
      color: var(--status-input-fg);
    }
    .docks__prio--flat {
      color: var(--ink-muted);
    }
    .docks__prio--down {
      color: var(--accent-text);
    }
    .docks__ahoy {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .docks__actions {
      text-align: right;
    }
    .docks__foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
  `,
  template: `
    <div class="docks">
      <div>
        <h1 class="docks__title">The Docks</h1>
        <div class="ah-muted">
          Every user story in the team's Jira backlog, including the ones that have never set sail in Ahoy.
        </div>
      </div>

      @if (port.planned) {
        <ah-banner variant="notice" icon="info" announce="off" heading="Planned screen.">
          The backlog is not in the API yet. This shows the intended layout; the "Ahoy" column links to voyages that
          already exist.
        </ah-banner>
      }

      @if (store.status() === "error") {
        <ah-banner variant="error" heading="Could not read the voyages in Ahoy">
          The Ahoy column and the "Not started" and "In Ahoy" filters need them.
          <button ahButton size="sm" type="button" (click)="retryStories()">Try again</button>
        </ah-banner>
      }

      <div class="docks__filters">
        <input
          class="ah-input docks__search"
          type="search"
          aria-label="Search the backlog"
          placeholder="Search by key or text"
          [formControl]="search"
        />
        <select class="ah-input docks__select" aria-label="Jira status" [formControl]="jiraStatus">
          <option value="">Jira status: all</option>
          @for (status of facets().jiraStatuses; track status) {
            <option [value]="status">{{ status }}</option>
          }
        </select>
        <select class="ah-input docks__select" aria-label="Assignee" [formControl]="assignee">
          <option value="">Assignee: anyone</option>
          @for (email of facets().assignees; track email) {
            <option [value]="email">{{ email }}</option>
          }
          <option [value]="unassigned">Unassigned</option>
        </select>
        <ah-section-tabs variant="pill" label="Ahoy state" [items]="scopeTabs" [(selected)]="scopeId" />
        <span class="docks__spacer"></span>
        <span class="ah-muted" aria-live="polite">{{ summary() }}</span>
      </div>

      <section class="ah-panel" aria-label="Backlog" [attr.aria-busy]="loading()">
        @if (failed()) {
          <div class="ah-panel__body">
            <ah-banner variant="error" heading="Could not read the backlog">
              Nothing you did is lost.
              <button ahButton size="sm" type="button" (click)="retry()">Try again</button>
            </ah-banner>
          </div>
        } @else if (blocked()) {
          <ah-empty-state heading="These filters need the voyages from Ahoy" icon="offline">
            Try again above, or switch to "All".
          </ah-empty-state>
        } @else if (!loaded()) {
          <div class="ah-panel__body"><ah-skeleton-rows [rows]="6" [columns]="skeletonColumns" /></div>
        } @else if (items().length === 0) {
          @if (filtered()) {
            <ah-empty-state heading="No stories match" icon="compass">
              Nothing in the backlog fits these filters.
              <button ahButton ahEmptyAction type="button" (click)="clearFilters()">Clear filters</button>
            </ah-empty-state>
          } @else {
            <ah-empty-state heading="The backlog is empty">There are no stories in it to set sail on.</ah-empty-state>
          }
        } @else {
          <div class="docks__table">
            <table ahTable>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Summary</th>
                  <th>Type</th>
                  <th>Jira status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Updated</th>
                  <th>Ahoy</th>
                  <th class="docks__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.key) {
                  <tr>
                    <td ahNowrap>
                      <span ahKey>{{ item.key }}</span>
                    </td>
                    <td>{{ item.summary }}</td>
                    <td>{{ item.type }}</td>
                    <td ahNowrap>
                      <span class="ah-tag">{{ item.jiraStatus }}</span>
                    </td>
                    <td ahNowrap>
                      <span class="docks__prio docks__prio--{{ trend(item) }}">
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                          @switch (trend(item)) {
                            @case ("up") {
                              <path
                                d="M2 8l4-4 4 4"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                              />
                            }
                            @case ("down") {
                              <path
                                d="M2 4l4 4 4-4"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                              />
                            }
                            @default {
                              <path
                                d="M2 6h8"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                              />
                            }
                          }
                        </svg>
                        {{ item.priority }}
                      </span>
                    </td>
                    <td ahNowrap>{{ item.assignee ?? "Unassigned" }}</td>
                    <td ahNowrap>{{ item.updatedAt | ahRelative }}</td>
                    <td ahNowrap>
                      @if (store.find(item.key); as story) {
                        <a class="docks__ahoy" [routerLink]="['/voyages', item.key]">
                          <ah-status-badge [status]="story.status" [phase]="story.phase" />&ngsp;
                          <span ahApi>{{ story.phase }}</span>
                        </a>
                      } @else if (storeSettled()) {
                        <span class="ah-tag ah-tag--outline">Not started</span>
                      } @else if (store.status() === "error") {
                        <span class="ah-tag ah-tag--outline">Unknown</span>
                      } @else {
                        <ah-skeleton width="90px" [height]="20" />
                      }
                    </td>
                    <td ahNowrap class="docks__actions">
                      @if (jiraUrl(item.key); as url) {
                        <a
                          ahButton="ghost"
                          size="sm"
                          title="Open in Jira"
                          target="_blank"
                          rel="noopener noreferrer"
                          [href]="url"
                          >Jira ↗</a
                        >
                      }
                      @if (store.find(item.key)) {
                        <a ahButton="soft" size="sm" [routerLink]="['/voyages', item.key]">Open voyage</a>
                      } @else if (storeSettled()) {
                        <a
                          ahButton="primary"
                          size="sm"
                          routerLink="/voyages/new"
                          [queryParams]="{ key: item.key, title: item.summary }"
                          >Set sail</a
                        >
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="ah-panel__foot docks__foot">
            <span class="ah-muted"
              >Showing {{ items().length }} of {{ total() }} · no bulk start: every voyage needs its own budget</span
            >
            @if (nextCursor() !== null) {
              <button ahButton size="sm" type="button" [disabled]="loadingMore()" (click)="loadMore()">
                Load more
              </button>
            }
          </div>
        }
      </section>
    </div>
  `,
})
export class Docks {
  protected readonly port = inject(BACKLOG_PORT);
  protected readonly store = inject(StoriesStore);
  private readonly config = inject(AppConfigStore);

  protected readonly scopeTabs = SCOPE_TABS;
  protected readonly skeletonColumns = SKELETON_COLUMNS;
  protected readonly unassigned = UNASSIGNED;

  protected readonly search = new FormControl("", { nonNullable: true });
  protected readonly jiraStatus = new FormControl("", { nonNullable: true });
  protected readonly assignee = new FormControl("", { nonNullable: true });
  /** The id of the selected pill; a button tab sets it. */
  protected readonly scopeId = signal<string | null>("all");

  private readonly searchText = toSignal(this.search.valueChanges, { initialValue: this.search.value });
  private readonly jiraStatusValue = toSignal(this.jiraStatus.valueChanges, { initialValue: this.jiraStatus.value });
  private readonly assigneeValue = toSignal(this.assignee.valueChanges, { initialValue: this.assignee.value });

  private readonly itemsSignal = signal<readonly BacklogItem[]>([]);
  private readonly totalSignal = signal(0);
  private readonly nextCursorSignal = signal<string | null>(null);
  private readonly facetsSignal = signal<BacklogFacets>(NO_FACETS);
  private readonly failedSignal = signal(false);
  private readonly loadedSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly loadingMoreSignal = signal(false);

  protected readonly items = this.itemsSignal.asReadonly();
  protected readonly total = this.totalSignal.asReadonly();
  protected readonly nextCursor = this.nextCursorSignal.asReadonly();
  protected readonly facets = this.facetsSignal.asReadonly();
  protected readonly failed = this.failedSignal.asReadonly();
  protected readonly loaded = this.loadedSignal.asReadonly();
  protected readonly loading = this.loadingSignal.asReadonly();
  protected readonly loadingMore = this.loadingMoreSignal.asReadonly();

  /** Whether the list of voyages is in hand, so that a story missing from it really has no voyage. */
  protected readonly storeSettled = computed(() => this.store.status() === "ready");

  private readonly scope = computed<BacklogScope>(() => {
    const id = this.scopeId();
    return id === "not_started" || id === "in_ahoy" ? id : "all";
  });

  /** The "Not started" and "In Ahoy" filters cannot be applied while the voyages could not be read. */
  protected readonly blocked = computed(() => this.scope() !== "all" && this.store.status() === "error");

  /** The keys of the voyages in Ahoy as one string, so that a status change in the store does not read the backlog again. */
  private readonly ahoyKeys = computed(() =>
    this.store
      .stories()
      .map((story) => story.key)
      .sort()
      .join(","),
  );

  /**
   * What to read from the backlog, or `null` while it cannot be known: the "Not started" and "In Ahoy" filters need the
   * list of voyages, and a guess would show wrong rows.
   */
  private readonly query = computed<BacklogQuery | null>(() => {
    const scope = this.scope();
    const keys = this.ahoyKeys();
    if (scope !== "all" && !this.storeSettled()) return null;
    const q = this.searchText().trim();
    const jiraStatus = this.jiraStatusValue();
    const assignee = this.assigneeValue();
    return {
      ...(q !== "" ? { q } : {}),
      ...(jiraStatus !== "" ? { jiraStatus } : {}),
      ...(assignee !== "" ? { assignee: assignee === UNASSIGNED ? null : assignee } : {}),
      scope,
      ...(scope !== "all" ? { ahoyKeys: keys === "" ? [] : keys.split(",") } : {}),
      limit: DOCKS_PAGE_SIZE,
    };
  });

  /** "9 stories · 5 in Ahoy": the matches of the filters, and how many voyages Ahoy has. */
  protected readonly summary = computed(() => {
    if (!this.loadedSignal()) return "";
    const total = this.totalSignal();
    const stories = `${total} ${total === 1 ? "story" : "stories"}`;
    return this.storeSettled() ? `${stories} · ${this.store.stories().length} in Ahoy` : stories;
  });

  /** Whether any filter is on, which tells "no matches" from "empty". */
  protected readonly filtered = computed(
    () =>
      this.searchText().trim() !== "" ||
      this.jiraStatusValue() !== "" ||
      this.assigneeValue() !== "" ||
      this.scope() !== "all",
  );

  /** Counts reads, so that an answer to a query that was replaced meanwhile is dropped. */
  private generation = 0;

  constructor() {
    this.store.use(inject(DestroyRef));
    effect(() => {
      const query = this.query();
      untracked(() => void this.start(query));
    });
  }

  /** The arrow of an item's priority. */
  protected trend(item: BacklogItem): PriorityTrend {
    return priorityTrend(item.priority);
  }

  /** The Jira page of a story, or `null` when no Jira is configured (G13): the button is not shown then. */
  protected jiraUrl(key: string): string | null {
    const base = this.config.config().jiraBaseUrl;
    return base === undefined ? null : `${base}/browse/${encodeURIComponent(key)}`;
  }

  /** Turns every filter off. */
  protected clearFilters(): void {
    this.search.setValue("");
    this.jiraStatus.setValue("");
    this.assignee.setValue("");
    this.scopeId.set("all");
  }

  /** Reads the list of voyages again after it failed. */
  protected retryStories(): void {
    void this.store.loadAll();
  }

  /** Reads the backlog again after it failed. */
  protected retry(): void {
    void this.start(this.query());
  }

  /** Appends the next page to the rows. */
  protected async loadMore(): Promise<void> {
    const query = this.query();
    const cursor = this.nextCursorSignal();
    if (query === null || cursor === null || this.loadingMoreSignal()) return;
    const generation = this.generation;
    this.loadingMoreSignal.set(true);
    const result = await this.port.list({ ...query, cursor });
    if (generation !== this.generation) return;
    this.loadingMoreSignal.set(false);
    if (!result.ok) {
      this.failedSignal.set(true);
      return;
    }
    this.itemsSignal.update((items) => [...items, ...result.value.items]);
    this.totalSignal.set(result.value.total);
    this.nextCursorSignal.set(result.value.nextCursor);
    this.facetsSignal.set(result.value.facets);
  }

  /** Reads the first page of a query; `null` (the voyages are not known yet) clears the rows and waits. */
  private async start(query: BacklogQuery | null): Promise<void> {
    const generation = ++this.generation;
    this.loadingMoreSignal.set(false);
    this.failedSignal.set(false);
    if (query === null) {
      this.itemsSignal.set([]);
      this.nextCursorSignal.set(null);
      this.loadedSignal.set(false);
      this.loadingSignal.set(false);
      return;
    }
    this.loadingSignal.set(true);
    const result = await this.port.list(query);
    if (generation !== this.generation) return;
    this.loadingSignal.set(false);
    if (!result.ok) {
      this.itemsSignal.set([]);
      this.nextCursorSignal.set(null);
      this.loadedSignal.set(false);
      this.failedSignal.set(true);
      return;
    }
    this.itemsSignal.set(result.value.items);
    this.totalSignal.set(result.value.total);
    this.nextCursorSignal.set(result.value.nextCursor);
    this.facetsSignal.set(result.value.facets);
    this.loadedSignal.set(true);
  }
}
