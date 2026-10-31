import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { BacklogReadiness, RefinementSummary } from '@core/api/types';
import {
  readinessPresentation,
  readinessSummary,
  type FitPresentation,
} from '@domain/harness-fit';
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
import {
  isActiveRefinement,
  refinementLabel,
  refinementStateLabel,
} from '@domain/refinement';
import { BacklogRefinements } from './backlog-refinements';
import { RefinementDetails } from './refinement-details';
import { RefinementDialogs } from './refinement-dialogs';

/** How many backlog items one page asks for. */
export const DOCKS_PAGE_SIZE = 25;

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
];

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

interface SprintGroup {
  readonly id: string;
  readonly name: string;
  readonly sprint: BacklogSprint | null;
  readonly items: BacklogItem[];
}

const SPRINT_ORDER = { active: 0, future: 1, closed: 2 } as const;

/**
 * Backlog: every story of the team's Jira backlog, with its state in Ahoy beside it (lane 3C). The Ahoy column is real:
 * it joins each row with the voyages in the `StoriesStore`.
 */
@Component({
  selector: 'ah-docks',
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
    RefinementDetails,
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
    .docks__summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
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
          Every user story in the team's Jira backlog, grouped by sprint,
          including the ones that have never been started in Ahoy.
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
        <input
          class="ah-input docks__search"
          type="search"
          aria-label="Search the backlog"
          placeholder="Search by key or text"
          [formControl]="search"
        />
        <select
          class="ah-input docks__select"
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
          class="ah-input docks__select"
          aria-label="Jira status"
          [formControl]="jiraStatus"
        >
          <option value="">Jira status: all</option>
          @for (status of facets().jiraStatuses; track status) {
            <option [value]="status">{{ status }}</option>
          }
        </select>
        <select
          class="ah-input docks__select"
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
        <ah-section-tabs
          variant="pill"
          label="Ahoy state"
          [items]="scopeTabs"
          [(selected)]="scopeId"
        />
      </div>
      <div class="docks__summary">
        <span class="ah-muted" aria-live="polite">{{ summary() }}</span>
        @if (groups().length > 0) {
          <button
            ahButton="ghost"
            size="sm"
            type="button"
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
                } @else {
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
              <div class="docks__table">
                <table ahTable [attr.aria-label]="group.name">
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
                    @for (item of group.items; track item.key) {
                      <tr>
                        <td ahNowrap>
                          <span ahKey>{{ item.key }}</span>
                        </td>
                        <td>{{ item.summary }}</td>
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
                              @switch (trend(item)) {
                                @case ('up') {
                                  <path
                                    d="M2 8l4-4 4 4"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                  />
                                }
                                @case ('down') {
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
            </details>
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
    </div>
  `,
})
export class Docks {
  protected readonly port = inject(BACKLOG_PORT);
  protected readonly store = inject(StoriesStore);
  protected readonly refinements = inject(BacklogRefinements);
  private readonly config = inject(AppConfigStore);
  private readonly refinementDialogs = inject(RefinementDialogs);

  protected readonly scopeTabs = SCOPE_TABS;
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
    [...this.facets().sprints].sort(
      (a, b) => SPRINT_ORDER[a.state] - SPRINT_ORDER[b.state] || a.id - b.id
    )
  );
  protected readonly nextSprintId = computed(
    () => this.sprintOptions().find((sprint) => sprint.state === 'future')?.id
  );
  protected readonly groups = computed(() => {
    const groups = new Map<string, SprintGroup>();
    for (const item of this.items()) {
      const id = String(item.sprint?.id ?? 'no_sprint');
      const group = groups.get(id);
      if (group !== undefined) group.items.push(item);
      else
        groups.set(id, {
          id,
          name: item.sprint?.name ?? 'No sprint',
          sprint: item.sprint,
          items: [item],
        });
    }
    return [...groups.values()].sort(
      (a, b) =>
        (a.sprint === null ? 3 : SPRINT_ORDER[a.sprint.state]) -
          (b.sprint === null ? 3 : SPRINT_ORDER[b.sprint.state]) ||
        (a.sprint?.id ?? 0) - (b.sprint?.id ?? 0)
    );
  });
  private readonly openGroups = signal<Readonly<Record<string, boolean>>>({});
  private readonly openAll = signal<boolean | null>(null);
  protected readonly allCollapsed = computed(() =>
    this.groups().every((group) => !this.groupOpen(group))
  );

  /** Whether the list of voyages is in hand, so that a story missing from it really has no voyage. */
  protected readonly storeSettled = computed(
    () => this.store.status() === 'ready'
  );

  private readonly scope = computed<BacklogScope>(() => {
    const id = this.scopeId();
    return id === 'not_started' || id === 'in_ahoy' ? id : 'all';
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
    const keys = this.ahoyKeys();
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
    effect(() => {
      const query = this.query();
      untracked(() => void this.start(query));
    });
  }

  /** The arrow of an item's priority. */
  protected trend(item: BacklogItem): PriorityTrend {
    return priorityTrend(item.priority);
  }

  protected groupOpen(group: SprintGroup): boolean {
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

  protected inAhoy(group: SprintGroup): number {
    return group.items.filter((item) => this.store.find(item.key) !== undefined)
      .length;
  }

  protected doneInJira(group: SprintGroup): number {
    return group.items.filter(
      (item) => item.jiraStatus.trim().toLowerCase() === 'done'
    ).length;
  }

  /** The team's Jira issue page, or null (no link) when `/config.json` names no Jira. */
  protected jiraUrl(key: string): string | null {
    const base = this.config.config().jiraBaseUrl;
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
    // Refinements are joined locally: read all matching pages before filtering, not just the first 25 rows.
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
