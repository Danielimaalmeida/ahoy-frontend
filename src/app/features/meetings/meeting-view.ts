import {
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { DialogService } from '@ui/dialog/dialog';
import {
  isClosed,
  meetingDay,
  meetingTime,
  meetingToConfluence,
} from '@domain/meetings';
import { targetText } from '@domain/story-drafts';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { ToastService } from '@ui/toast/toast';
import { ActionsPanel } from './actions-panel';
import { EndMeetingDialog, type EndMeetingData } from './end-meeting-dialog';
import { meetingErrorView } from './meeting-errors';
import { MeetingsStore } from './meetings-store';
import { SeriesJiraDialog, type SeriesJiraData } from './series-jira-dialog';
import { StoryDraftsStore } from './story-drafts-store';
import { TopicCard } from './topic-card';
import { TopicComposer } from './topic-composer';

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
 * stakeholders, Start, Mark done and Cancel (or End once it runs), the line that adds a topic, the series' open actions
 * and this meeting's decisions, and the topics with their notes. `/meetings` opens the meeting running now, else the
 * next planned one, else the latest that ended; `/meetings/:id` opens that one.
 */
@Component({
  selector: 'ah-meeting-view',
  imports: [ActionsPanel, Banner, Button, TopicCard, TopicComposer],
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
      gap: 8px;
    }
    .jira {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: center;
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
          </div>
          <h1>{{ m.title }}</h1>
          @if (m.stakeholders.length > 0) {
            <span class="ah-muted">With {{ m.stakeholders.join(', ') }}</span>
          }
          @if (series(); as s) {
            <span class="jira">
              <span class="ah-hint">{{ jiraTarget() }}</span>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                (click)="changeTarget()"
              >
                {{
                  s.jiraProjectKey === null ? 'Set the Jira project' : 'Change'
                }}
              </button>
            </span>
          }
        </div>
        <div class="actions">
          <button ahButton type="button" (click)="copyConfluence()">
            Copy for Confluence
          </button>
          @if (m.status === 'planned') {
            <button
              ahButton="ghost"
              type="button"
              [disabled]="busy()"
              (click)="end('cancel')"
            >
              Cancel meeting
            </button>
            <button ahButton type="button" [disabled]="busy()" (click)="end()">
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
      } @else {
        <ah-topic-composer />
      }

      <ah-actions-panel />

      @if (drafts.loadError() !== null) {
        <span class="ah-hint" role="status"
          >The topics' user stories couldn't be read, so their state isn't
          shown. Refresh to try again.</span
        >
      }

      <div class="topics-head">
        <h2>{{ m.status === 'planned' ? 'Topics to raise' : 'Topics' }}</h2>
        <span class="ah-tabs__count">{{ m.topics.length }}</span>
      </div>

      @if (m.topics.length === 0) {
        <div class="none ah-muted">
          @if (m.status === 'planned') {
            No topics yet. Add the ones you want to raise; stakeholders' topics
            can be added too.
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
              [inSeries]="m.seriesId !== null"
              [first]="first"
              [last]="last"
            />
          }
        </div>
      }
    }
  `,
})
export class MeetingView {
  protected readonly store = inject(MeetingsStore);
  protected readonly drafts = inject(StoryDraftsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);

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
  /** "Stories go to FIN as Story", or that the series has none. */
  protected readonly jiraTarget = computed(() => {
    const s = this.series();
    if (s === null) return '';
    const text = targetText({
      projectKey: s.jiraProjectKey,
      issueType: s.jiraIssueType,
    });
    return text === null
      ? 'Stories from this series are not created in Jira yet'
      : `Stories go to ${text}`;
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

  /** Opens the series' Jira target. */
  protected changeTarget(): void {
    const series = this.series();
    if (series === null) return;
    this.dialogs
      .open<unknown, SeriesJiraData>(SeriesJiraDialog, {
        data: { store: this.store, series },
      })
      .closed.subscribe((changed) => {
        if (changed !== undefined) void this.drafts.reload();
      });
  }

  /** Copies the meeting as Confluence wiki markup; the Clipboard API can be missing or refused. */
  protected async copyConfluence(): Promise<void> {
    const meeting = this.meeting();
    if (meeting === null) return;
    try {
      await navigator.clipboard.writeText(meetingToConfluence(meeting));
      this.toasts.show('Meeting copied as Confluence markup.');
    } catch {
      this.toasts.show(
        "Couldn't copy to the clipboard. Allow clipboard access and try again."
      );
    }
  }

  /** Asks which open topics move on, then ends (marks done) or cancels the meeting. */
  protected end(how: 'end' | 'cancel' = 'end'): void {
    this.store.dismissError();
    this.dialogs.open<unknown, EndMeetingData>(EndMeetingDialog, {
      data: { store: this.store, how },
      width: '560px',
    });
  }
}
