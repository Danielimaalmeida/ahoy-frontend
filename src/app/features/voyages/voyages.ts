import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ApiError } from '@core/api/api-error';
import type { Story } from '@core/api/types';
import { StoriesStore } from '@core/stores/stories-store';
import { Banner } from '@ui/banner/banner';
import { BudgetMeter } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { ownerLabel } from '@domain/identifiers';
import { PHASES } from '@domain/phases';
import { FilterChips, type StatusFilter } from '@ui/filter-chips/filter-chips';
import { Panel, PanelBody, PanelFoot } from '@ui/panel/panel';
import { PhaseStepper } from '@ui/phase-stepper/phase-stepper';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { SkeletonRows, type SkeletonColumn } from '@ui/skeleton/skeleton';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { Key, Nowrap, Table } from '@ui/table/table';
import { chipCounts, filterOf, matchesFilter, matchesQuery } from './filters';
import { noteFor } from './notes';
import { RowDetails } from './row-details';

/** How many rows the table shows at first, and how many more each "Load more" adds. */
const PAGE_SIZE = 50;

/**
 * The columns of the table, for its placeholder rows: the widths of the table's `<col>`s less the 14px gap between
 * tracks, so the placeholders sit where the cells will.
 */
const COLUMNS: readonly SkeletonColumn[] = [
  { track: '130px', height: 20 },
  { track: 'minmax(0, 1fr)' },
  { track: '116px' },
  { track: '136px', height: 5 },
  { track: '13%' },
  { track: '94px' },
  { track: '182px' },
  { track: '98px' },
];

/** What the table says when the filter leaves nothing, and what the person can do about it. */
interface Nothing {
  readonly heading: string;
  readonly text: string;
  readonly action: 'clear' | 'all';
}

const NOTHING_BY_STATUS: Readonly<
  Record<Exclude<StatusFilter, 'all'>, readonly [string, string]>
> = {
  ready: [
    'No queued voyages',
    'No voyage is waiting for the crew to pick it up.',
  ],
  running: ['Calm seas. No running voyages.', 'No agent is working right now.'],
  awaiting_input: [
    'No questions waiting',
    'No agent is waiting for an answer.',
  ],
  awaiting_decision: ['No orders waiting', 'No human gate is open.'],
  halted: ['No anchored voyages', 'Every voyage is moving or in port.'],
  blocked: [
    'No blocked voyages',
    'No voyage has run out of rework rounds or CI fixes.',
  ],
  terminal: ['No ended voyages', 'No voyage is done yet.'],
  cancelled: ['No cancelled voyages', 'Nobody has cancelled a voyage.'],
};

/** What the page says when the list cannot be read: the heading, the sentence and the technical line. */
interface Failure {
  readonly heading: string;
  readonly text: string;
  readonly tech: string;
}

/** Says why the list could not be read. An answer the app cannot read is a failure of tooling, never a verdict. */
function describeFailure(error: ApiError): Failure {
  const nothingLost =
    'Nothing you did was lost, and no voyage stopped because of this.';
  switch (error.kind) {
    case 'invalid_response':
      return {
        heading: 'Ahoy sent something unexpected',
        text: `Ahoy couldn't read the answer, so it shows nothing rather than guess. ${nothingLost}`,
        tech: `invalid_response · ${error.what}`,
      };
    case 'network':
      return {
        heading: "Can't reach Ahoy",
        text: `Ahoy couldn't load voyages. ${nothingLost}`,
        tech:
          error.status === undefined ? 'network' : `${error.status} · network`,
      };
    case 'problem': {
      const tech = `${error.status} · ${error.code}${error.instance === undefined ? '' : ` · request ${error.instance}`}`;
      return error.status === 401
        ? {
            heading: 'Sign-in needed',
            text: 'Ahoy needs you to sign in before it can show voyages.',
            tech,
          }
        : {
            heading: "Can't reach Ahoy",
            text: `Ahoy couldn't load voyages. ${nothingLost}`,
            tech,
          };
    }
  }
}

