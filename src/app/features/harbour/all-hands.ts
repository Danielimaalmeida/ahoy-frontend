import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApiError } from '@core/api/api-error';
import { StoriesStore } from '@core/stores/stories-store';
import { ownerLabel } from '@domain/identifiers';
import { AGROUND, type BoardStatus } from '@domain/status';
import type { Phase, StoryStatus } from '@domain/types';
import { Banner } from '@ui/banner/banner';
import { BudgetMeter } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelHead } from '@ui/panel/panel';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { CellSub, Key, Nowrap, Table } from '@ui/table/table';
import { atSeaCrew, canUnblock, needsAction, whatsNeeded } from './needs';
import { RowDetails } from './row-details';

/**
 * The four tiles: the board statuses that wait on a person, each with what it means. Each links to its chip on the
 * Voyages board (`filter`); its badge is the API status and phase the voyages have.
 */
const TILES: readonly {
  readonly filter: BoardStatus;
  readonly status: StoryStatus;
  readonly phase: Phase | null;
  readonly hint: string;
}[] = [
  {
    filter: 'awaiting_input',
    status: 'awaiting_input',
    phase: null,
    hint: 'Agent questions to answer',
  },
  {
    filter: 'awaiting_decision',
    status: 'awaiting_decision',
    phase: null,
    hint: 'Human gates waiting on a decision',
  },
  {
    filter: 'halted',
    status: 'halted',
    phase: null,
    hint: 'Halted until someone resumes',
  },
  {
    filter: AGROUND,
    status: 'terminal',
    phase: 'blocked',
    hint: 'Out of rework rounds, or rejected at a gate',
  },
];

/** How many placeholder rows each table shows while the first read is under way. */
const PLACEHOLDER_ROWS = {
  needs: [0, 1, 2, 3],
  sea: [0, 1],
} as const;

/** The widths text-like placeholder bars cycle through from one row to the next, so the rows do not look stamped. */
const BAR_WIDTHS = ['85%', '65%', '75%'] as const;

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
 * All hands (`/`): the voyages waiting on a person, longest wait first, and the ones the crew is working on. It reads
 * the `StoriesStore`, which follows the event stream, so a voyage moves between the two panels on its own.
 */
