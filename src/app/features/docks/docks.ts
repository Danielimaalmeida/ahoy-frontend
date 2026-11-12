import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { BacklogReadiness, RefinementSummary } from '@core/api/types';
import {
  readinessPresentation,
  readinessSummary,
  type FitPresentation,
} from '@domain/harness-fit';
import { ApiClient } from '@core/api/api-client';
import { AppConfigStore } from '@core/config/app-config';
import { StoriesStore } from '@core/stores/stories-store';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { SectionTabs, type SectionTab } from '@ui/section-tabs/section-tabs';
import {
  Skeleton,
  SkeletonRows,
  type SkeletonColumn,
} from '@ui/skeleton/skeleton';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { Api, Key, Nowrap, Table } from '@ui/table/table';
import {
  BACKLOG_PORT,
  type BacklogFacets,
  type BacklogItem,
  type BacklogQuery,
  type BacklogScope,
  type BacklogSprint,
} from './backlog-port';
import { compareSprints } from './sprint-order';
import {
  isActiveRefinement,
  refinementLabel,
  refinementStateLabel,
} from '@domain/refinement';
import { BacklogDefects } from './backlog-defects';
import { BacklogRefinements } from './backlog-refinements';
import { RefinementDetails } from './refinement-details';
import { RefinementDialogs } from './refinement-dialogs';

/** How many backlog items one page asks for. */
export const DOCKS_PAGE_SIZE = 100;

/** The value of the Assignee select that stands for "nobody": it cannot be an e-mail, which always has an `@`. */
export const UNASSIGNED = 'unassigned';

/** The arrow of a Jira priority: up for the urgent ones, down for the minor ones, a dash for the rest. */
export type PriorityTrend = 'up' | 'flat' | 'down';

/** Which arrow a Jira priority name gets. Jira's names are free text, so an unknown one is a dash. */
export function priorityTrend(priority: string): PriorityTrend {
  const name = priority.trim().toLowerCase();
  if (
    name === 'highest' ||
    name === 'high' ||
    name === 'critical' ||
    name === 'blocker'
  )
    return 'up';
  if (
    name === 'lowest' ||
    name === 'low' ||
    name === 'minor' ||
    name === 'trivial'
  )
    return 'down';
  return 'flat';
}

const SCOPE_TABS: readonly SectionTab[] = [
  { id: 'all', label: 'All' },
  { id: 'not_started', label: 'Not started' },
  { id: 'in_ahoy', label: 'In Ahoy' },
  { id: 'defects', label: 'Defects' },
];

/** How the backlog is laid out: one panel per sprint, or every story in one table. */
const LAYOUT_TABS: readonly SectionTab[] = [
  { id: 'sprint', label: 'By sprint' },
  { id: 'list', label: 'List' },
  { id: 'priority', label: 'By priority' },
];

/** Jira's usual priority names, most urgent first; a lane of any other name goes after them, by name. */
const PRIORITY_ORDER = [
  'blocker',
  'highest',
  'critical',
  'high',
  'major',
  'medium',
  'low',
  'minor',
  'lowest',
  'trivial',
];

/** Where a priority's lane goes: the known names in `PRIORITY_ORDER`, then the others, then no priority. */
function priorityRank(priority: string): number {
  const name = priority.trim().toLowerCase();
  if (name === '') return PRIORITY_ORDER.length + 1;
  const rank = PRIORITY_ORDER.indexOf(name);
  return rank === -1 ? PRIORITY_ORDER.length : rank;
}

const SKELETON_COLUMNS: readonly SkeletonColumn[] = [
  { track: '80px' },
  { track: 'minmax(0, 1fr)' },
  { track: '90px', height: 20 },
  { track: '70px' },
  { track: '130px' },
  { track: '60px' },
  { track: '110px', height: 20 },
  { track: '90px', height: 20 },
  { track: '110px', height: 20 },
];

const NO_FACETS: BacklogFacets = {
  jiraStatuses: [],
  assignees: [],
  sprints: [],
};

/** A collapsible lane of stories: one sprint, or one priority. */
interface Lane {
  readonly id: string;
  readonly name: string;
  /** The lane's sprint; null for "No sprint" and for priority lanes. */
  readonly sprint: BacklogSprint | null;
  /** The lane's Jira priority, or null for a sprint lane. */
  readonly priority: string | null;
  readonly items: BacklogItem[];
}

/**
 * Backlog: every story of the team's Jira backlog, with its state in Ahoy beside it (lane 3C). The Ahoy column is real:
 * it joins each row with the voyages in the `StoriesStore`.
 */