/**
 * Voyages (`/voyages`): every story, most recently updated first. The address is the state: `?status=` is the chip that
 * is pressed (anything but the six statuses and `blocked` reads as All) and `?q=` filters by key or title on the client
 * (deviation 3). The `StoriesStore` has the whole list and follows the stream; the table shows it 50 rows at a time.
 */
@Component({
  selector: 'ah-voyages',
  imports: [
    Banner,
    BudgetMeter,
    Button,
    EmptyState,
    FilterChips,
    Key,
    Nowrap,
    Panel,
    PanelBody,
    PanelFoot,
    PhaseStepper,
    RelativePipe,
    RouterLink,
    SkeletonRows,
    StatusBadge,
    Table,
  ],
  providers: [RowDetails],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .lead {
      margin: 4px 0 0;
    }
    /* The table scrolls inside this box on a phone instead of widening the page. The box is positioned so that the
       visually hidden text of a header (ah-sr is absolute) is clipped with it, not left at the table's far edge. */
    .scroll {
      position: relative;
      overflow-x: auto;
    }
    /* Fixed widths, so a note or an owner read after the rows does not push the other columns about. The fixed ones
       fit their widest content (a "Needs decision" badge, "implementation", the eight dots, "2044.8 / 3500", "23 h 59 m
       ago"); Note has a share and Voyage the rest. */
    .scroll table {
      min-width: 1180px;
      table-layout: fixed;
    }
    .col-status {
      width: 144px;
    }
    .col-phase {
      width: 130px;
    }
    .col-progress {
      width: 164px;
    }
    .col-note {
      width: 13%;
    }
    .col-owner {
      width: 108px;
    }
    .col-budget {
      width: 196px;
    }
    .col-updated {
      width: 112px;
    }
    /* A key never breaks across lines, and the title gets room to wrap beside it. */
    .voyage {
      min-width: 120px;
    }
    .voyage a {
      white-space: nowrap;
    }
    .retry {
      margin-top: 8px;
    }
    /* The three steps of a first voyage, side by side on a wide screen and one under the other on a phone. */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-3);
      max-width: 720px;
      margin: var(--space-2) auto 0;
      padding: 0;
      list-style: none;
      counter-reset: step;
    }
    .steps li {
      counter-increment: step;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
      font-size: 13px;
      color: var(--ink-soft);
    }
    .steps strong {
      color: var(--ink);
      font-size: 13px;
    }
    .steps strong::before {
      content: counter(step) '. ';
      color: var(--accent-text);
      font-family: var(--font-mono);
    }
  `,
  template: `
    <div>
      <h1>Voyages</h1>
      <p class="ah-muted lead">
        Every story in Ahoy, most recently updated first.
      </p>
    </div>

    @if (failure(); as problem) {
      <ah-banner
        variant="error"
        [heading]="problem.heading"
        [tech]="problem.tech"
      >
        {{ problem.text }}
        <button
          ahButton
          size="sm"
          type="button"
          class="retry"
          (click)="retry()"
        >
          Try again
        </button>
      </ah-banner>
    } @else {
      @if (!firstUse()) {
        <ah-filter-chips
          [counts]="counts()"
          [selected]="filter()"
          (selectedChange)="select($event)"
        />
      }

      <ah-panel>
        @if (!loaded()) {
          <ah-panel-body
            ><ah-skeleton-rows [rows]="6" [columns]="columns"
          /></ah-panel-body>
        } @else if (firstUse()) {
          <ah-empty-state heading="No voyages yet" icon="sail" size="page">
            A voyage takes one story from the backlog to a reviewed pull
            request. The crew does the work; you answer when they need you.
            <a ahButton="primary" ahEmptyAction routerLink="/voyages/new"
              >Start voyage</a
            >
            <a ahButton ahEmptyAction routerLink="/docks">Open backlog</a>
            <ol ahEmptyExtra class="steps" aria-label="How a voyage goes">
              <li>
                <strong>Pick a story</strong>From the backlog, or paste a Jira
                key.
              </li>
              <li>
                <strong>The crew sails</strong>Plan, build and review run on
                their own.
              </li>
              <li>
                <strong>You decide</strong>
                <span>Questions land in <a routerLink="/">Needs you</a>.</span>
              </li>
            </ol>
          </ah-empty-state>
        } @else {
          <div class="scroll" role="region" tabindex="0" aria-label="Voyages">
            <table ahTable>
              <colgroup>
                <col class="col-status" />
                <col />
                <col class="col-phase" />
                <col class="col-progress" />
                <col class="col-note" />
                <col class="col-owner" />
                <col class="col-budget" />
                <col class="col-updated" />
              </colgroup>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Voyage</th>
                  <th>Phase</th>
                  <th>Progress</th>
                  <th>Note</th>
                  <th>Owner</th>
                  <th>Budget (AIU)</th>
                  <th aria-sort="descending">
                    Updated <span aria-hidden="true">↓</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (row of tableRows(); track row.story.key) {
                  <tr>
                    <td ahNowrap>
                      <ah-status-badge
                        [status]="row.story.status"
                        [phase]="row.story.phase"
                      />
                    </td>
                    <td class="voyage">
                      <a ahKey [routerLink]="['/voyages', row.story.key]">{{
                        row.story.key
                      }}</a
                      >{{ row.story.title }}
                    </td>
                    <td class="ah-mono">{{ row.story.phase }}</td>
                    <td ahNowrap>
                      <ah-phase-stepper
                        compact
                        [phase]="row.story.phase"
                        [status]="row.story.status"
                        [stoppedAt]="row.stoppedAt"
                      />
                    </td>
                    <td>{{ row.note }}</td>
                    <td [title]="row.story.owner">
                      {{ ownerLabel(row.story) }}
                    </td>
                    <td ahNowrap>
                      <ah-budget-meter
                        variant="compact"
                        [width]="64"
                        [spentNanoAiu]="row.story.spentNanoAiu"
                        [capNanoAiu]="row.story.budgetNanoAiu"
                        [label]="'Budget of ' + row.story.key"
                      />
                    </td>
                    <td ahNowrap>{{ row.story.updatedAt | ahRelative }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (matches().length === 0) {
            @switch (nothing().action) {
              @case ('clear') {
                <ah-empty-state
                  [heading]="nothing().heading"
                  icon="waves"
                  size="compact"
                >
                  {{ nothing().text }}
                  <button
                    ahButton
                    ahEmptyAction
                    type="button"
                    (click)="clearSearch()"
                  >
                    Clear search
                  </button>
                </ah-empty-state>
              }
              @case ('all') {
                <ah-empty-state
                  [heading]="nothing().heading"
                  icon="waves"
                  size="compact"
                >
                  @if (lastFinished(); as last) {
                    The last one finished {{ last.updatedAt | ahRelative }}:
                    <a ahKey [routerLink]="['/voyages', last.key]">{{
                      last.key
                    }}</a
                    >{{ last.title }}.
                  } @else {
                    {{ nothing().text }}
                  }
                  <button
                    ahButton
                    ahEmptyAction
                    type="button"
                    (click)="showAll()"
                  >
                    Show all voyages
                  </button>
                  <a ahButton="soft" ahEmptyAction routerLink="/voyages/new"
                    >Start voyage</a
                  >
                </ah-empty-state>
              }
            }
          } @else {
            <ah-panel-foot>
              <span class="ah-muted"
                >Showing {{ rows().length }} of {{ matches().length }}</span
              >
              <button
                ahButton
                size="sm"
                type="button"
                [disabled]="rows().length >= matches().length"
                (click)="loadMore()"
              >
                Load more
              </button>
            </ah-panel-foot>
          }
        }
      </ah-panel>

      <p class="ah-hint">
        Progress runs {{ phases }}. Dark blue = passed, light blue = current,
        red = where it stopped.
      </p>
    }
  `,
})
export class VoyagesPage {
  /** The owner's name, or the q-number while the name is not known; the q-number is the cell's tooltip. */
  protected readonly ownerLabel = ownerLabel;
  /** `?status=`, bound from the address. It is untrusted: see {@link filterOf}. */
  readonly status = input<unknown>(undefined);
  /** `?q=`, bound from the address: the text to look for in keys and titles. */
  readonly q = input<unknown>(undefined);

  private readonly store = inject(StoriesStore);
  private readonly router = inject(Router);
  private readonly details = inject(RowDetails);

  protected readonly columns = COLUMNS;
  protected readonly phases = PHASES.join(' · ');
  protected readonly filter = computed(() => filterOf(this.status()));
  protected readonly query = computed(() => {
    const q = this.q();
    return typeof q === 'string' ? q : '';
  });

  /** Whether there is something to show: the list was read, or an earlier read is still in hand. */
  protected readonly loaded = computed(
    () => this.store.status() === 'ready' || this.store.stories().length > 0
  );

  protected readonly failure = computed((): Failure | null => {
    const error = this.store.error();
    return !this.loaded() && this.store.status() === 'error' && error !== null
      ? describeFailure(error)
      : null;
  });

  /** Whether the list was read and holds no voyage at all: the first use, which explains what a voyage is. */
  protected readonly firstUse = computed(
    () => this.loaded() && this.store.stories().length === 0
  );

  protected readonly counts = computed(() =>
    this.loaded() ? chipCounts(this.store.stories(), this.query()) : {}
  );

  /** The voyages the status and the search leave, most recently updated first. */
  protected readonly matches = computed(() => {
    const filter = this.filter();
    const query = this.query();
    return this.store
      .stories()
      .filter(
        (story) => matchesFilter(story, filter) && matchesQuery(story, query)
      );
  });

  /** How many rows show; it starts again at a page whenever the status or the search changes. */
  private readonly shown = linkedSignal({
    source: () => ({ filter: this.filter(), query: this.query() }),
    computation: () => PAGE_SIZE,
  });

  protected readonly rows = computed(() =>
    this.matches().slice(0, this.shown())
  );

  /** The rows on screen, each with its note and, for an aground voyage, the phase where it stopped. */
  protected readonly tableRows = computed(() =>
    this.rows().map((story) => ({
      story,
      note: noteFor(story, this.details.detail(story.key)),
      stoppedAt: this.details.stoppedAt(story),
    }))
  );

  protected readonly nothing = computed((): Nothing => {
    const query = this.query().trim();
    const filter = this.filter();
    if (query !== '') {
      return {
        heading: `No voyages match “${query}”`,
        text: 'Try a different key or title.',
        action: 'clear',
      };
    }
    // All with no search holds every voyage, so it is only empty on the first use, which has its own state.
    if (filter === 'all') {
      return { heading: 'No voyages', text: '', action: 'clear' };
    }
    const [heading, text] = NOTHING_BY_STATUS[filter];
    return { heading, text, action: 'all' };
  });

  /** With Running pressed and none running, the voyage that ended last, to say the crew is resting, not lost. */
  protected readonly lastFinished = computed((): Story | null => {
    if (this.filter() !== 'running' || this.query().trim() !== '') return null;
    let last: Story | null = null;
    for (const story of this.store.stories()) {
      if (!matchesFilter(story, 'terminal')) continue;
      if (
        last === null ||
        Date.parse(story.updatedAt) > Date.parse(last.updatedAt)
      )
        last = story;
    }
    return last;
  });

  constructor() {
    this.store.use(inject(DestroyRef));
    effect(() => this.details.sync(this.rows()));
  }

  protected select(value: StatusFilter): void {
    void this.router.navigate(['/voyages'], {
      queryParams: { status: value === 'all' ? null : value },
      queryParamsHandling: 'merge',
    });
  }

  protected showAll(): void {
    this.select('all');
  }

  protected clearSearch(): void {
    void this.router.navigate(['/voyages'], {
      queryParams: { q: null },
      queryParamsHandling: 'merge',
    });
  }

  protected loadMore(): void {
    this.shown.update((shown) => shown + PAGE_SIZE);
  }

  protected retry(): void {
    void this.store.loadAll();
  }
}
