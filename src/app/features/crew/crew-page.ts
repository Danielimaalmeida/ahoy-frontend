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
  crewToTeams,
  dayLabel,
  initial,
  lastWorkday,
  ROLE_WORDS,
  spanLabel,
  sprintProgress,
  sprintLabels,
  sprintTitle,
  timeOffDuring,
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
  readonly now: CrewAssignment | null;
  readonly next: CrewAssignment | null;
  readonly nextSprint: CrewSprint | null;
  /** "Sprint 43 from Mon 2 Nov", or for the lunch host "Sprint 43, lunch Fri 13 Nov". */
  readonly nextWhen: string;
}

/** One cell of the Upcoming table. */
interface Cell {
  readonly role: CrewRole;
  readonly assignment: CrewAssignment | null;
  /** "Carlos is away 21 Dec – 4 Jan", when the person on is away during the sprint. */
  readonly away: string | null;
}

/** One row of the Upcoming table. */
interface Row {
  readonly sprint: CrewSprint;
  readonly title: string;
  readonly short: string;
  readonly days: string;
  readonly cells: readonly Cell[];
}

/** One member in the rotation order. */
interface MemberLine {
  readonly member: CrewMember;
  readonly initial: string;
  readonly away: readonly string[];
  /** The turn the member holds this sprint, which colours their avatar. */
  readonly onDuty: CrewRole | null;
}

/**
 * Crew (`/crew`): who is the sprint person (a dev) and who hosts the sprint's lunch and retro, now and for the next
 * five sprints. The turns go alphabetically over the sprints Jira knows; a person changes a sprint for a holiday, records
 * time off (the page flags a person away on their sprint and suggests who could step in) and keeps the crew. Every
 * change reads the crew again. 0 AIU. Blue is the sprint person's colour and orange the lunch host's, as in the design.
 */
