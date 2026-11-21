import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { MeetingNoteInContext, MeetingSummary } from '@core/api/types';
import { CLOCK } from '@core/realtime/clock';
import {
  meetingDay,
  meetingTime,
  nextSessionAfter,
  seriesOverviews,
} from '@domain/meetings';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Table } from '@ui/table/table';
import { openEditMeeting } from './edit-meeting-dialog';
import { openEditSeries } from './edit-series-dialog';
import { MeetingsStore } from './meetings-store';
import { openNewMeeting } from './new-meeting-dialog';

/** How many sessions the page lists before Show older. */
export const SESSIONS_PAGE = 8;

/** A session's status in words, with the tag it shows. */
const SESSION_STATUS: Readonly<
  Record<MeetingSummary['status'], { label: string; tag: string }>
> = {
  planned: { label: 'planned', tag: 'ah-tag ah-tag--accent' },
  in_progress: { label: 'in progress', tag: 'ah-tag ah-tag--accent' },
  ended: { label: 'done', tag: 'ah-tag' },
  cancelled: { label: 'cancelled', tag: 'ah-tag ah-tag--outline' },
};

/** "3 topics", "1 topic", "no topics". */
function topics(n: number): string {
  return n === 0 ? 'no topics' : n === 1 ? '1 topic' : `${n} topics`;
}

/**
 * A series' page (`/meetings/series/:seriesId`): its rhythm, stakeholders and Jira project; its next session; every
 * session, planned, done or cancelled; and its open actions. Edit series opens the Edit dialog on the next planned
 * session (the change goes to it and the following ones); Add session plans an extra one. 0 AIU.
 */
