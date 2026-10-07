import { Component, DestroyRef, computed, effect, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ApiError } from "@core/api/api-error";
import { StoriesStore } from "@core/stores/stories-store";
import type { StoryStatus } from "@domain/types";
import { Banner } from "@ui/banner/banner";
import { BudgetMeter } from "@ui/budget-meter/budget-meter";
import { Button } from "@ui/button/button";
import { EmptyState } from "@ui/empty-state/empty-state";
import { Panel, PanelBody, PanelHead } from "@ui/panel/panel";
import { RelativePipe } from "@ui/pipes/relative.pipe";
import { Skeleton, SkeletonRows, type SkeletonColumn } from "@ui/skeleton/skeleton";
import { StatusBadge } from "@ui/status-badge/status-badge";
import { CellSub, Key, Nowrap, Table } from "@ui/table/table";
import { atSeaCrew, needsAction, whatsNeeded } from "./needs";
import { RowDetails } from "./row-details";

/** The three tiles: the statuses that wait on a person, each with what it means. */
const TILES: readonly { readonly status: StoryStatus; readonly hint: string }[] = [
  { status: "awaiting_input", hint: "Agent questions to answer" },
  { status: "awaiting_decision", hint: "Human gates waiting on a decision" },
  { status: "halted", hint: "Halted until someone resumes" },
];

/** The columns of the "Needs you" table, for its placeholder rows. */
const NEEDS_COLUMNS: readonly SkeletonColumn[] = [
  { track: "90px", height: 20 },
  { track: "minmax(0, 1.4fr)" },
  { track: "80px" },
  { track: "minmax(0, 1.4fr)" },
  { track: "minmax(0, 0.8fr)" },
  { track: "56px" },
  { track: "110px" },
  { track: "90px", height: 28 },
];

/** What the page says when the list cannot be read: the heading, the sentence and the technical line. */
interface Failure {
  readonly heading: string;
  readonly text: string;
  readonly tech: string;
}

/** Says why the list could not be read. An answer the app cannot read is a failure of tooling, never a verdict. */
function describeFailure(error: ApiError): Failure {
  const nothingLost = "Nothing you did was lost, and no voyage stopped because of this.";
  switch (error.kind) {
    case "invalid_response":
      return {
        heading: "Ahoy sent something unexpected",
        text: `Ahoy couldn't read the answer, so it shows nothing rather than guess. ${nothingLost}`,
        tech: `invalid_response · ${error.what}`,
      };
    case "network":
      return {
        heading: "Lost contact with the harbour",
        text: `Ahoy couldn't load voyages. ${nothingLost}`,
        tech: error.status === undefined ? "network" : `${error.status} · network`,
      };
    case "problem": {
      const tech = `${error.status} · ${error.code}${error.instance === undefined ? "" : ` · request ${error.instance}`}`;
      return error.status === 401
        ? { heading: "Sign-in needed", text: "Ahoy needs you to sign in before it can show voyages.", tech }
        : { heading: "Lost contact with the harbour", text: `Ahoy couldn't load voyages. ${nothingLost}`, tech };
    }
  }
}

/**
 * All hands (`/`): the voyages waiting on a person, longest wait first, and the ones the crew is working on. It reads
 * the `StoriesStore`, which follows the event stream, so a voyage moves between the two panels on its own.
 */
