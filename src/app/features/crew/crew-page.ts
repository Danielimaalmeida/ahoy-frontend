import { Component, computed, inject, signal } from '@angular/core';
import type {
  CrewAssignment,
  CrewMember,
  CrewRole,
  CrewSprint,
} from '@core/api/types';
import { CREW_ROLES } from '@core/api/types';
import {
  awayLabel,
  dayLabel,
  initial,
  ROLE_WORDS,
  spanLabel,
  sprintProgress,
  sprintTitle,
  upcomingTimeOff,
} from '@domain/crew';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { ChangeDialog, type ChangeData } from './change-dialog';
import { crewErrorView } from './crew-errors';
import { CrewStore } from './crew-store';
import { MemberDialog, type MemberData } from './member-dialog';
import { TimeOffDialog, type TimeOffData } from './time-off-dialog';

/** One role's card at the top: who is on now and who is next. */
interface DutyCard {
  readonly role: CrewRole;
  readonly name: string;
  readonly who: string;
  readonly duty: string;
  readonly now: CrewAssignment | null;
  readonly next: CrewAssignment | null;
  readonly nextSprint: CrewSprint | null;
}

/** One cell of the Upcoming table. */
interface Cell {
  readonly role: CrewRole;
  readonly assignment: CrewAssignment | null;
}

/** One row of the Upcoming table. */
interface Row {
  readonly sprint: CrewSprint;
  readonly title: string;
  readonly days: string;
  readonly cells: readonly Cell[];
}

/** One member in the rotation order. */
interface MemberLine {
  readonly member: CrewMember;
  readonly initial: string;
  readonly away: readonly string[];
  readonly onDuty: boolean;
}

/**
 * Crew (`/crew`): who is the sprint person (a dev) and who hosts the sprint's lunch and retro, now and for the next
 * five sprints. The turns go alphabetically over the sprints Jira knows; a person changes a sprint for a holiday, records
 * time off (the page flags a person away on their sprint and suggests who could step in) and keeps the crew. Every
 * change reads the crew again. 0 AIU.
 */