@Component({
  selector: 'ah-crew-page',
  imports: [Banner, Button, EmptyState, Skeleton],
  providers: [CrewStore],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 28px;
      /* The lunch host's orange from the design; the tokens have it only as a soft status colour. */
      --crew-lunch: #c2410c;
      --crew-on-lunch: #ffffff;
    }
    :host-context([data-theme='dark']) {
      --crew-lunch: var(--status-sendback-fg);
      --crew-on-lunch: var(--status-sendback-bg);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
    }
    .head__text {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .head h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .head p {
      margin: 0;
    }
    .when {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .pill-now {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      background: var(--status-done-bg);
      color: var(--status-done-fg);
      font-weight: 500;
    }
    .pill-now::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--live);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag-sprint {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .tag-lunch {
      background: var(--status-sendback-bg);
      color: var(--status-sendback-fg);
    }
    .tag-now {
      background: var(--status-done-bg);
      color: var(--status-done-fg);
    }
    .tag-projected {
      background: var(--status-queued-bg);
      color: var(--status-queued-fg);
    }
    .tag-override {
      background: var(--status-decision-bg);
      color: var(--status-decision-fg);
    }

    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      border-radius: 50%;
      font-weight: 600;
      width: 32px;
      height: 32px;
      font-size: 13px;
      background: var(--surface-sunken);
      color: var(--ink-soft);
    }
    .avatar--large {
      width: 64px;
      height: 64px;
      font-size: 22px;
    }
    .avatar--small {
      width: 26px;
      height: 26px;
      font-size: 12px;
    }
    .avatar--sprint_person {
      background: var(--accent);
      color: var(--on-accent);
    }
    .avatar--lunch_host {
      background: var(--crew-lunch);
      color: var(--crew-on-lunch);
    }
    .avatar--small.avatar--sprint_person {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .avatar--small.avatar--lunch_host {
      background: var(--status-sendback-bg);
      color: var(--status-sendback-fg);
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
      gap: 20px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
    .card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .card__role {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card__role h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ink-muted);
    }
    .who {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .who__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .name {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .duties {
      list-style: none;
      margin: 0;
      padding: 0;
      border-top: 1px solid var(--line-soft);
    }
    .duties li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--line-soft);
    }
    .duties__what {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .duties__what::before {
      content: '';
      width: 12px;
      height: 12px;
      border: 2px solid var(--ink-disabled);
      border-radius: 50%;
    }
    .next {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
      color: var(--ink-soft);
    }
    .next b {
      font-weight: 600;
    }

    .link {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      color: var(--accent-text);
      cursor: pointer;
    }
    .link:hover {
      text-decoration: underline;
    }
    .link--quiet {
      color: var(--ink-muted);
    }

    .layout {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      align-items: flex-start;
    }
    .box {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      overflow: hidden;
      min-width: 0;
    }
    .upcoming {
      flex: 999 1 640px;
    }
    .roster {
      flex: 1 1 340px;
    }
    .roster .box__title {
      flex-direction: column;
    }
    .box__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line-soft);
    }
    .box__title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 8px;
    }
    .box__title h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }
    .meta {
      color: var(--ink-muted);
      font-size: 13px;
    }

    .scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      min-width: 620px;
      border-collapse: collapse;
    }
    thead th {
      text-align: left;
      padding: 10px 12px;
      color: var(--ink-muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    tbody tr {
      border-top: 1px solid var(--line-soft);
    }
    tbody tr.now {
      background: var(--info-bg);
    }
    tbody th,
    tbody td {
      padding: 14px 12px;
      text-align: left;
      vertical-align: top;
      font-weight: 500;
    }
    thead th:first-child,
    tbody th {
      padding-left: 20px;
      min-width: 150px;
    }
    thead th:last-child,
    tbody td:last-child {
      padding-right: 20px;
      text-align: right;
      white-space: nowrap;
    }
    .sprint {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      font-weight: 600;
      white-space: nowrap;
    }
    .cell {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .sub {
      margin-top: 2px;
      color: var(--ink-muted);
      font-size: 13px;
      font-weight: 400;
    }
    .row-actions {
      display: inline-flex;
      gap: 14px;
    }

    .roster ul {
      list-style: none;
      margin: 0;
      padding: 4px 0;
    }
    .member {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 20px;
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
      font-weight: 500;
    }
    .member__name .sub {
      font-size: 12px;
      margin: 0;
    }
    .roster__foot {
      padding: 12px 20px 16px;
      border-top: 1px solid var(--line-soft);
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
      <div class="head__text">
        @if (store.current(); as sprint) {
          <div class="when ah-muted">
            <span class="pill-now">{{ title(sprint) }}</span>
            <span
              >{{ dayLabel(sprint.startsOn) }} –
              {{ dayLabel(sprint.endsOn) }}
              @if (progress(); as p) {
                · day {{ p.day }} of {{ p.of }}
              }
              @if (store.crew()?.jiraConfigured) {
                · synced from Jira
              }
            </span>
          </div>
        }
        <h1>Crew</h1>
        <p class="ah-muted">Who's on duty this sprint, and who's up next.</p>
      </div>
      <div class="actions">
        <button
          ahButton
          type="button"
          [disabled]="rows().length === 0"
          (click)="copyTeams()"
        >
          Copy for Teams
        </button>
        <button
          ahButton
          type="button"
          [disabled]="!store.crew() || store.members().length === 0"
          (click)="timeOff(null)"
        >
          Add time off
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
            <article class="card" [attr.aria-labelledby]="'duty-' + card.role">
              <div class="card__head">
                <div class="card__role">
                  <h2 [id]="'duty-' + card.role">{{ card.name }}</h2>
                  <span class="ah-tag" [class]="tagClass(card.role)">{{
                    card.who
                  }}</span>
                </div>
                @if (card.now) {
                  <button
                    class="link"
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
              @if (card.now; as now) {
                <div class="who">
                  <span
                    class="avatar avatar--large"
                    [class]="'avatar--' + card.role"
                    aria-hidden="true"
                    >{{ initialOf(now.memberName) }}</span
                  >
                  <div class="who__text">
                    <div class="name">{{ now.memberName }}</div>
                    <div class="ah-muted">
                      On since {{ dayLabel(crew.sprints[0]!.startsOn) }} ·
                      {{
                        now.change
                          ? 'in for ' + now.dueMemberName
                          : 'in alphabetical order'
                      }}
                    </div>
                  </div>
                </div>
                @if (now.away) {
                  <ah-banner
                    variant="notice"
                    heading="{{ now.memberName }} is away part of this sprint"
                  >
                    @if (now.suggestedMemberName) {
                      {{ now.suggestedMemberName }} is next in the order and is
                      around.
                    }
                  </ah-banner>
                }
                @if (card.role === 'sprint_person') {
                  <ul class="duties">
                    <li>
                      <span class="duties__what">Release</span>
                      <span class="ah-muted">{{ releaseDay() }}</span>
                    </li>
                  </ul>
                }
              } @else {
                <p class="ah-muted">
                  Nobody takes this turn yet. Edit a member to give it to them.
                </p>
              }
              @if (card.next && card.nextSprint) {
                <div class="next">
                  <span>Next</span>
                  <span
                    class="avatar avatar--small"
                    [class]="'avatar--' + card.role"
                    aria-hidden="true"
                    >{{ initialOf(card.next.memberName) }}</span
                  >
                  <span
                    ><b>{{ card.next.memberName }}</b> ·
                    {{ card.nextWhen }}</span
                  >
                </div>
              }
            </article>
          }
        </section>

        <div class="layout">
          <section class="box upcoming" aria-labelledby="upcoming-heading">
            <div class="box__head">
              <div class="box__title">
                <h2 id="upcoming-heading">Upcoming</h2>
                <span class="meta"
                  >next {{ rows().length }} sprints ·
                  {{
                    crew.jiraConfigured
                      ? 'dates from Jira'
                      : 'dates last read from Jira'
                  }}</span
                >
              </div>
              <span class="meta"
                >Changes stay put. Everyone else keeps their alphabetical
                turn.</span
              >
            </div>
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Sprint</th>
                    @for (role of roles; track role) {
                      <th scope="col">{{ words[role].name }}</th>
                    }
                    <th scope="col"><span class="ah-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.sprint.startsOn) {
                    <tr [class.now]="row.sprint.current">
                      <th scope="row">
                        <div class="sprint" [title]="row.title">
                          {{ row.short }}
                          @if (row.sprint.current) {
                            <span class="ah-tag tag-now">Now</span>
                          } @else if (row.sprint.state === 'projected') {
                            <span
                              class="ah-tag tag-projected"
                              title="Not created in Jira yet: the dates follow the team's cadence"
                              >Projected</span
                            >
                          }
                        </div>
                        <div class="sub">
                          {{ row.days }}
                          @if (
                            row.sprint.datesEstimated &&
                            row.sprint.state !== 'projected'
                          ) {
                            · dates estimated
                          }
                        </div>
                      </th>
                      @for (cell of row.cells; track cell.role) {
                        <td>
                          @if (cell.assignment; as a) {
                            <div class="cell">
                              <span>{{ a.memberName }}</span>
                              @if (a.change) {
                                <span class="ah-tag tag-override"
                                  >Override</span
                                >
                              } @else if (a.away) {
                                <span class="ah-tag tag-lunch">Check</span>
                              }
                            </div>
                            @if (a.change) {
                              <div class="sub">
                                <s>{{ a.dueMemberName }}</s>
                                {{
                                  a.change.reason ? '· ' + a.change.reason : ''
                                }}
                                ·
                                {{
                                  a.change.mode === 'swap'
                                    ? a.dueMemberName + ' goes next'
                                    : a.dueMemberName +
                                      ' waits for the next round'
                                }}
                              </div>
                            } @else if (a.away) {
                              <div class="sub">
                                {{ cell.away ?? a.memberName + ' is away' }}
                                @if (a.suggestedMemberName) {
                                  · {{ a.suggestedMemberName }} could step in
                                }
                              </div>
                            }
                          } @else {
                            <span class="ah-muted">Nobody</span>
                          }
                        </td>
                      }
                      <td>
                        <span class="row-actions">
                          @for (cell of row.cells; track cell.role) {
                            @if (cell.assignment?.change) {
                              <button
                                class="link link--quiet"
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
                          }
                          @if (row.sprint.assignments.length > 0) {
                            <button
                              class="link"
                              type="button"
                              [attr.aria-label]="'Change ' + row.title"
                              (click)="changeRow(row.sprint)"
                            >
                              Change
                            </button>
                          }
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="box roster" aria-labelledby="roster-heading">
            <div class="box__head">
              <div class="box__title">
                <h2 id="roster-heading">Rotation order</h2>
                <span class="meta">Alphabetical, automatically</span>
              </div>
              <button ahButton size="sm" type="button" (click)="member(null)">
                Add person
              </button>
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
                      class="avatar"
                      [class]="line.onDuty ? 'avatar--' + line.onDuty : ''"
                      aria-hidden="true"
                      >{{ line.initial }}</span
                    >
                    <span class="member__name">
                      <span>{{ line.member.name }}</span>
                      @for (away of line.away; track away) {
                        <span class="sub">{{ away }}</span>
                      }
                    </span>
                    @for (role of line.member.roles; track role) {
                      <span class="ah-tag" [class]="tagClass(role)">
                        <span aria-hidden="true">{{
                          role === 'sprint_person' ? '🚀' : '🍕'
                        }}</span>
                        {{ role === 'sprint_person' ? 'Sprint' : 'Lunch' }}
                      </span>
                    }
                  </button>
                </li>
              }
            </ul>
            <div class="roster__foot meta">
              Only devs take the sprint person's turn. Someone away on their
              sprint is flagged in Upcoming; change the sprint to swap them.
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

  /** Each sprint's labels, in the order of the crew's sprints. */
  private readonly labels = computed(() =>
    sprintLabels(this.store.crew()?.sprints ?? [])
  );

  /** The current sprint's release day: its last working day. */
  protected readonly releaseDay = computed(() => {
    const sprint = this.store.current();
    return sprint ? dayLabel(lastWorkday(sprint.startsOn, sprint.endsOn)) : '';
  });

  protected readonly cards = computed<DutyCard[]>(() => {
    const sprints = this.store.crew()?.sprints ?? [];
    const of = (sprint: CrewSprint | undefined, role: CrewRole) =>
      sprint?.assignments.find((a) => a.role === role) ?? null;
    return CREW_ROLES.map((role) => ({
      role,
      name: ROLE_WORDS[role].name,
      who: ROLE_WORDS[role].who,
      now: of(sprints[0], role),
      next: of(sprints[1], role),
      nextSprint: sprints[1] ?? null,
      nextWhen: this.nextWhen(role, sprints[1]),
    }));
  });

  protected readonly rows = computed<Row[]>(() => {
    const crew = this.store.crew();
    if (!crew) return [];
    const timeOff = new Map(crew.members.map((m) => [m.id, m.timeOff]));
    const labels = this.labels();
    return crew.sprints.map((sprint, i) => ({
      sprint,
      title: labels[i]?.title ?? sprintTitle(sprint),
      short: labels[i]?.short ?? sprintTitle(sprint),
      days: spanLabel(sprint.startsOn, sprint.endsOn),
      cells: CREW_ROLES.map((role) => {
        const assignment =
          sprint.assignments.find((a) => a.role === role) ?? null;
        const span =
          assignment?.away === true
            ? timeOffDuring(
                timeOff.get(assignment.memberId) ?? [],
                sprint.startsOn,
                sprint.endsOn
              )
            : null;
        return {
          role,
          assignment,
          away: span
            ? `${assignment?.memberName ?? ''} is away ${spanLabel(span.startsOn, span.endsOn)}`
            : null,
        };
      }),
    }));
  });

  protected readonly roster = computed<MemberLine[]>(() => {
    const crew = this.store.crew();
    if (!crew) return [];
    const onDuty = new Map<string, CrewRole>();
    for (const a of [...(crew.sprints[0]?.assignments ?? [])].reverse())
      onDuty.set(a.memberId, a.role);
    return crew.members.map((member) => ({
      member,
      initial: initial(member.name),
      away: upcomingTimeOff(member.timeOff, crew.today).map(awayLabel),
      onDuty: onDuty.get(member.id) ?? null,
    }));
  });

  constructor() {
    void this.store.load();
  }

  /** When a role's next turn is: the sprint's first day, or for the lunch host the lunch (its last working day). */
  private nextWhen(role: CrewRole, sprint: CrewSprint | undefined): string {
    if (!sprint) return '';
    const title = this.labels()[1]?.title ?? sprintTitle(sprint);
    return role === 'lunch_host'
      ? `${title}, lunch ${dayLabel(lastWorkday(sprint.startsOn, sprint.endsOn))}`
      : `${title} from ${dayLabel(sprint.startsOn)}`;
  }

  /**
   * Copies who is on this sprint and next for a Teams message: as HTML, which Teams keeps when pasted, and as plain
   * text where the browser cannot copy HTML. The Clipboard API can be missing or refused.
   */
  protected async copyTeams(): Promise<void> {
    const { html, text } = crewToTeams(
      this.rows().map((row) => ({ ...row.sprint, title: row.title }))
    );
    try {
      if (typeof ClipboardItem === 'function' && navigator.clipboard.write)
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      else await navigator.clipboard.writeText(text);
      this.toasts.show('Crew copied. Paste it into Teams.');
    } catch {
      this.toasts.show(
        "Couldn't copy to the clipboard. Allow clipboard access and try again."
      );
    }
  }

  /** A sprint's title as the page shows it ("Sprint 44" for a projected one). */
  private titleOf(sprint: CrewSprint): string {
    const i = this.store.crew()?.sprints.indexOf(sprint) ?? -1;
    return this.labels()[i]?.title ?? sprintTitle(sprint);
  }

  /** The tag colour of a role: blue for the sprint person, orange for the lunch host. */
  protected tagClass(role: CrewRole): string {
    return role === 'sprint_person' ? 'tag-sprint' : 'tag-lunch';
  }

  /** Opens the change dialog for a sprint and role. */
  protected change(sprint: CrewSprint, role: CrewRole): void {
    this.dialogs.open<boolean, ChangeData>(ChangeDialog, {
      data: { store: this.store, sprint, role, title: this.titleOf(sprint) },
      width: '560px',
    });
  }

  /** Opens the change dialog for a row of Upcoming on the turn to look at first (someone away); the turn can be switched. */
  protected changeRow(sprint: CrewSprint): void {
    const first =
      sprint.assignments.find((a) => a.away && !a.change) ??
      sprint.assignments[0];
    if (!first) return;
    this.dialogs.open<boolean, ChangeData>(ChangeDialog, {
      data: {
        store: this.store,
        sprint,
        role: first.role,
        pickRole: true,
        title: this.titleOf(sprint),
      },
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
        `${ROLE_WORDS[role].name} for ${this.titleOf(sprint)} goes back to the order.`
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