@Component({
  selector: "ah-all-hands",
  imports: [
    Banner,
    BudgetMeter,
    Button,
    CellSub,
    EmptyState,
    Key,
    Nowrap,
    Panel,
    PanelBody,
    PanelHead,
    RelativePipe,
    RouterLink,
    Skeleton,
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
    .tiles {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
    .scroll table {
      min-width: 860px;
    }
    /* A key never breaks across lines, and the title gets room to wrap beside it. */
    .voyage {
      min-width: 240px;
    }
    .voyage a {
      white-space: nowrap;
    }
    .need {
      white-space: normal;
      min-width: 240px;
    }
    .retry {
      margin-top: 8px;
    }
    @media (max-width: 720px) {
      .tiles {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <div>
      <h1>All hands on deck</h1>
      <p class="ah-muted lead">
        Voyages waiting on a person. Anyone on the crew may answer, approve, send back or stop. Only the owner is
        billed.
      </p>
    </div>

    @if (failure(); as problem) {
      <ah-banner variant="error" [heading]="problem.heading" [tech]="problem.tech">
        {{ problem.text }}
        <button ahButton size="sm" type="button" class="retry" (click)="retry()">Try again</button>
      </ah-banner>
    } @else {
      <div class="tiles">
        @for (tile of tiles; track tile.status) {
          <a class="tile" routerLink="/voyages" [queryParams]="{ status: tile.status }">
            @if (loaded()) {
              <b>{{ counts()[tile.status] }}</b>
            } @else {
              <ah-skeleton width="28px" [height]="28" />
            }
            <div>
              <ah-status-badge [status]="tile.status" />
              <div class="ah-muted tile__hint">{{ tile.hint }}</div>
            </div>
          </a>
        }
      </div>

      <ah-panel>
        <ah-panel-head heading="Needs you" [subtitle]="needsSubtitle()" />
        @if (!loaded()) {
          <ah-panel-body><ah-skeleton-rows [rows]="4" [columns]="needsColumns" /></ah-panel-body>
        } @else if (needsYou().length === 0) {
          <ah-empty-state heading="Calm seas">
            Nothing needs you right now. Questions, decisions and anchored voyages show up here.
            <a ahButton ahEmptyAction routerLink="/voyages">See all voyages</a>
          </ah-empty-state>
        } @else {
          <div class="scroll" role="region" tabindex="0" aria-label="Voyages that need you">
            <table ahTable>
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
                @for (row of needsRows(); track row.story.key) {
                  <tr>
                    <td ahNowrap><ah-status-badge [status]="row.story.status" [phase]="row.story.phase" /></td>
                    <td class="voyage">
                      <a ahKey [routerLink]="['/voyages', row.story.key]">{{ row.story.key }}</a
                      >{{ row.story.title }}
                    </td>
                    <td class="ah-mono">{{ row.story.phase }}</td>
                    <td class="need">
                      {{ row.needed.headline }}
                      @if (row.needed.sub; as sub) {
                        <small ahCellSub>{{ sub }}</small>
                      }
                    </td>
                    <td>{{ row.story.owner }}</td>
                    <td ahNowrap>{{ row.story.updatedAt | ahRelative: "waiting" }}</td>
                    <td ahNowrap>
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
                        [attr.aria-label]="row.action.label + ' ' + row.story.key"
                        >{{ row.action.label }}</a
                      >
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </ah-panel>

      <ah-panel>
        <ah-panel-head heading="At sea" subtitle="The crew is working; nothing needed from you">
          <a ahPanelActions routerLink="/voyages">All voyages</a>
        </ah-panel-head>
        @if (!loaded()) {
          <ah-panel-body><ah-skeleton-rows [rows]="2" [columns]="needsColumns" /></ah-panel-body>
        } @else if (atSea().length === 0) {
          <ah-empty-state heading="Nothing at sea">No voyage is under way or queued.</ah-empty-state>
        } @else {
          <div class="scroll" role="region" tabindex="0" aria-label="Voyages at sea">
            <table ahTable>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Voyage</th>
                  <th>Phase</th>
                  <th>Crew member</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th>Budget (AIU)</th>
                </tr>
              </thead>
              <tbody>
                @for (row of seaRows(); track row.story.key) {
                  <tr>
                    <td ahNowrap><ah-status-badge [status]="row.story.status" [phase]="row.story.phase" /></td>
                    <td class="voyage">
                      <a ahKey [routerLink]="['/voyages', row.story.key]">{{ row.story.key }}</a
                      >{{ row.story.title }}
                    </td>
                    <td class="ah-mono">{{ row.story.phase }}</td>
                    <td>
                      {{ row.crew.crew }}
                      @if (row.crew.runtime; as runtime) {
                        · <span class="ah-mono">{{ runtime }}</span>
                      }
                    </td>
                    <td>{{ row.story.owner }}</td>
                    <td ahNowrap>{{ row.story.updatedAt | ahRelative }}</td>
                    <td ahNowrap>
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
              </tbody>
            </table>
          </div>
        }
      </ah-panel>
    }
  `,
})
export class AllHands {
  private readonly store = inject(StoriesStore);
  private readonly details = inject(RowDetails);

  protected readonly tiles = TILES;
  protected readonly needsColumns = NEEDS_COLUMNS;
  protected readonly counts = this.store.counts;
  protected readonly needsYou = this.store.needsYou;
  protected readonly atSea = this.store.atSea;

  /** Whether there is something to show: the list was read, or an earlier read is still in hand. */
  protected readonly loaded = computed(() => this.store.status() === "ready" || this.store.stories().length > 0);

  /** Why there is nothing to show, when the first read failed. A later failure keeps the list on screen. */
  protected readonly failure = computed((): Failure | null => {
    const error = this.store.error();
    return !this.loaded() && this.store.status() === "error" && error !== null ? describeFailure(error) : null;
  });

  /** The rows of "Needs you", each with what it needs and the action that ends it. */
  protected readonly needsRows = computed(() =>
    this.needsYou().map((story) => {
      const detail = this.details.detail(story.key);
      return { story, needed: whatsNeeded(story, detail), action: needsAction(story, detail.gate) };
    }),
  );

  /** The rows of "At sea", each with its crew member and, once known, the model and effort of its run. */
  protected readonly seaRows = computed(() =>
    this.atSea().map((story) => ({ story, crew: atSeaCrew(story, this.details.runOf(story)) })),
  );

  protected readonly needsSubtitle = computed(() => {
    const count = this.needsYou().length;
    return count === 0 ? "" : `${count} ${count === 1 ? "voyage" : "voyages"} · longest wait first`;
  });

  constructor() {
    this.store.use(inject(DestroyRef));
    effect(() => this.details.sync([...this.needsYou(), ...this.atSea()]));
  }

  protected retry(): void {
    void this.store.loadAll();
  }
}
