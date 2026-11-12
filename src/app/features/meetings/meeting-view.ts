import {
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { DialogService } from '@ui/dialog/dialog';
import { Router, RouterLink } from '@angular/router';
import type { Meeting, MeetingSummary } from '@core/api/types';
import {
  isClosed,
  meetingDay,
  meetingTime,
  meetingToConfluence,
  seriesNeighbours,
} from '@domain/meetings';
import { targetText } from '@domain/story-drafts';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { ActionsPanel } from './actions-panel';
import {
  CreateConfluencePageDialog,
  type CreateConfluencePageData,
} from './create-confluence-page-dialog';
import { EndMeetingDialog, type EndMeetingData } from './end-meeting-dialog';
import { meetingErrorView } from './meeting-errors';
import { MeetingsStore } from './meetings-store';
import { NEW_SERIES, openNewMeeting } from './new-meeting-dialog';
import { SeriesJiraDialog, type SeriesJiraData } from './series-jira-dialog';
import { StoryDraftsStore } from './story-drafts-store';
import { TopicCard } from './topic-card';
import { TopicComposer } from './topic-composer';

/** A topic of the previous meeting of the series that still has open actions or questions. */
interface StillOpenTopic {
  readonly topicId: string;
  readonly title: string;
  readonly actions: number;
  readonly questions: number;
}

/** The previous meeting's topics still open, and whether they can be brought here (it is not closed). */
interface StillOpen {
  readonly previous: MeetingSummary;
  readonly canMove: boolean;
  readonly topics: readonly StillOpenTopic[];
}

/** "1 action open", "2 actions open". */
function actionsOpen(n: number): string {
  return n === 1 ? '1 action open' : `${n} actions open`;
}

/** "1 question", "2 questions". */
function questionCount(n: number): string {
  return n === 1 ? '1 question' : `${n} questions`;
}

/** "Planned", "In progress", "Ended" or "Cancelled", with the badge it wears. */
const STATUS_WORDS = {
  planned: {
    label: 'Planned',
    badge: 'ah-badge ah-badge--queued',
    api: 'planned',
  },
  in_progress: {
    label: 'In progress',
    badge: 'ah-badge ah-badge--running',
    api: 'in_progress',
  },
  ended: { label: 'Ended', badge: 'ah-tag', api: 'ended' },
  cancelled: { label: 'Cancelled', badge: 'ah-tag', api: 'cancelled' },
} as const;

/**
 * The meeting open on the right of the Meetings page (boards `Meetings` and `MeetingNext`): its status, day and
 * stakeholders, the series' previous and next meetings, where its stories go in Jira (the series' target, or a one-off
 * meeting's own, which can be set also after it ended), Start, Mark done and Cancel (or End once it runs), the line that
 * adds a topic, the series' open actions and this meeting's decisions, and the topics with their notes. `/meetings`
 * opens the meeting running now, else the next planned one, else the latest that ended; `/meetings/:id` opens that one.
 */
@Component({
  selector: 'ah-meeting-view',
  imports: [
    ActionsPanel,
    Banner,
    Button,
    EmptyState,
    RouterLink,
    Skeleton,
    TopicCard,
    TopicComposer,
  ],
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
      flex: 1 1 420px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 29px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .jira {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: center;
    }
    .series-nav {
      display: flex;
      gap: 8px;
      font-size: 13px;
    }
    .topics-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .none {
      padding: 24px 16px;
      text-align: center;
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius-lg);
    }
    .empty {
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius-lg);
    }
    .hint {
      margin: 0;
    }
    .first-topic {
      width: 100%;
      max-width: 640px;
      margin-inline: auto;
    }
    /* What the previous meeting of the series left open, to bring into this one. */
    .still-open {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface-sunken);
    }
    .still-open-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .still-open ul,
    .silent-topics {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .still-open li,
    .silent-topics li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .still-open .topic-title,
    .silent-topics .topic-title {
      flex: 1 1 200px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .silent-topics li {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
    }
    /* The meeting while it is read: its header and three topic cards, where they will be. */
    .loading,
    .loading .identity,
    .loading .card {
      display: flex;
      flex-direction: column;
    }
    .loading {
      gap: 14px;
    }
    .loading .identity {
      gap: 10px;
    }
    .loading .card {
      gap: 10px;
      padding: var(--space-4);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }
  `,
  template: `
    @if (openFailure(); as problem) {
      <ah-banner
        [variant]="problem.variant"
        [heading]="problem.heading"
        [tech]="problem.tech ?? ''"
        >{{ problem.text }}</ah-banner
      >
    }
    @if (noMeetings()) {
      <div class="empty">
        <ah-empty-state
          heading="No meetings yet"
          icon="calendar-plus"
          size="page"
        >
          Plan a meeting with your stakeholders: list the topics to raise, then
          write notes, decisions and actions under each one as you talk.
          <button
            ahButton="primary"
            ahEmptyAction
            type="button"
            (click)="newMeeting()"
          >
            New meeting
          </button>
          <button ahButton ahEmptyAction type="button" (click)="newSeries()">
            New weekly series
          </button>
          <p ahEmptyExtra class="ah-hint hint">
            In a series, open topics move on to the next meeting when one ends.
          </p>
        </ah-empty-state>
      </div>
    }
    @if (reading()) {
      <div class="loading" aria-busy="true" aria-label="Loading the meeting">
        <div class="header">
          <div class="identity">
            <ah-skeleton width="220px" [height]="22" />
            <ah-skeleton width="45%" [height]="24" />
            <ah-skeleton width="30%" />
          </div>
          <div class="actions">
            <ah-skeleton width="150px" [height]="32" />
            <ah-skeleton width="120px" [height]="32" />
          </div>
        </div>
        <ah-skeleton width="140px" [height]="15" />
        @for (width of cardWidths; track $index) {
          <div class="card">
            <ah-skeleton [width]="width" [height]="14" />
            <ah-skeleton width="85%" />
            <ah-skeleton width="60%" />
          </div>
        }
      </div>
    }
    @if (meeting(); as m) {
      <div class="header">
        <div class="identity">
          <div class="status">
            <span [class]="status().badge">
              @if (!closed()) {
                <i class="ah-badge__dot"></i>
              }
              {{ status().label }}</span
            >
            <span class="ah-api">{{ status().api }}</span>
            <span class="ah-hint">{{ when() }}</span>
            @if (m.seriesName !== null) {
              <span class="ah-tag">{{ m.seriesName }}</span>
            }
            @if (neighbours(); as n) {
              <nav
                class="series-nav"
                [attr.aria-label]="'Other ' + m.seriesName + ' meetings'"
              >
                @if (n.previous; as p) {
                  <a
                    [routerLink]="['/meetings', p.id]"
                    [attr.aria-label]="
                      'Previous ' + m.seriesName + ', ' + day(p.startsAt)
                    "
                    >‹ {{ day(p.startsAt) }}</a
                  >
                }
                @if (n.next; as x) {
                  <a
                    [routerLink]="['/meetings', x.id]"
                    [attr.aria-label]="
                      'Next ' + m.seriesName + ', ' + day(x.startsAt)
                    "
                    >{{ day(x.startsAt) }} ›</a
                  >
                }
              </nav>
            }
          </div>
          <h1>{{ m.title }}</h1>
          @if (m.stakeholders.length > 0) {
            <span class="ah-muted">With {{ m.stakeholders.join(', ') }}</span>
          }
          @if (target(); as t) {
            <span class="jira">
              <span class="ah-hint">{{ jiraTarget() }}</span>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="changeTarget()"
              >
                {{ t.projectKey === null ? 'Set the Jira project' : 'Change' }}
              </button>
            </span>
          }
        </div>
        <div class="actions">
          <button
            ahButton
            type="button"
            [disabled]="m.topics.length === 0"
            (click)="copyConfluence()"
          >
            Copy for Confluence
          </button>
          @if (m.confluencePage; as page) {
            <a
              ahButton
              [href]="page.url"
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="
                'Open ' + page.title + ' in Confluence (new tab)'
              "
              [title]="page.title"
            >
              Open in Confluence
            </a>
          } @else {
            <button
              ahButton
              type="button"
              [disabled]="m.topics.length === 0"
              (click)="createConfluence()"
            >
              Create in Confluence
            </button>
          }
          @if (m.status === 'planned') {
            <button
              ahButton="ghost"
              type="button"
              [disabled]="busy()"
              (click)="end('cancel')"
            >
              Cancel meeting
            </button>
            <button
              ahButton
              type="button"
              [disabled]="busy()"
              (click)="end('done')"
            >
              Mark done
            </button>
            <button
              ahButton="primary"
              type="button"
              [disabled]="busy()"
              (click)="store.start()"
            >
              Start meeting
            </button>
          } @else if (m.status === 'in_progress') {
            <button ahButton type="button" [disabled]="busy()" (click)="end()">
              End meeting
            </button>
          }
        </div>
      </div>

      @if (commandFailure(); as problem) {
        <ah-banner
          [variant]="problem.variant"
          [heading]="problem.heading"
          [tech]="problem.tech ?? ''"
        >
          {{ problem.text }}
          <button
            ahButton="ghost"
            size="sm"
            type="button"
            (click)="store.dismissError()"
          >
            Dismiss
          </button>
        </ah-banner>
      }

      @if (m.status === 'ended') {
        <ah-banner variant="info" heading="This meeting has ended">
          It ended {{ endedAt() }} and is read-only. Topics that moved on link
          to the meeting that took them.
        </ah-banner>
      } @else if (m.status === 'cancelled') {
        <ah-banner variant="info" heading="This meeting was cancelled">
          It was cancelled {{ endedAt() }} and is read-only. Topics that moved
          on link to the meeting that took them.
        </ah-banner>
      } @else if (m.topics.length > 0) {
        <ah-topic-composer />
      }

      <ah-actions-panel />

      @if (drafts.loadError() !== null) {
        <span class="ah-hint" role="status"
          >The topics' user stories couldn't be read, so their state isn't
          shown. Refresh to try again.</span
        >
      }

      @if (!closed() && m.topics.length === 0) {
        <div class="empty">
          <ah-empty-state heading="No topics yet" icon="document" size="page">
            Add what you want to talk about. Notes, decisions and actions are
            written under each topic during the meeting.
            <div ahEmptyExtra class="first-topic"><ah-topic-composer /></div>
          </ah-empty-state>
        </div>
        @if (stillOpen(); as open) {
          <section class="still-open" aria-labelledby="still-open-heading">
            <div class="still-open-head">
              <h2 id="still-open-heading">
                Still open from {{ day(open.previous.startsAt) }}
              </h2>
              @if (open.canMove && open.topics.length > 1) {
                <button
                  ahButton="soft"
                  size="sm"
                  type="button"
                  [disabled]="busy()"
                  (click)="carryAll(open.topics)"
                >
                  Carry all over
                </button>
              }
            </div>
            <ul>
              @for (topic of open.topics; track topic.topicId) {
                <li>
                  <span class="topic-title">{{ topic.title }}</span
                  >&ngsp;
                  @if (topic.actions > 0) {
                    <span class="ah-tag">{{ actionsOpen(topic.actions) }}</span
                    >&ngsp;
                  }
                  @if (topic.questions > 0) {
                    <span class="ah-tag">{{
                      questionCount(topic.questions)
                    }}</span>
                  }
                  @if (open.canMove) {
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-label]="'Carry over ' + topic.title"
                      (click)="store.carryOver(topic.topicId)"
                    >
                      Carry over
                    </button>
                  }
                </li>
              }
            </ul>
            @if (!open.canMove) {
              <p class="ah-hint hint">
                That meeting is closed, so its topics stay there. Add the ones
                to raise again above.
              </p>
            }
          </section>
        }
      } @else if (silent()) {
        <div class="empty">
          <ah-empty-state
            heading="No notes were taken in this meeting"
            icon="document"
            size="page"
          >
            {{ silentText() }}
          </ah-empty-state>
        </div>
        @if (m.topics.length > 0) {
          <div class="topics-head">
            <h2>Topics</h2>
            <span class="ah-tabs__count">{{ m.topics.length }}</span>
          </div>
          <ul class="silent-topics">
            @for (topic of m.topics; track topic.id) {
              <li>
                <span class="topic-title">{{ topic.title }}</span
                >&ngsp;
                <span class="ah-hint">{{
                  topic.status === 'moved' ? 'moved on' : 'no notes'
                }}</span>
              </li>
            }
          </ul>
        }
      } @else {
        <div class="topics-head">
          <h2>{{ m.status === 'planned' ? 'Topics to raise' : 'Topics' }}</h2>
          <span class="ah-tabs__count">{{ m.topics.length }}</span>
        </div>

        @if (m.topics.length === 0) {
          <div class="none ah-muted">
            @if (m.status === 'planned') {
              No topics yet. Add the ones you want to raise; stakeholders'
              topics can be added too.
            } @else {
              No topics were noted in this meeting.
            }
          </div>
        } @else {
          <div class="list">
            @for (
              topic of m.topics;
              track topic.id;
              let first = $first;
              let last = $last
            ) {
              <ah-topic-card
                [topic]="topic"
                [meetingOpen]="!closed()"
                [first]="first"
                [last]="last"
              />
            }
          </div>
        }
      }
    }
  `,
})
export class MeetingView {
  protected readonly store = inject(MeetingsStore);
  protected readonly drafts = inject(StoryDraftsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  /** The meeting in the address (`/meetings/:id`); none for `/meetings`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly meeting = this.store.meeting;
  protected readonly busy = this.store.busy;
  protected readonly status = computed(
    () => STATUS_WORDS[this.meeting()?.status ?? 'planned']
  );
  /** Whether the meeting ended or was cancelled, so it is read-only. */
  protected readonly closed = computed(() =>
    isClosed(this.meeting()?.status ?? 'planned')
  );
  protected readonly when = computed(() => {
    const m = this.meeting();
    if (m === null) return '';
    const end = m.endsAt === null ? '' : `–${meetingTime(m.endsAt)}`;
    return `${meetingDay(m.startsAt)} · ${meetingTime(m.startsAt)}${end}`;
  });
  protected readonly endedAt = computed(() => {
    const at = this.meeting()?.endedAt ?? null;
    return at === null ? '' : `on ${meetingDay(at)} at ${meetingTime(at)}`;
  });
  protected readonly series = this.store.openSeries;
  /** Where the meeting's stories go: its series' Jira target, or a one-off meeting's own. */
  protected readonly target = this.store.openTarget;
  /** "Stories go to FIN · Story", or that the series or meeting has none. */
  protected readonly jiraTarget = computed(() => {
    const t = this.target();
    if (t === null) return '';
    const text = targetText(t);
    if (text !== null) return `Stories go to ${text}`;
    return this.meeting()?.seriesId === null
      ? 'Stories from this meeting are not created in Jira yet'
      : 'Stories from this series are not created in Jira yet';
  });
  /** The meetings before and after this one in its series, for the arrows beside the series' name. */
  protected readonly neighbours = computed(() => {
    const m = this.meeting();
    if (m === null || m.seriesId === null) return null;
    const n = seriesNeighbours(m, this.store.meetings());
    return n.previous === null && n.next === null ? null : n;
  });
  protected readonly day = meetingDay;
  protected readonly actionsOpen = actionsOpen;
  protected readonly questionCount = questionCount;
  /**
   * Whether the meeting to show is still being read: there is none on screen and nothing else to say instead (no
   * meeting at all, or a list or meeting that could not be read).
   */
  protected readonly reading = computed(
    () =>
      this.meeting() === null &&
      !this.noMeetings() &&
      this.openFailure() === null &&
      this.store.loadError() === null
  );
  protected readonly cardWidths = ['55%', '40%', '48%'];
  /** Whether the list was read and has no meeting at all, with none asked for in the address: the first use. */
  protected readonly noMeetings = computed(
    () =>
      this.store.loaded() &&
      this.store.meetings().length === 0 &&
      this.id() === undefined &&
      this.openFailure() === null
  );
  /**
   * For an open meeting with no topic yet: the topics of the series' previous meeting that still have open actions or
   * questions, to bring here; null when there are none.
   */
  protected readonly stillOpen = computed((): StillOpen | null => {
    const m = this.meeting();
    if (m === null || this.closed() || m.topics.length > 0) return null;
    const previous = seriesNeighbours(m, this.store.meetings()).previous;
    if (previous === null) return null;
    const topics = new Map<string, StillOpenTopic>();
    const count = (
      notes: readonly {
        note: { topicId: string };
        topicTitle: string;
        meetingId: string;
      }[],
      kind: 'actions' | 'questions'
    ) => {
      for (const n of notes) {
        if (n.meetingId !== previous.id) continue;
        const was = topics.get(n.note.topicId) ?? {
          topicId: n.note.topicId,
          title: n.topicTitle,
          actions: 0,
          questions: 0,
        };
        topics.set(n.note.topicId, { ...was, [kind]: was[kind] + 1 });
      }
    };
    count(this.store.openActions(), 'actions');
    count(this.store.openQuestions(), 'questions');
    return topics.size === 0
      ? null
      : {
          previous,
          canMove: !isClosed(previous.status),
          topics: [...topics.values()],
        };
  });
  /** Whether the meeting ended with no note under any of its topics. */
  protected readonly silent = computed(() => {
    const m = this.meeting();
    return (
      m !== null &&
      m.status === 'ended' &&
      m.topics.every((t) => t.notes.length === 0)
    );
  });
  /** How many topics were on the list of a meeting that ended with no notes. */
  protected readonly silentText = computed(() => {
    const n = this.meeting()?.topics.length ?? 0;
    return n === 0
      ? 'No topics were on the list either.'
      : n === 1
        ? '1 topic was on the list, with no notes under it.'
        : `${n} topics were on the list, with no notes under them.`;
  });
  /** The open meeting's id, so the drafts are read once per meeting and not after every change to it. */
  private readonly meetingId = computed(() => this.meeting()?.id ?? null);
  protected readonly openFailure = computed(() => {
    const error = this.store.openError();
    return error === null ? null : meetingErrorView(error);
  });
  protected readonly commandFailure = computed(() => {
    const error = this.store.commandError();
    return error === null ? null : meetingErrorView(error);
  });

  constructor() {
    // Once the list is read, open the meeting in the address, or the default one.
    effect(() => {
      const id = this.id();
      if (!this.store.loaded()) return;
      untracked(() => void this.store.show(id));
    });
    // The topics' story drafts belong to the meeting on screen.
    effect(() => {
      const meetingId = this.meetingId();
      untracked(() => void this.drafts.load(meetingId));
    });
  }

  /** Opens the Jira target: the series', or a one-off meeting's own. */
  protected changeTarget(): void {
    const meeting = this.meeting();
    if (meeting === null) return;
    const series = this.series();
    if (meeting.seriesId !== null && series === null) return;
    this.dialogs
      .open<unknown, SeriesJiraData>(SeriesJiraDialog, {
        data:
          series !== null
            ? { store: this.store, series }
            : { store: this.store, meeting },
      })
      .closed.subscribe((changed) => {
        if (changed !== undefined) void this.drafts.reload();
      });
  }

  /** The meeting as Confluence wiki markup, with its series' open questions. */
  private confluenceMarkup(meeting: Meeting): string {
    return meetingToConfluence(
      meeting,
      this.store.openQuestions().map((q) => ({
        text: q.note.text,
        from:
          q.meetingId === meeting.id
            ? null
            : {
                topicTitle: q.topicTitle,
                meetingStartsAt: q.meetingStartsAt,
              },
      })),
      this.store.labels()
    );
  }

  /** Copies the meeting as Confluence wiki markup; the Clipboard API can be missing or refused. */
  protected async copyConfluence(): Promise<void> {
    const meeting = this.meeting();
    if (meeting === null) return;
    try {
      await navigator.clipboard.writeText(this.confluenceMarkup(meeting));
      this.toasts.show('Meeting copied as Confluence markup.');
    } catch {
      this.toasts.show(
        "Couldn't copy to the clipboard. Allow clipboard access and try again."
      );
    }
  }

  /** Creates the meeting's Confluence page under a parent picked in the Create in Confluence dialog. */
  protected createConfluence(): void {
    const meeting = this.meeting();
    if (meeting === null) return;
    this.dialogs.open<Meeting, CreateConfluencePageData>(
      CreateConfluencePageDialog,
      {
        data: {
          store: this.store,
          meeting,
          body: this.confluenceMarkup(meeting),
        },
        width: '560px',
      }
    );
  }

  /** Plans a meeting in the New meeting dialog and opens it. */
  protected newMeeting(): void {
    openNewMeeting(this.dialogs, this.router, this.store);
  }

  /** Plans the first meeting of a new series (weekly unless changed) in the New meeting dialog. */
  protected newSeries(): void {
    openNewMeeting(this.dialogs, this.router, this.store, NEW_SERIES);
  }

  /** Brings every still-open topic of the previous meeting here, in order; stops at the first refusal. */
  protected async carryAll(topics: readonly StillOpenTopic[]): Promise<void> {
    this.store.dismissError();
    for (const topic of topics) {
      if (!(await this.store.carryOver(topic.topicId))) return;
    }
  }

  /** Asks which open topics move on, then ends (marks done) or cancels the meeting. */
  protected end(how: EndMeetingData['how'] = 'end'): void {
    this.store.dismissError();
    this.dialogs.open<unknown, EndMeetingData>(EndMeetingDialog, {
      data: { store: this.store, how },
      width: '560px',
    });
  }
}