@Component({
  selector: 'ah-series-page',
  imports: [Button, EmptyState, Panel, PanelBody, PanelHead, RouterLink, Table],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
    }
    .identity {
      flex: 1 1 360px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--ink-muted);
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 29px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .rhythm {
      color: var(--accent-text);
      font-weight: 700;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .next {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 14px;
    }
    .next .day {
      font-size: 20px;
      font-weight: 700;
    }
    .next a {
      margin-left: auto;
    }
    table {
      width: 100%;
    }
    .actions-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `,
  template: `
    @if (overview(); as o) {
      <div class="header">
        <div class="identity">
          <span class="eyebrow">Series</span>
          <h1>{{ o.series.name }}</h1>
          <span
            ><span class="rhythm"
              >{{ o.series.cadenceDays !== null ? '↻ ' : ''
              }}{{ o.rhythm }}</span
            >
            @if (o.series.jiraProjectKey !== null) {
              <span class="ah-muted">
                · Stories go to {{ o.series.jiraProjectKey }}</span
              >
            }
          </span>
          @if (o.series.stakeholders.length > 0) {
            <span class="ah-muted"
              >With {{ o.series.stakeholders.join(', ') }}</span
            >
          }
        </div>
        <div class="actions">
          <button
            ahButton
            type="button"
            [disabled]="store.busy()"
            (click)="addSession()"
          >
            Add session
          </button>
          <button
            ahButton="primary"
            type="button"
            [disabled]="store.busy()"
            (click)="editSeries()"
          >
            Edit series
          </button>
        </div>
      </div>

      <ah-panel>
        <ah-panel-head heading="Next session" />
        <ah-panel-body>
          @if (o.next; as n) {
            <div class="next">
              <span class="day">{{ day(n.startsAt) }}</span>
              <span class="ah-muted"
                >{{ hours(n) }} · {{ topicCount(n.topicCount) }}</span
              >
              <a ahButton size="sm" [routerLink]="['/meetings', n.id]">Open</a>
            </div>
            @if (o.series.cadenceDays !== null) {
              <p class="ah-hint">
                When a session is marked done or cancelled, Ahoy plans the next
                one, so this series always has one in Upcoming.
              </p>
            }
          } @else {
            <p class="ah-muted">
              Nothing is planned.
              @if (o.series.cadenceDays === null) {
                This series has no fixed rhythm: add the next session yourself.
              }
            </p>
            @if (planNext() !== null) {
              <button
                ahButton
                size="sm"
                type="button"
                [disabled]="store.busy()"
                (click)="planNextSession()"
              >
                Plan next
              </button>
            }
          }
        </ah-panel-body>
      </ah-panel>

      <ah-panel>
        <ah-panel-head heading="Sessions" />
        <ah-panel-body>
          <table ahTable>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Topics</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (s of shownSessions(); track s.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/meetings', s.id]"
                      >{{ day(s.startsAt) }} · {{ time(s.startsAt) }}</a
                    >
                  </td>
                  <td>
                    {{
                      s.status === 'cancelled'
                        ? 'did not take place'
                        : topicCount(s.topicCount)
                    }}
                  </td>
                  <td>
                    <span [class]="status[s.status].tag">{{
                      status[s.status].label
                    }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (olderHidden() > 0) {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="shown.set(shown() + page)"
            >
              Show {{ olderHidden() }} older
            </button>
          }
        </ah-panel-body>
      </ah-panel>

      <ah-panel>
        <ah-panel-head
          heading="Open actions of the series"
          [subtitle]="actionCount()"
        />
        <ah-panel-body>
          @if (actions(); as list) {
            @if (list.length === 0) {
              <p class="ah-muted">No open actions.</p>
            } @else {
              <ul class="actions-list">
                @for (a of list; track a.note.id) {
                  <li>
                    <span class="ah-tag">Action</span>
                    {{ a.note.text }}
                    <span class="ah-hint"
                      >· {{ a.note.owner ?? 'no owner' }} · from
                      {{ day(a.meetingStartsAt) }}</span
                    >
                  </li>
                }
              </ul>
            }
          } @else {
            <p class="ah-muted" role="alert">
              The open actions could not be loaded. Reload the page to try
              again.
            </p>
          }
        </ah-panel-body>
      </ah-panel>
    } @else if (store.loaded()) {
      <ah-empty-state heading="This series does not exist" icon="compass">
        It may have been removed.
        <a ahButton ahEmptyAction routerLink="/meetings">Back to meetings</a>
      </ah-empty-state>
    }
  `,
})
export class SeriesPage {
  protected readonly store = inject(MeetingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);

  /** The series in the address. */
  readonly seriesId = input<string | undefined>(undefined);

  protected readonly status = SESSION_STATUS;
  protected readonly day = meetingDay;
  protected readonly time = meetingTime;
  protected readonly topicCount = topics;
  protected readonly page = SESSIONS_PAGE;
  /** How many sessions show; Show older adds a page. */
  readonly shown = signal(SESSIONS_PAGE);
  /** The series' open actions; null when they could not be read. */
  readonly actions = signal<readonly MeetingNoteInContext[] | null>([]);

  /** The number of open actions for the panel's subtitle; none while they load or when they could not be read. */
  protected readonly actionCount = computed(() => {
    const list = this.actions();
    return list === null || list.length === 0 ? '' : String(list.length);
  });
  /** The next session of the series' rhythm, when it repeats and nothing is planned. */
  protected readonly planNext = computed(() => {
    const o = this.overview();
    if (o === null || o.next !== null) return null;
    const { cadenceDays, startsAt, endsAt } = o.series;
    if (cadenceDays === null || startsAt === null) return null;
    return (
      nextSessionAfter(startsAt, endsAt, cadenceDays, this.clock.now()) ?? null
    );
  });
  protected readonly overview = computed(() => {
    const id = this.seriesId();
    const series = this.store.series().find((s) => s.id === id);
    if (series === undefined) return null;
    return seriesOverviews([series], this.store.meetings())[0] ?? null;
  });
  protected readonly shownSessions = computed(
    () => this.overview()?.sessions.slice(0, this.shown()) ?? []
  );
  protected readonly olderHidden = computed(() =>
    Math.max(0, (this.overview()?.sessions.length ?? 0) - this.shown())
  );
  /** The session Edit series starts from: the next planned one. */
  protected readonly editable = computed(() => {
    const o = this.overview();
    if (o === null) return null;
    return o.sessions.find((s) => s.status === 'planned') ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.seriesId();
      if (id === undefined) return;
      untracked(() => void this.loadActions(id));
    });
  }

  private async loadActions(id: string): Promise<void> {
    const items = await this.store.seriesActions(id);
    if (this.seriesId() === id) this.actions.set(items);
  }

  /** "10:00–11:00", or the start alone. */
  protected hours(m: MeetingSummary): string {
    return m.endsAt === null
      ? meetingTime(m.startsAt)
      : `${meetingTime(m.startsAt)}–${meetingTime(m.endsAt)}`;
  }

  /** Plans an extra session of the series in the New meeting dialog. */
  protected addSession(): void {
    const o = this.overview();
    if (o === null) return;
    openNewMeeting(this.dialogs, this.router, this.store, o.series.id);
  }

  /** Plans the next session of the rhythm, with the series' name, length and stakeholders. */
  protected async planNextSession(): Promise<void> {
    const o = this.overview();
    const next = this.planNext();
    if (o === null || next === null) return;
    await this.store.create({
      seriesId: o.series.id,
      title: '',
      startsAt: next.startsAt,
      ...(next.endsAt !== null ? { endsAt: next.endsAt } : {}),
    });
  }

  /** Opens the Edit dialog on the next planned session, where a change goes to it and the following ones; with none planned, on the series. */
  protected editSeries(): void {
    const session = this.editable();
    if (session !== null) {
      openEditMeeting(this.dialogs, this.store, session);
      return;
    }
    // Nothing planned: only the series itself can change.
    const o = this.overview();
    if (o !== null) openEditSeries(this.dialogs, this.store, o.series);
  }
}