@Component({
  selector: 'ah-crew-page',
  imports: [Banner, Button, EmptyState, Skeleton],
  providers: [CrewStore],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }
    .head h1 {
      margin: 4px 0 2px;
    }
    .head p {
      margin: 0;
    }
    .when {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .card .ah-panel__body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--on-accent);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 600;
      flex: none;
    }
    .avatar--small {
      width: 28px;
      height: 28px;
      font-size: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .avatar--quiet {
      background: var(--surface-sunken);
      color: var(--ink-soft);
    }
    .name {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
    }
    .next {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
    }
    .layout {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
    }
    .upcoming {
      flex: 999 1 600px;
      min-width: 0;
    }
    .roster {
      flex: 1 1 320px;
      min-width: 0;
    }
    .scroll {
      overflow-x: auto;
    }
    table {
      min-width: 600px;
    }
    tr.now {
      background: var(--accent-soft);
    }
    .cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cell__line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .cell__actions {
      display: flex;
      gap: 4px;
    }
    .tag--change {
      background: var(--status-decision-bg);
      color: var(--status-decision-fg);
    }
    .tag--away {
      background: var(--notice-bg);
      color: var(--notice-fg);
    }
    .roster ul {
      list-style: none;
      margin: 0;
      padding: 4px 0;
    }
    .member {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 16px;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .member:hover {
      background: var(--surface-hover);
    }
    .member__name {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
    }
  `,
  template: `
    <div class="head">
      <div>
        @if (store.current(); as sprint) {
          <div class="when ah-muted">
            <span class="ah-tag ah-tag--accent">{{ title(sprint) }}</span>
            <span
              >{{ dayLabel(sprint.startsOn) }} – {{ dayLabel(sprint.endsOn) }}
              @if (progress(); as p) {
                · day {{ p.day }} of {{ p.of }}
              }
            </span>
            @if (store.crew()?.jiraConfigured) {
              <span>· from Jira</span>
            }
          </div>
        }
        <h1>Crew</h1>
        <p class="ah-muted">Who's on duty this sprint, and who's up next.</p>
      </div>
      <div class="actions">
        <button
          ahButton
          type="button"
          [disabled]="!store.crew() || store.members().length === 0"
          (click)="timeOff(null)"
        >
          Add time off
        </button>
        <button
          ahButton
          type="button"
          [disabled]="!store.crew()"
          (click)="member(null)"
        >
          Add person
        </button>
      </div>
    </div>

    @if (failure(); as problem) {
      <ah-banner
        [variant]="problem.variant"
        [heading]="problem.heading"
        [tech]="problem.tech ?? ''"
      >
        {{ problem.text }}
        <button ahButton size="sm" type="button" (click)="store.load()">
          Try again
        </button>
      </ah-banner>
    }
    @if (store.crew()?.sprintsProblem; as problem) {
      <ah-banner
        variant="notice"
        heading="Showing the sprints last read from Jira"
      >
        {{ problem }}
      </ah-banner>
    }

    @if (store.loading() && !store.crew()) {
      <div class="ah-panel loading" aria-label="Loading the crew">
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
        <ah-skeleton width="55%" />
      </div>
    } @else if (store.crew(); as crew) {
      @if (crew.members.length === 0) {
        <div class="ah-panel">
          <ah-empty-state heading="No crew yet" icon="compass">
            Add the team: the devs take the sprint person's turn, and everyone
            hosts lunch and the retro.
            <button ahButton ahEmptyAction type="button" (click)="member(null)">
              Add person
            </button>
          </ah-empty-state>
        </div>
      } @else if (crew.sprints.length === 0) {
        <div class="ah-panel">
          <ah-empty-state heading="No sprints yet" icon="compass">
            {{
              crew.jiraConfigured
                ? 'Jira has no sprint with dates on the team board yet. Start one there.'
                : 'Sprints come from the team board in Jira. Ask an admin to set JIRA_BOARD_ID on the API.'
            }}
          </ah-empty-state>
        </div>
      } @else {
        <section class="cards" aria-label="On duty this sprint">
          @for (card of cards(); track card.role) {
            <article
              class="ah-panel card"
              [attr.aria-labelledby]="'duty-' + card.role"
            >
              <div class="ah-panel__head">
                <h2 class="ah-panel__title" [id]="'duty-' + card.role">
                  {{ card.name }}
                </h2>
                <span class="ah-tag">{{ card.who }}</span>
                <div class="ah-panel__actions">
                  @if (card.now) {
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-label]="
                        'Change the ' + card.name.toLowerCase() + ' this sprint'
                      "
                      (click)="change(crew.sprints[0]!, card.role)"
                    >
                      Change
                    </button>
                  }
                </div>
              </div>
              <div class="ah-panel__body">
                @if (card.now; as now) {
                  <div class="who">
                    <span class="avatar" aria-hidden="true">{{
                      initialOf(now.memberName)
                    }}</span>
                    <div>
                      <div class="name">{{ now.memberName }}</div>
                      <div class="ah-muted">
                        {{ card.duty }}
                        @if (now.change) {
                          In for {{ now.dueMemberName }}.
                        }
                      </div>
                    </div>
                  </div>
                  @if (now.away) {
                    <ah-banner
                      variant="notice"
                      heading="{{ now.memberName }} is away part of this sprint"
                    >
                      @if (now.suggestedMemberName) {
                        {{ now.suggestedMemberName }} is next in the order and
                        is around.
                      }
                    </ah-banner>
                  }
                } @else {
                  <p class="ah-muted">
                    Nobody takes this turn yet. Edit a member to give it to
                    them.
                  </p>
                }
                @if (card.next && card.nextSprint) {
                  <div class="next">
                    <b>Next</b>
                    <span class="avatar avatar--small" aria-hidden="true">{{
                      initialOf(card.next.memberName)
                    }}</span>
                    <span
                      ><b>{{ card.next.memberName }}</b> ·
                      {{ title(card.nextSprint) }} from
                      {{ dayLabel(card.nextSprint.startsOn) }}</span
                    >
                  </div>
                }
              </div>
            </article>
          }
        </section>

        <div class="layout">
          <section class="ah-panel upcoming" aria-labelledby="upcoming-heading">
            <div class="ah-panel__head">
              <h2 class="ah-panel__title" id="upcoming-heading">Upcoming</h2>
              <span class="ah-hint">
                {{
                  crew.jiraConfigured
                    ? 'Dates from Jira.'
                    : 'Dates last read from Jira.'
                }}
                Projected sprints follow the team's cadence.
              </span>
            </div>
            <div class="scroll">
              <table class="ah-table">
                <thead>
                  <tr>
                    <th scope="col">Sprint</th>
                    @for (role of roles; track role) {
                      <th scope="col">{{ words[role].name }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.sprint.startsOn) {
                    <tr [class.now]="row.sprint.current">
                      <th scope="row">
                        <div class="cell">
                          <span class="cell__line">
                            <b>{{ row.title }}</b>
                            @if (row.sprint.current) {
                              <span class="ah-tag ah-tag--accent">Now</span>
                            } @else if (row.sprint.state === 'projected') {
                              <span
                                class="ah-tag ah-tag--outline"
                                title="Not in Jira yet: the dates follow the team's cadence"
                                >Projected</span
                              >
                            }
                          </span>
                          <span class="ah-hint">
                            {{ row.days }}
                            @if (
                              row.sprint.datesEstimated &&
                              row.sprint.state !== 'projected'
                            ) {
                              · dates estimated
                            }
                          </span>
                        </div>
                      </th>
                      @for (cell of row.cells; track cell.role) {
                        <td>
                          @if (cell.assignment; as a) {
                            <div class="cell">
                              <span class="cell__line">
                                <b>{{ a.memberName }}</b>
                                @if (a.change) {
                                  <span class="ah-tag tag--change"
                                    >Changed</span
                                  >
                                }
                                @if (a.away) {
                                  <span class="ah-tag tag--away">Away</span>
                                }
                              </span>
                              @if (a.change) {
                                <span class="ah-hint">
                                  In for {{ a.dueMemberName
                                  }}{{
                                    a.change.reason
                                      ? ' · ' + a.change.reason
                                      : ''
                                  }}
                                </span>
                              }
                              @if (a.away && a.suggestedMemberName) {
                                <span class="ah-hint"
                                  >{{ a.suggestedMemberName }} could step
                                  in</span
                                >
                              }
                              <span class="cell__actions">
                                <button
                                  ahButton="ghost"
                                  size="sm"
                                  type="button"
                                  [attr.aria-label]="
                                    'Change the ' +
                                    words[cell.role].name.toLowerCase() +
                                    ' for ' +
                                    row.title
                                  "
                                  (click)="change(row.sprint, cell.role)"
                                >
                                  Change
                                </button>
                                @if (a.change) {
                                  <button
                                    ahButton="ghost"
                                    size="sm"
                                    type="button"
                                    [attr.aria-label]="
                                      'Undo the change of ' +
                                      words[cell.role].name.toLowerCase() +
                                      ' for ' +
                                      row.title
                                    "
                                    (click)="undo(row.sprint, cell.role)"
                                  >
                                    Undo
                                  </button>
                                }
                              </span>
                            </div>
                          } @else {
                            <span class="ah-muted">Nobody</span>
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="ah-panel roster" aria-labelledby="roster-heading">
            <div class="ah-panel__head">
              <h2 class="ah-panel__title" id="roster-heading">
                Rotation order
              </h2>
              <span class="ah-hint">Alphabetical</span>
            </div>
            <ul>
              @for (line of roster(); track line.member.id) {
                <li>
                  <button
                    class="member"
                    type="button"
                    [attr.aria-label]="'Edit ' + line.member.name"
                    (click)="member(line.member)"
                  >
                    <span
                      class="avatar avatar--small"
                      [class.avatar--quiet]="!line.onDuty"
                      aria-hidden="true"
                      >{{ line.initial }}</span
                    >
                    <span class="member__name">
                      <span>{{ line.member.name }}</span>
                      @for (away of line.away; track away) {
                        <span class="ah-hint">{{ away }}</span>
                      }
                    </span>
                    @for (role of line.member.roles; track role) {
                      <span class="ah-tag">{{
                        role === 'sprint_person' ? 'Sprint' : 'Lunch'
                      }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
            <div class="ah-panel__foot ah-hint">
              Only devs take the sprint person's turn. Someone away on their
              sprint is flagged above; change the sprint to swap them.
            </div>
          </section>
        </div>
      }
    }
  `,
})
export class CrewPage {
  protected readonly store = inject(CrewStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);

  protected readonly roles = CREW_ROLES;
  protected readonly words = ROLE_WORDS;
  protected readonly dayLabel = dayLabel;
  protected readonly title = sprintTitle;
  protected readonly initialOf = initial;
  /** The sprint and role whose Undo is in flight, so a second click sends nothing. */
  private readonly undoing = signal<string | null>(null);

  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : crewErrorView(error);
  });

  protected readonly progress = computed(() => {
    const crew = this.store.crew();
    const sprint = this.store.current();
    return crew && sprint
      ? sprintProgress(sprint.startsOn, sprint.endsOn, crew.today)
      : null;
  });

  protected readonly cards = computed<DutyCard[]>(() => {
    const sprints = this.store.crew()?.sprints ?? [];
    const of = (sprint: CrewSprint | undefined, role: CrewRole) =>
      sprint?.assignments.find((a) => a.role === role) ?? null;
    return CREW_ROLES.map((role) => ({
      role,
      name: ROLE_WORDS[role].name,
      who: ROLE_WORDS[role].who,
      duty: ROLE_WORDS[role].duty,
      now: of(sprints[0], role),
      next: of(sprints[1], role),
      nextSprint: sprints[1] ?? null,
    }));
  });

  protected readonly rows = computed<Row[]>(() =>
    (this.store.crew()?.sprints ?? []).map((sprint) => ({
      sprint,
      title: sprintTitle(sprint),
      days: spanLabel(sprint.startsOn, sprint.endsOn),
      cells: CREW_ROLES.map((role) => ({
        role,
        assignment: sprint.assignments.find((a) => a.role === role) ?? null,
      })),
    }))
  );

  protected readonly roster = computed<MemberLine[]>(() => {
    const crew = this.store.crew();
    if (!crew) return [];
    const onDuty = new Set(
      (crew.sprints[0]?.assignments ?? []).map((a) => a.memberId)
    );
    return crew.members.map((member) => ({
      member,
      initial: initial(member.name),
      away: upcomingTimeOff(member.timeOff, crew.today).map(awayLabel),
      onDuty: onDuty.has(member.id),
    }));
  });

  constructor() {
    void this.store.load();
  }

  /** Opens the change dialog for a sprint and role. */
  protected change(sprint: CrewSprint, role: CrewRole): void {
    this.dialogs.open<boolean, ChangeData>(ChangeDialog, {
      data: { store: this.store, sprint, role },
      width: '560px',
    });
  }

  /** Undoes a sprint's change for a role. */
  protected async undo(sprint: CrewSprint, role: CrewRole): Promise<void> {
    const key = `${sprint.startsOn}:${role}`;
    if (this.undoing() !== null) return;
    this.undoing.set(key);
    const result = await this.store.undo(sprint.startsOn, role);
    this.undoing.set(null);
    if (result.ok)
      this.toasts.show(
        `${ROLE_WORDS[role].name} for ${sprintTitle(sprint)} goes back to the order.`
      );
    else this.toasts.show(crewErrorView(result.error).heading);
  }

  /** Opens the member dialog: a new member, or one to edit. */
  protected member(member: CrewMember | null): void {
    this.dialogs.open<boolean, MemberData>(MemberDialog, {
      data: { store: this.store, member },
      width: '520px',
    });
  }

  /** Opens the time off dialog, for a member or to pick one. */
  protected timeOff(member: CrewMember | null): void {
    this.dialogs.open<boolean, TimeOffData>(TimeOffDialog, {
      data: { store: this.store, member },
      width: '480px',
    });
  }
}