@Component({
  selector: 'ah-docks',
  imports: [
    NgTemplateOutlet,
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
    RefinementDetails,
    BacklogDefects,
  ],
  providers: [BacklogRefinements],
  styles: `
    :host {
      display: block;
    }
    /* The shell's main.page gives the width and the gutter; this only stacks the page's parts. */
    .docks {
      display: flex;
      flex-direction: column;
      gap: 14px;
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
    /* Their options arrive with the backlog: a fixed width keeps the row still when they do. */
    .docks__select--sprint {
      width: 240px;
    }
    .docks__select--status {
      width: 180px;
    }
    .docks__select--assignee {
      width: 220px;
    }
    .docks__views {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .docks__toggle-all {
      margin-left: auto;
    }
    /* Keeps its height while the backlog loads, so the results below do not move when the counts arrive. */
    .docks__summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      min-height: 32px;
    }
    .docks__item-sprint {
      display: block;
      margin-top: 2px;
      font-size: 12px;
    }
    .docks__table {
      min-width: 0;
    }
    .docks__results {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .docks__table table {
      table-layout: fixed;
      width: 100%;
    }
    .docks__table th {
      box-sizing: border-box;
      white-space: normal;
    }
    .docks__table td {
      padding-block: 6px;
      height: 24px;
      overflow-wrap: break-word;
      white-space: normal;
    }
    /* The ten widths add up to 100%: a column left without one collapses to ~0 under the fixed layout. */
    .docks__table th:nth-child(1) {
      width: 8%;
    }
    .docks__table th:nth-child(2) {
      width: 17%;
    }
    .docks__table th:nth-child(3) {
      width: 8%;
    }
    .docks__table th:nth-child(4) {
      width: 7%;
    }
    .docks__table th:nth-child(5) {
      width: 9%;
    }
    .docks__table th:nth-child(6) {
      width: 6%;
    }
    .docks__table th:nth-child(7) {
      width: 10%;
    }
    .docks__table th:nth-child(8) {
      width: 10%;
    }
    .docks__table th:nth-child(9) {
      width: 12%;
    }
    .docks__table th:nth-child(10) {
      width: 13%;
    }
    .docks__table .ah-tag {
      max-width: 100%;
      height: auto;
      min-height: 20px;
      white-space: normal;
    }
    .docks__sprint > summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      padding: 12px 16px;
    }
    .docks__sprint > summary::-webkit-details-marker {
      display: none;
    }
    .docks__sprint > summary:hover {
      background: var(--surface-raised);
    }
    .docks__sprint > summary:focus-visible {
      outline-offset: -2px;
      border-radius: var(--radius-lg);
    }
    .docks__sprint[open] > summary {
      border-bottom: 1px solid var(--line);
    }
    .docks__chevron {
      flex: none;
      color: var(--ink-muted);
      transition: transform 150ms ease-out;
    }
    .docks__sprint[open] .docks__chevron {
      transform: rotate(90deg);
    }
    .docks__sprint-name {
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: 15px;
      font-weight: 700;
    }
    .docks__sprint-state {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 0 8px;
      border-radius: var(--radius-pill);
      font-size: 11px;
      font-weight: 600;
      background: var(--surface-sunken);
      color: var(--ink-muted);
    }
    .docks__sprint-state--active {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .docks__sprint-description {
      flex: 1 1 260px;
    }
    .docks__sprint-meta {
      margin-left: auto;
      font-size: 12px;
    }
    .docks__sprint-meta b {
      color: var(--ink);
      font-weight: 600;
    }
    @media (prefers-reduced-motion: reduce) {
      .docks__chevron {
        transition: none;
      }
    }
    @media (max-width: 600px) {
      .docks__search {
        max-width: none;
      }
      .docks__sprint-meta {
        flex-basis: 100%;
        margin-left: 28px;
      }
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
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .docks__table .docks__actions {
      text-align: right;
    }
    .docks__refinement-toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 0;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    .docks__refinement-toggle:hover {
      text-decoration: underline;
    }
    .docks__fit--good {
      background: var(--status-done-bg);
      color: var(--status-done-fg);
    }
    .docks__fit--warn {
      background: var(--status-input-bg);
      color: var(--status-input-fg);
    }
    .docks__fit--bad {
      background: var(--status-halted-bg);
      color: var(--status-halted-fg);
    }
    .docks__refinement-toggle--refined {
      background: var(--status-done-bg);
      color: var(--status-done-fg);
    }
    .docks__refinement-toggle--active {
      background: var(--status-running-bg);
      color: var(--status-running-fg);
    }
    .docks__refinement-toggle--failed {
      background: var(--status-halted-bg);
      color: var(--status-halted-fg);
    }
    .docks__table .docks__refinement > td {
      padding: 16px;
    }
    .docks__actions > * {
      max-width: 100%;
      margin-block: 2px;
      height: auto;
      min-height: 28px;
      white-space: normal;
      overflow-wrap: normal;
      text-align: center;
    }
    .docks__actions > * + * {
      margin-inline-start: 6px;
    }
    @media (max-width: 1279px) {
      .docks__table table,
      .docks__table tbody {
        display: block;
      }
      .docks__table thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .docks__table tbody tr {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px 20px;
        padding: 16px;
        border-bottom: 1px solid var(--line-soft);
      }
      .docks__table tbody tr:last-child {
        border-bottom: 0;
      }
      .docks__table tbody tr.docks__refinement {
        display: block;
        padding: 0;
      }
      .docks__table td {
        display: block;
        min-width: 0;
        height: auto;
        padding: 0;
        border: 0;
      }
      .docks__table td[data-label]::before {
        content: attr(data-label);
        display: block;
        margin-bottom: 4px;
        color: var(--ink-muted);
        font-size: 11px;
        font-weight: 600;
      }
      .docks__table td:nth-child(1),
      .docks__table td:nth-child(2),
      .docks__table td:nth-child(9) {
        grid-column: 1 / -1;
      }
      .docks__table td:nth-child(2) {
        font-weight: 600;
      }
      .docks__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      .docks__actions > * {
        min-height: 44px;
        margin: 0;
      }
      .docks__actions > * + * {
        margin-inline-start: 0;
      }
    }
    @media (max-width: 600px) {
      .docks__table tbody tr {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .docks__table td:nth-child(8) {
        grid-column: 1 / -1;
      }
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
        <h1 class="docks__title">Backlog</h1>
        <div class="ah-muted">
          Every user story in the team's Jira backlog, by sprint, by priority or
          as one list, including the ones that have never been started in Ahoy.
        </div>
      </div>

      @if (port.planned) {
        <ah-banner
          variant="notice"
          icon="info"
          announce="off"
          heading="Planned screen."
        >
          The backlog is not in the API yet. This shows the intended layout; the
          "Ahoy" column links to voyages that already exist.
        </ah-banner>
      }

      @if (store.status() === 'error') {
        <ah-banner variant="error" heading="Could not read the voyages in Ahoy">
          The Ahoy column and the "Not started" and "In Ahoy" filters need them.
          <button ahButton size="sm" type="button" (click)="retryStories()">
            Try again
          </button>
        </ah-banner>
      }

      @if (refinements.status() === 'error') {
        <ah-banner variant="error" heading="Could not read the refinements">
          The rows don't show their refinements until they are read.
          <button ahButton size="sm" type="button" (click)="retryRefinements()">
            Try again
          </button>
        </ah-banner>
      }

      <div class="docks__filters">
        @if (!defectsOpen()) {
          <input
            class="ah-input docks__search"
            type="search"
            aria-label="Search the backlog"
            placeholder="Search by key or text"
            [formControl]="search"
          />
          <select
            class="ah-input docks__select docks__select--sprint"
            aria-label="Sprint"
            [formControl]="sprint"
          >
            <option value="">Sprint: all</option>
            @for (option of sprintOptions(); track option.id) {
              <option [value]="option.id">
                {{ option.name }} ({{ option.state }})
              </option>
            }
            <option value="no_sprint">No sprint</option>
          </select>
          <select
            class="ah-input docks__select docks__select--status"
            aria-label="Jira status"
            [formControl]="jiraStatus"
          >
            <option value="">Jira status: all</option>
            @for (status of facets().jiraStatuses; track status) {
              <option [value]="status">{{ status }}</option>
            }
          </select>
          <select
            class="ah-input docks__select docks__select--assignee"
            aria-label="Assignee"
            [formControl]="assignee"
          >
            <option value="">Assignee: anyone</option>
            @for (email of facets().assignees; track email) {
              <option [value]="email">{{ email }}</option>
            }
            <option [value]="unassigned">Unassigned</option>
          </select>
          <select
            class="ah-input docks__select"
            aria-label="Refinement"
            [formControl]="refinement"
          >
            <option value="">Refinement: any</option>
            <option value="refined">Refined</option>
            <option value="not_refined">Not refined</option>
            <option value="in_progress">In progress</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            class="ah-input docks__select"
            aria-label="Harness readiness"
            [formControl]="readiness"
          >
            <option value="">Harness: any</option>
            <option value="ready">Ready</option>
            <option value="attention">Check fit</option>
            <option value="missing">Not ready</option>
          </select>
        }
      </div>
      <div class="docks__views">
        <ah-section-tabs
          variant="pill"
          label="Ahoy state"
          [items]="scopeTabs"
          [(selected)]="scopeId"
        />
        @if (!defectsOpen()) {
          <ah-section-tabs
            variant="pill"
            label="Layout"
            [items]="layoutTabs"
            [(selected)]="layoutId"
          />
        }
      </div>
      @if (defectsOpen()) {
        <ah-backlog-defects />
      } @else {
        <div class="docks__summary">
          @if (!summaryReady() && !failed()) {
            <ah-skeleton width="220px" />
          }
          <span class="ah-muted" aria-live="polite">{{
            summaryReady() ? summary() : ''
          }}</span>
          @if (!listView()) {
            <button
              class="docks__toggle-all"
              ahButton="ghost"
              size="sm"
              type="button"
              [disabled]="groups().length === 0"
              (click)="toggleAll()"
            >
              {{ allCollapsed() ? 'Expand all' : 'Collapse all' }}
            </button>
          }
        </div>

        <section
          class="docks__results"
          aria-label="Backlog"
          [attr.aria-busy]="loading()"
        >
          @if (failed()) {
            <div class="ah-panel ah-panel__body">
              <ah-banner variant="error" heading="Could not read the backlog">
                Nothing you did is lost.
                <button ahButton size="sm" type="button" (click)="retry()">
                  Try again
                </button>
              </ah-banner>
            </div>
          } @else if (blocked()) {
            <ah-empty-state
              [heading]="
                refinementValue() !== '' && refinements.status() === 'error'
                  ? 'These filters need the refinements'
                  : 'These filters need the voyages from Ahoy'
              "
              icon="offline"
            >
              Try again above, or clear the filters.
              <button
                ahButton
                ahEmptyAction
                type="button"
                (click)="clearFilters()"
              >
                Clear filters
              </button>
            </ah-empty-state>
          } @else if (!loaded()) {
            <div class="ah-panel ah-panel__body">
              <ah-skeleton-rows [rows]="6" [columns]="skeletonColumns" />
            </div>
          } @else if (items().length === 0) {
            @if (filtered()) {
              <ah-empty-state heading="No stories match" icon="compass">
                Nothing in the backlog fits these filters.
                <button
                  ahButton
                  ahEmptyAction
                  type="button"
                  (click)="clearFilters()"
                >
                  Clear filters
                </button>
              </ah-empty-state>
            } @else {
              <ah-empty-state heading="The backlog is empty"
                >There are no stories in it to set sail on.</ah-empty-state
              >
            }
          } @else {
            <ng-template #storyTable let-items let-label="label">
              <div class="docks__table">
                <table ahTable [attr.aria-label]="label">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Summary</th>
                      <th>Jira status</th>
                      <th>Priority</th>
                      <th>Assignee</th>
                      <th>Updated</th>
                      <th>Refinement</th>
                      <th>Harness</th>
                      <th>Ahoy</th>
                      <th class="docks__actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of items; track item.key) {
                      <tr>
                        <td ahNowrap>
                          <span ahKey>{{ item.key }}</span>
                        </td>
                        <td>
                          {{ item.summary }}
                          @if (showSprint()) {
                            <span class="ah-muted docks__item-sprint">{{
                              item.sprint?.name ?? 'No sprint'
                            }}</span>
                          }
                        </td>
                        <td ahNowrap data-label="Jira status">
                          <span class="ah-tag">{{ item.jiraStatus }}</span>
                        </td>
                        <td ahNowrap data-label="Priority">
                          <span
                            class="docks__prio docks__prio--{{ trend(item) }}"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              aria-hidden="true"
                            >
                              <path
                                [attr.d]="arrows[trend(item)]"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                              />
                            </svg>
                            {{ item.priority }}
                          </span>
                        </td>
                        <td ahNowrap data-label="Assignee">
                          {{ item.assignee ?? 'Unassigned' }}
                        </td>
                        <td ahNowrap data-label="Updated">
                          {{ item.updatedAt | ahRelative }}
                        </td>
                        <td data-label="Refinement">
                          @if (refinements.latest(item.key); as refinement) {
                            <button
                              class="ah-tag docks__refinement-toggle"
                              [class.docks__refinement-toggle--refined]="
                                refinement.status === 'succeeded'
                              "
                              [class.docks__refinement-toggle--active]="
                                activeRefinement(refinement.status)
                              "
                              [class.docks__refinement-toggle--failed]="
                                refinementLabel(refinement.status) === 'Failed'
                              "
                              type="button"
                              [attr.aria-expanded]="
                                refinements.isOpen(item.key)
                              "
                              [attr.aria-controls]="
                                refinements.isOpen(item.key)
                                  ? refinementRowId(item.key)
                                  : null
                              "
                              [attr.aria-label]="
                                refinementStateLabel(refinement) +
                                ' for ' +
                                item.key
                              "
                              (click)="refinements.toggle(item.key)"
                            >
                              @if (refinement.status === 'succeeded') {
                                <span aria-hidden="true">✓</span>
                              }
                              {{ refinementStateLabel(refinement) }}
                            </button>
                          } @else if (refinements.status() === 'ready') {
                            <button
                              ahButton
                              size="sm"
                              type="button"
                              [attr.aria-label]="'Refine ' + item.key"
                              (click)="refine(item)"
                            >
                              Refine
                            </button>
                          } @else if (refinements.status() === 'error') {
                            <span class="ah-muted">Unknown</span>
                          } @else {
                            <ah-skeleton width="80px" [height]="20" />
                          }
                        </td>
                        <td ahNowrap data-label="Harness">
                          @if (item.readiness; as readiness) {
                            <span
                              class="ah-tag docks__fit--{{
                                readinessOf(readiness).tone
                              }}"
                              [attr.title]="readinessText(readiness)"
                              [attr.aria-label]="readinessText(readiness)"
                              >{{ readinessOf(readiness).label }}</span
                            >
                          } @else {
                            <span class="ah-muted">—</span>
                          }
                        </td>
                        <td ahNowrap data-label="Ahoy">
                          @if (store.find(item.key); as story) {
                            <a
                              class="docks__ahoy"
                              [routerLink]="['/voyages', item.key]"
                            >
                              <ah-status-badge
                                [status]="story.status"
                                [phase]="story.phase"
                              />&ngsp;
                              <span ahApi>{{ story.phase }}</span>
                            </a>
                          } @else if (storeSettled()) {
                            <span class="ah-tag ah-tag--outline"
                              >Not started</span
                            >
                          } @else if (store.status() === 'error') {
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
                              [attr.aria-label]="
                                'Open ' + item.key + ' in Jira (new tab)'
                              "
                              [href]="url"
                              >Jira ↗</a
                            >
                          }
                          @if (store.find(item.key)) {
                            <a
                              ahButton="soft"
                              size="sm"
                              [routerLink]="['/voyages', item.key]"
                              >Open voyage</a
                            >
                          } @else if (storeSettled()) {
                            <a
                              ahButton="primary"
                              size="sm"
                              routerLink="/voyages/new"
                              [queryParams]="{
                                key: item.key,
                                title: item.summary,
                              }"
                              >Start voyage</a
                            >
                          }
                        </td>
                      </tr>
                      @if (openRefinement(item.key); as refinement) {
                        <tr
                          class="docks__refinement"
                          [id]="refinementRowId(item.key)"
                        >
                          <td colspan="10">
                            <ah-refinement-details
                              [summary]="refinement"
                              [refinement]="refinements.newest(item.key)"
                              [failed]="
                                refinements.history(item.key)?.failed ?? false
                              "
                              (cancelRefinement)="cancelRefinement(refinement)"
                              (refineAgain)="refine(item)"
                              (retry)="refinements.readHistory(item.key)"
                            />
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            </ng-template>
            @if (listView()) {
              <div class="ah-panel">
                <ng-container
                  *ngTemplateOutlet="
                    storyTable;
                    context: { $implicit: items(), label: 'Backlog' }
                  "
                />
              </div>
            } @else {
              @for (group of groups(); track group.id) {
                <details
                  class="ah-panel docks__sprint"
                  [open]="groupOpen(group)"
                  (toggle)="onSprintToggle(group.id, $event)"
                >
                  <summary>
                    <svg
                      class="docks__chevron"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span class="docks__sprint-name">{{ group.name }}</span>
                    @if (group.sprint; as sprint) {
                      <span
                        class="docks__sprint-state"
                        [class.docks__sprint-state--active]="
                          sprint.state === 'active'
                        "
                      >
                        {{
                          sprint.state === 'active'
                            ? 'Active'
                            : sprint.state === 'future'
                              ? sprint.id === nextSprintId()
                                ? 'Next'
                                : 'Future'
                              : 'Closed'
                        }}
                      </span>
                    } @else if (group.priority === null) {
                      <span class="ah-muted docks__sprint-description"
                        >Stories in the backlog that no sprint has picked up
                        yet</span
                      >
                    }
                    <span class="ah-muted docks__sprint-meta">
                      <b>{{ group.items.length }}</b>
                      {{ group.items.length === 1 ? 'story' : 'stories' }}
                      @if (nextCursor() !== null) {
                        shown
                      }
                      @if (refinements.status() === 'ready') {
                        · <b>{{ refinedCount(group.items) }}</b> refined
                      }
                      @if (storeSettled()) {
                        · <b>{{ inAhoy(group) }}</b> in Ahoy
                      }
                      @if (doneInJira(group) > 0) {
                        · <b>{{ doneInJira(group) }}</b> done in Jira
                      }
                    </span>
                  </summary>
                  <ng-container
                    *ngTemplateOutlet="
                      storyTable;
                      context: { $implicit: group.items, label: group.name }
                    "
                  />
                </details>
              }
            }
            <div class="ah-panel__foot docks__foot">
              <span class="ah-muted"
                >Showing {{ items().length }} of {{ total() }} · no bulk start:
                every voyage needs its own budget</span
              >
              @if (nextCursor() !== null) {
                <button
                  ahButton
                  size="sm"
                  type="button"
                  [disabled]="loadingMore()"
                  (click)="loadMore()"
                >
                  Load more
                </button>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class Docks {
  protected readonly port = inject(BACKLOG_PORT);
  protected readonly store = inject(StoriesStore);
  protected readonly refinements = inject(BacklogRefinements);
  private readonly config = inject(AppConfigStore);
  private readonly api = inject(ApiClient);
  /** The Jira base URL set in Settings → Jira, or null while it is unread, off or not an http(s) URL. */
  private readonly settingsJiraBase = signal<string | null>(null);
  private readonly refinementDialogs = inject(RefinementDialogs);

  protected readonly scopeTabs = SCOPE_TABS;
  protected readonly layoutTabs = LAYOUT_TABS;
  /** The id of the selected layout pill: "sprint" groups the stories by sprint, "list" shows them in one table. */
  protected readonly layoutId = signal<string | null>('sprint');
  /** Whether every story is in one table, in the order the backlog is read (sprint order, then Jira's rank). */
  protected readonly listView = computed(() => this.layoutId() === 'list');
  /** Whether a row names its sprint, which only the sprint lanes already say. */
  protected readonly showSprint = computed(() => this.layoutId() !== 'sprint');
  protected readonly skeletonColumns = SKELETON_COLUMNS;
  protected readonly unassigned = UNASSIGNED;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly jiraStatus = new FormControl('', { nonNullable: true });
  protected readonly assignee = new FormControl('', { nonNullable: true });
  protected readonly sprint = new FormControl('', { nonNullable: true });
  protected readonly refinement = new FormControl('', { nonNullable: true });
  protected readonly readiness = new FormControl('', { nonNullable: true });
  /** The id of the selected pill; a button tab sets it. */
  protected readonly scopeId = signal<string | null>('all');

  private readonly searchText = toSignal(this.search.valueChanges, {
    initialValue: this.search.value,
  });
  private readonly jiraStatusValue = toSignal(this.jiraStatus.valueChanges, {
    initialValue: this.jiraStatus.value,
  });
  private readonly assigneeValue = toSignal(this.assignee.valueChanges, {
    initialValue: this.assignee.value,
  });
  private readonly sprintValue = toSignal(this.sprint.valueChanges, {
    initialValue: this.sprint.value,
  });
  protected readonly refinementValue = toSignal(this.refinement.valueChanges, {
    initialValue: this.refinement.value,
  });

  private readonly readinessValue = toSignal(this.readiness.valueChanges, {
    initialValue: this.readiness.value,
  });

  private readonly itemsSignal = signal<readonly BacklogItem[]>([]);
  private readonly totalSignal = signal(0);
  private readonly nextCursorSignal = signal<string | null>(null);
  private readonly facetsSignal = signal<BacklogFacets>(NO_FACETS);
  private readonly failedSignal = signal(false);
  private readonly loadedSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly loadingMoreSignal = signal(false);

  protected readonly items = computed(() =>
    this.itemsSignal().filter((item) => this.matchesRefinement(item.key))
  );
  protected readonly total = computed(() =>
    this.refinementValue() === '' ? this.totalSignal() : this.items().length
  );
  protected readonly nextCursor = this.nextCursorSignal.asReadonly();
  protected readonly facets = this.facetsSignal.asReadonly();
  protected readonly failed = this.failedSignal.asReadonly();
  protected readonly loaded = this.loadedSignal.asReadonly();
  protected readonly loading = this.loadingSignal.asReadonly();
  protected readonly loadingMore = this.loadingMoreSignal.asReadonly();
  protected readonly sprintOptions = computed(() =>
    [...this.facets().sprints].sort(compareSprints)
  );
  protected readonly nextSprintId = computed(
    () => this.sprintOptions().find((sprint) => sprint.state === 'future')?.id
  );
  protected readonly groups = computed(() =>
    this.layoutId() === 'priority' ? this.priorityLanes() : this.sprintLanes()
  );
  private readonly priorityLanes = computed(() => {
    const lanes = new Map<string, Lane>();
    for (const item of this.items()) {
      const priority = item.priority.trim();
      const id = `priority:${priority.toLowerCase()}`;
      const lane = lanes.get(id);
      if (lane !== undefined) lane.items.push(item);
      else
        lanes.set(id, {
          id,
          name: priority === '' ? 'No priority' : priority,
          sprint: null,
          priority,
          items: [item],
        });
    }
    return [...lanes.values()].sort(
      (a, b) =>
        priorityRank(a.priority ?? '') - priorityRank(b.priority ?? '') ||
        a.name.localeCompare(b.name)
    );
  });
  private readonly sprintLanes = computed(() => {
    const groups = new Map<string, Lane>();
    for (const item of this.items()) {
      const id = String(item.sprint?.id ?? 'no_sprint');
      const group = groups.get(id);
      if (group !== undefined) group.items.push(item);
      else
        groups.set(id, {
          id,
          name: item.sprint?.name ?? 'No sprint',
          sprint: item.sprint,
          priority: null,
          items: [item],
        });
    }
    return [...groups.values()].sort((a, b) =>
      compareSprints(a.sprint, b.sprint)
    );
  });
  private readonly openGroups = signal<Readonly<Record<string, boolean>>>({});
  private readonly openAll = signal<boolean | null>(null);
  protected readonly allCollapsed = computed(
    () =>
      this.groups().length > 0 &&
      this.groups().every((group) => !this.groupOpen(group))
  );
  /** Whether the counts above the results are all in hand, so the line appears once instead of growing piece by piece. */
  protected readonly summaryReady = computed(
    () =>
      this.loaded() &&
      this.refinements.status() !== 'loading' &&
      this.store.status() !== 'idle' &&
      this.store.status() !== 'loading'
  );

  /** Whether the list of voyages is in hand, so that a story missing from it really has no voyage. */
  protected readonly storeSettled = computed(
    () => this.store.status() === 'ready'
  );

  /** Whether the Defects pill is on: it shows the defect watch's list instead of the backlog. */
  protected readonly defectsOpen = computed(() => this.scopeId() === 'defects');

  /** The backlog's scope; while the Defects pill is on it keeps the last one, so the backlog stays as it was read. */
  private readonly scope = linkedSignal<string | null, BacklogScope>({
    source: this.scopeId,
    computation: (id, previous) => {
      if (id === 'defects') return previous?.value ?? 'all';
      return id === 'not_started' || id === 'in_ahoy' ? id : 'all';
    },
  });

  /** The "Not started" and "In Ahoy" filters cannot be applied while the voyages could not be read. */
  protected readonly blocked = computed(
    () =>
      (this.scope() !== 'all' && this.store.status() === 'error') ||
      (this.refinementValue() !== '' && this.refinements.status() === 'error')
  );

  /** The keys of the voyages in Ahoy as one string, so that a status change in the store does not read the backlog again. */
  private readonly ahoyKeys = computed(() =>
    this.store
      .stories()
      .map((story) => story.key)
      .sort()
      .join(',')
  );

  /**
   * What to read from the backlog, or `null` while it cannot be known: the "Not started" and "In Ahoy" filters need the
   * list of voyages, and a guess would show wrong rows.
   */
  private readonly query = computed<BacklogQuery | null>(() => {
    const scope = this.scope();
    if (this.refinementValue() !== '' && this.refinements.status() !== 'ready')
      return null;
    // Only the "Not started" and "In Ahoy" filters send the keys; reading them under "All" would read the backlog again
    // when the voyages arrive.
    const keys = scope === 'all' ? '' : this.ahoyKeys();
    if (scope !== 'all' && !this.storeSettled()) return null;
    const q = this.searchText().trim();
    const jiraStatus = this.jiraStatusValue();
    const assignee = this.assigneeValue();
    const sprint = this.sprintValue();
    const readiness = this.readinessValue();
    const parsedSprint = /^\d+$/.test(sprint) ? Number(sprint) : NaN;
    const sprintId = Number.isSafeInteger(parsedSprint)
      ? parsedSprint
      : undefined;
    return {
      ...(q !== '' ? { q } : {}),
      ...(jiraStatus !== '' ? { jiraStatus } : {}),
      ...(sprint === 'no_sprint'
        ? { sprintId: null }
        : sprintId !== undefined
          ? { sprintId }
          : {}),
      ...(assignee !== ''
        ? { assignee: assignee === UNASSIGNED ? null : assignee }
        : {}),
      ...(readiness === 'ready' ||
      readiness === 'attention' ||
      readiness === 'missing'
        ? { readiness }
        : {}),
      scope,
      ...(scope !== 'all'
        ? { ahoyKeys: keys === '' ? [] : keys.split(',') }
        : {}),
      limit: DOCKS_PAGE_SIZE,
    };
  });

  /** "9 stories · 5 in Ahoy": the matches of the filters, and how many voyages Ahoy has. */
  protected readonly summary = computed(() => {
    if (!this.loadedSignal()) return '';
    const total = this.total();
    const stories = `${total} ${total === 1 ? 'story' : 'stories'}`;
    const shown = this.nextCursor() !== null ? ' shown' : '';
    const refined =
      this.refinements.status() === 'ready'
        ? ` · ${this.refinedCount(this.items())} refined${shown}`
        : '';
    return this.storeSettled()
      ? `${stories}${refined} · ${this.items().filter((item) => this.store.find(item.key) !== undefined).length} in Ahoy${shown}`
      : `${stories}${refined}`;
  });

  /** Whether any filter is on, which tells "no matches" from "empty". */
  protected readonly filtered = computed(
    () =>
      this.searchText().trim() !== '' ||
      this.jiraStatusValue() !== '' ||
      this.assigneeValue() !== '' ||
      this.sprintValue() !== '' ||
      this.refinementValue() !== '' ||
      this.readinessValue() !== '' ||
      this.scope() !== 'all'
  );

  /** Counts reads, so that an answer to a query that was replaced meanwhile is dropped. */
  private generation = 0;

  constructor() {
    this.store.use(inject(DestroyRef));
    void this.refinements.load();
    void this.readJiraBase();
    effect(() => {
      const query = this.query();
      untracked(() => void this.start(query));
    });
  }

  /** The path of each priority arrow, in a 12 × 12 box. */
  protected readonly arrows: Readonly<Record<PriorityTrend, string>> = {
    up: 'M2 8l4-4 4 4',
    flat: 'M2 6h8',
    down: 'M2 4l4 4 4-4',
  };

  /** The arrow of an item's priority. */
  protected trend(item: BacklogItem): PriorityTrend {
    return priorityTrend(item.priority);
  }

  protected groupOpen(group: Lane): boolean {
    return (
      this.openGroups()[group.id] ??
      this.openAll() ??
      (group.sprint === null ||
        group.sprint.state === 'active' ||
        group.sprint.id === this.nextSprintId())
    );
  }

  protected onSprintToggle(id: string, event: Event): void {
    if (event.target instanceof HTMLDetailsElement) {
      const open = event.target.open;
      this.openGroups.update((groups) => ({ ...groups, [id]: open }));
    }
  }

  protected toggleAll(): void {
    this.openAll.set(this.allCollapsed());
    this.openGroups.set({});
  }

  protected inAhoy(group: Lane): number {
    return group.items.filter((item) => this.store.find(item.key) !== undefined)
      .length;
  }

  protected doneInJira(group: Lane): number {
    return group.items.filter(
      (item) => item.jiraStatus.trim().toLowerCase() === 'done'
    ).length;
  }

  /**
   * The issue's page in the team's Jira: the Jira connected in Settings, else `jiraBaseUrl` from `/config.json`, else
   * null (no link).
   */
  protected jiraUrl(key: string): string | null {
    const base = this.settingsJiraBase() ?? this.config.config().jiraBaseUrl;
    return base === undefined
      ? null
      : `${base}/browse/${encodeURIComponent(key)}`;
  }

  protected readonly activeRefinement = isActiveRefinement;
  protected readonly refinementLabel = refinementLabel;

  protected refinedCount(items: readonly BacklogItem[]): number {
    return items.filter(
      (item) => this.refinements.latest(item.key)?.status === 'succeeded'
    ).length;
  }

  private matchesRefinement(key: string): boolean {
    const filter = this.refinementValue();
    if (filter === '') return true;
    const latest = this.refinements.latest(key);
    if (filter === 'not_refined') return latest === null;
    if (latest === null) return false;
    if (filter === 'refined') return latest.status === 'succeeded';
    if (filter === 'in_progress') return isActiveRefinement(latest.status);
    if (filter === 'failed') return refinementLabel(latest.status) === 'Failed';
    return filter === 'cancelled' && latest.status === 'cancelled';
  }

  /** The words of a row's refinement button: "Refined", "Refining", "Cancelling"… */
  protected readonly refinementStateLabel = refinementStateLabel;

  /** The id of an item's refinement row, which its toggle controls. */
  protected refinementRowId(key: string): string {
    return `refinement-${key}`;
  }

  /** The newest refinement of an item whose refinement row is open, else null (the row is not shown). */
  protected openRefinement(key: string): RefinementSummary | null {
    return this.refinements.isOpen(key) ? this.refinements.latest(key) : null;
  }

  /** Opens "Refine PROJ-145?". */
  protected refine(item: BacklogItem): void {
    this.refinementDialogs.refine({
      key: item.key,
      summary: item.summary,
      refinements: this.refinements,
    });
  }

  /** Opens "Cancel the refinement of PROJ-145?". */
  protected cancelRefinement(refinement: RefinementSummary): void {
    this.refinementDialogs.cancel({
      refinement,
      refinements: this.refinements,
    });
  }

  /** The words and tone of an item's readiness for the harness. */
  protected readinessOf(readiness: BacklogReadiness): FitPresentation {
    return readinessPresentation(readiness.verdict);
  }

  /** The verdict with its reasons, for the tag's tooltip and screen readers. */
  protected readinessText(readiness: BacklogReadiness): string {
    return readinessSummary(readiness);
  }

  /** Reads the refinements again after they failed. */
  protected retryRefinements(): void {
    void this.refinements.load();
  }

  /** Turns every filter off. */
  protected clearFilters(): void {
    this.search.setValue('');
    this.jiraStatus.setValue('');
    this.assignee.setValue('');
    this.sprint.setValue('');
    this.refinement.setValue('');
    this.readiness.setValue('');
    this.scopeId.set('all');
  }

  /** Reads the Jira connected in Settings, for the issue links; a failure leaves the `/config.json` fallback. */
  private async readJiraBase(): Promise<void> {
    const result = await this.api.getJiraSettings();
    if (!result.ok || result.value.jira === null) return;
    const base = result.value.jira.connection.baseUrl;
    try {
      const { protocol } = new URL(base);
      if (protocol !== 'https:' && protocol !== 'http:') return;
    } catch {
      return;
    }
    let end = base.length;
    while (end > 0 && base[end - 1] === '/') end--;
    this.settingsJiraBase.set(base.slice(0, end));
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
    this.loadedSignal.set(false);
    let result = await this.port.list(query);
    const items: BacklogItem[] = [];
    // Refinements are joined locally: read all matching pages before filtering, not just the first page.
    while (result.ok) {
      items.push(...result.value.items);
      if (this.refinementValue() === '' || result.value.nextCursor === null)
        break;
      if (generation !== this.generation) return;
      result = await this.port.list({
        ...query,
        cursor: result.value.nextCursor,
      });
    }
    if (generation !== this.generation) return;
    this.loadingSignal.set(false);
    if (!result.ok) {
      this.itemsSignal.set([]);
      this.nextCursorSignal.set(null);
      this.loadedSignal.set(false);
      this.failedSignal.set(true);
      return;
    }
    this.itemsSignal.set(items);
    this.totalSignal.set(result.value.total);
    this.nextCursorSignal.set(result.value.nextCursor);
    this.facetsSignal.set(result.value.facets);
    this.loadedSignal.set(true);
  }
}