@Component({
  selector: 'ah-all-hands',
  imports: [
    Banner,
    BudgetMeter,
    Button,
    CellSub,
    EmptyState,
    Key,
    Nowrap,
    Panel,
    PanelHead,
    RelativePipe,
    RouterLink,
    Skeleton,
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
    .tiles {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .tile {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      color: var(--ink);
      text-decoration: none;
    }
    .tile:hover {
      border-color: var(--accent);
    }
    /* The count keeps its box while it loads, so the badge beside it never moves. */
    .tile__count {
      flex: none;
      display: flex;
      align-items: center;
      height: 30px;
    }
    .tile b {
      font-size: 30px;
      line-height: 1;
      font-weight: 700;
    }
    .tile__hint {
      margin-top: 4px;
    }
    /* The table scrolls inside this box on a phone instead of widening the page. The box is positioned so that the
       visually hidden text of a header (ah-sr is absolute) is clipped with it, not left at the table's far edge. */
    .scroll {
      position: relative;
      overflow-x: auto;
    }
    /* The columns have fixed widths and every row of "Needs you" a fixed height, from the first placeholder to the
       last live update: what loads later (questions, gates, halts, diagnoses, runs) fills the space kept for it and
       moves nothing. "What's needed" takes what the other columns leave. */
    .scroll table {
      min-width: 1000px;
      table-layout: fixed;
    }
    .c-status {
      width: 144px;
    }
    .c-voyage {
      width: 200px;
    }
    .c-phase {
      width: 128px;
    }
    .c-owner {
      width: 160px;
    }
    .c-when {
      width: 100px;
    }
    .c-budget {
      width: 164px;
    }
    .c-action {
      width: 152px;
    }
    td {
      line-height: 18px;
    }
    /* A short cell keeps to one line and ends in an ellipsis rather than widening its column. */
    .clip {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    /* Three lines in every row of "Needs you": the voyage's title wraps into them; "What's needed" puts its sentence
       in the first and its detail in the other two, or the detail in one and a halted voyage's diagnosis, read after
       the list, in the last. */
    .rows3 {
      height: 56px;
      overflow: hidden;
    }
    .title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .title--one {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
    .voyage a {
      white-space: nowrap;
    }
    .line {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .line--head {
      line-height: 20px;
    }
    .line--two {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .placeholder .rows3 {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
    }
    .retry {
      margin-top: 8px;
    }
    @media (max-width: 1024px) {
      .tiles {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 720px) {
      .tiles {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <div>
      <h1>Needs you</h1>
      <p class="ah-muted lead">
        Voyages waiting on a person. Anyone on the crew may answer, approve,
        send back or stop. Only the owner is billed.
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
      <div class="tiles">
        @for (tile of tiles; track tile.filter) {
          <a
            class="tile"
            routerLink="/voyages"
            [queryParams]="{ status: tile.filter }"
          >
            <span class="tile__count">
              @if (loaded()) {
                <b>{{ counts()[tile.filter] }}</b>
              } @else {
                <ah-skeleton width="18px" [height]="30" />
              }
            </span>
            <div>
              <ah-status-badge [status]="tile.status" [phase]="tile.phase" />
              <div class="ah-muted tile__hint">{{ tile.hint }}</div>
            </div>
          </a>
        }
      </div>

      <ah-panel>
        <ah-panel-head heading="Needs you" [subtitle]="needsSubtitle()" />
        @if (loaded() && needsYou().length === 0) {
          <ah-empty-state heading="Calm seas">
            Nothing needs you right now. Questions, decisions, halted voyages
            and blocked ones you can unblock show up here.
            <a ahButton ahEmptyAction routerLink="/voyages">See all voyages</a>
          </ah-empty-state>
        } @else {
          <div
            class="scroll"
            role="region"
            tabindex="0"
            aria-label="Voyages that need you"
          >
            <table ahTable [attr.aria-busy]="loaded() ? null : 'true'">
              <colgroup>
                <col class="c-status" />
                <col class="c-voyage" />
                <col class="c-phase" />
                <col />
                <col class="c-owner" />
                <col class="c-when" />
                <col class="c-budget" />
                <col class="c-action" />
              </colgroup>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Voyage</th>
                  <th>Phase</th>
                  <th>What's needed</th>
                  <th>Owner</th>
                  <th>Waiting</th>
                  <th>Budget (AIU)</th>
                  <th><span class="ah-sr">Action</span></th>
                </tr>
              </thead>
              <tbody>
                @if (!loaded()) {
                  @for (i of placeholderRows.needs; track i) {
                    <tr class="placeholder">
                      <td><ah-skeleton width="110px" [height]="20" /></td>
                      <td>
                        <div class="rows3">
                          <ah-skeleton [width]="barWidth(i)" />
                          <ah-skeleton [width]="barWidth(i + 2)" />
                        </div>
                      </td>
                      <td><ah-skeleton width="70%" /></td>
                      <td>
                        <div class="rows3">
                          <ah-skeleton [width]="barWidth(i)" />
                          <ah-skeleton [width]="barWidth(i + 1)" />
                          <ah-skeleton [width]="barWidth(i + 2)" />
                        </div>
                      </td>
                      <td><ah-skeleton width="75%" /></td>
                      <td><ah-skeleton width="65%" /></td>
                      <td><ah-skeleton width="70px" /></td>
                      <td><ah-skeleton width="96px" [height]="28" /></td>
                    </tr>
                  }
                } @else {
                  @for (row of needsRows(); track row.story.key) {
                    <tr>
                      <td class="clip">
                        <ah-status-badge
                          [status]="row.story.status"
                          [phase]="row.story.phase"
                        />
                      </td>
                      <td class="voyage">
                        <div class="rows3">
                          <div class="title" [title]="row.story.title">
                            <a
                              ahKey
                              [routerLink]="['/voyages', row.story.key]"
                              >{{ row.story.key }}</a
                            >{{ row.story.title }}
                          </div>
                        </div>
                      </td>
                      <td class="ah-mono clip">{{ row.story.phase }}</td>
                      <td>
                        <div class="rows3">
                          <span
                            class="line line--head"
                            [title]="row.needed.headline"
                            >{{ row.needed.headline }}</span
                          >
                          @if (row.needed.sub; as sub) {
                            <small
                              ahCellSub
                              class="line"
                              [class.line--two]="!row.needed.diagnosis"
                              [title]="sub"
                              >{{ sub }}</small
                            >
                          }
                          @if (row.needed.diagnosis; as diagnosis) {
                            <small
                              ahCellSub
                              class="line need__diagnosis"
                              [title]="diagnosis"
                              >Diagnosis: {{ diagnosis }}</small
                            >
                          }
                        </div>
                      </td>
                      <td class="clip" [title]="row.story.owner">
                        {{ ownerLabel(row.story) }}
                      </td>
                      <td class="clip">
                        {{ row.story.updatedAt | ahRelative: 'waiting' }}
                      </td>
                      <td class="clip">
                        <ah-budget-meter
                          variant="compact"
                          [width]="70"
                          [spentNanoAiu]="row.story.spentNanoAiu"
                          [capNanoAiu]="row.story.budgetNanoAiu"
                          [label]="'Budget of ' + row.story.key"
                        />
                      </td>
                      <td ahNowrap>
                        <a
                          [ahButton]="row.action.variant"
                          size="sm"
                          [routerLink]="row.action.link"
                          [attr.aria-label]="
                            row.action.label + ' ' + row.story.key
                          "
                          >{{ row.action.label }}</a
                        >
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </ah-panel>

      <ah-panel>
        <ah-panel-head
          heading="In progress"
          subtitle="Agents are working; nothing needed from you"
        >
          <a ahPanelActions routerLink="/voyages">All voyages</a>
        </ah-panel-head>
        @if (loaded() && atSea().length === 0) {
          <ah-empty-state heading="Nothing in progress"
            >No voyage is running or queued.</ah-empty-state
          >
        } @else {
          <div
            class="scroll"
            role="region"
            tabindex="0"
            aria-label="Voyages in progress"
          >
            <table ahTable [attr.aria-busy]="loaded() ? null : 'true'">
              <colgroup>
                <col class="c-status" />
                <col />
                <col class="c-phase" />
                <col />
                <col class="c-owner" />
                <col class="c-when" />
                <col class="c-budget" />
              </colgroup>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Voyage</th>
                  <th>Phase</th>
                  <th>Agent</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th>Budget (AIU)</th>
                </tr>
              </thead>
              <tbody>
                @if (!loaded()) {
                  @for (i of placeholderRows.sea; track i) {
                    <tr class="placeholder">
                      <td><ah-skeleton width="110px" [height]="20" /></td>
                      <td><ah-skeleton [width]="barWidth(i)" /></td>
                      <td><ah-skeleton width="70%" /></td>
                      <td><ah-skeleton [width]="barWidth(i + 1)" /></td>
                      <td><ah-skeleton width="75%" /></td>
                      <td><ah-skeleton width="65%" /></td>
                      <td><ah-skeleton width="70px" /></td>
                    </tr>
                  }
                } @else {
                  @for (row of seaRows(); track row.story.key) {
                    <tr>
                      <td class="clip">
                        <ah-status-badge
                          [status]="row.story.status"
                          [phase]="row.story.phase"
                        />
                      </td>
                      <td class="voyage" [title]="row.story.title">
                        <div class="title title--one">
                          <a ahKey [routerLink]="['/voyages', row.story.key]">{{
                            row.story.key
                          }}</a
                          >{{ row.story.title }}
                        </div>
                      </td>
                      <td class="ah-mono clip">{{ row.story.phase }}</td>
                      <td class="clip" [title]="row.agentLine">
                        {{ row.sea.member }}
                        @if (row.sea.runtime; as runtime) {
                          · <span class="ah-mono">{{ runtime }}</span>
                        }
                      </td>
                      <td class="clip" [title]="row.story.owner">
                        {{ ownerLabel(row.story) }}
                      </td>
                      <td class="clip">
                        {{ row.story.updatedAt | ahRelative }}
                      </td>
                      <td class="clip">
                        <ah-budget-meter
                          variant="compact"
                          [width]="70"
                          [spentNanoAiu]="row.story.spentNanoAiu"
                          [capNanoAiu]="row.story.budgetNanoAiu"
                          [label]="'Budget of ' + row.story.key"
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </ah-panel>
    }
  `,
})
export class AllHandsPage {
  private readonly store = inject(StoriesStore);
  private readonly details = inject(RowDetails);

  protected readonly tiles = TILES;
  /** The owner's name, or the q-number while the name is not known; the q-number is the cell's tooltip. */
  protected readonly ownerLabel = ownerLabel;
  protected readonly placeholderRows = PLACEHOLDER_ROWS;
  protected readonly counts = this.store.boardCounts;
  /**
   * The inbox: the statuses that wait on a person, and the aground voyages a person can Unblock (their events say so; a
   * rejected one is final and stays on the board only), longest waiting first.
   */
  protected readonly needsYou = computed(() =>
    [
      ...this.store.needsYou(),
      ...this.store
        .aground()
        .filter((story) => canUnblock(story, this.details.detail(story.key))),
    ].sort(
      (a, b) =>
        Date.parse(a.updatedAt) - Date.parse(b.updatedAt) ||
        a.key.localeCompare(b.key)
    )
  );
  protected readonly atSea = this.store.atSea;

  /** Whether the list was read, or an earlier read is still in hand. */
  private readonly listRead = computed(
    () => this.store.status() === 'ready' || this.store.stories().length > 0
  );
  /** Set once the first full read is on screen; live updates after it change rows in place, never the placeholders. */
  private readonly shown = signal(false);

  /**
   * Whether there is something to show: the list was read and so were the events of each aground voyage, which say
   * whether it belongs in the inbox. Showing the list before them would add rows under the person's eyes.
   */
  protected readonly loaded = computed(
    () =>
      this.shown() ||
      (this.listRead() &&
        this.store
          .aground()
          .every((story) => this.details.eventsRead(story.key)))
  );

  /** Why there is nothing to show, when the first read failed. A later failure keeps the list on screen. */
  protected readonly failure = computed((): Failure | null => {
    const error = this.store.error();
    return !this.listRead() && this.store.status() === 'error' && error !== null
      ? describeFailure(error)
      : null;
  });

  /** The rows of "Needs you", each with what it needs and the action that ends it. */
  protected readonly needsRows = computed(() =>
    this.needsYou().map((story) => {
      const detail = this.details.detail(story.key);
      return {
        story,
        needed: whatsNeeded(story, detail),
        action: needsAction(story, detail.gate),
      };
    })
  );

  /** The rows of "At sea", each with its crew member and, once known, the model and effort of its run. */
  protected readonly seaRows = computed(() =>
    this.atSea().map((story) => {
      const sea = atSeaCrew(story, this.details.runOf(story));
      return {
        story,
        sea,
        agentLine:
          sea.runtime === null ? sea.member : `${sea.member} · ${sea.runtime}`,
      };
    })
  );

  protected readonly needsSubtitle = computed(() => {
    const count = this.needsYou().length;
    return count === 0
      ? ''
      : `${count} ${count === 1 ? 'voyage' : 'voyages'} · longest wait first`;
  });

  constructor() {
    this.store.use(inject(DestroyRef));
    effect(() => {
      if (this.loaded()) this.shown.set(true);
    });
    effect(() =>
      this.details.sync([
        ...this.store.needsYou(),
        ...this.store.aground(),
        ...this.atSea(),
      ])
    );
  }

  /** The width of a text-like placeholder bar on row `i`. */
  protected barWidth(i: number): string {
    return BAR_WIDTHS[i % BAR_WIDTHS.length] ?? '75%';
  }

  protected retry(): void {
    void this.store.loadAll();
  }
}
