import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { EndMeetingResult } from '@core/api/types';
import {
  carryOverCandidates,
  hasNextMeeting,
  meetingDay,
  meetingTime,
  moveTargets,
  raisedByLabel,
  suggestedCarryOver,
} from '@domain/meetings';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';

/**
 * What the End meeting dialog is opened with: the page's store, which holds the open meeting and closes it, and how:
 * `end` ends one in progress, `done` marks a planned one done, `cancel` cancels a planned one.
 */
export interface EndMeetingData {
  readonly store: MeetingsStore;
  readonly how: 'end' | 'done' | 'cancel';
}

/** The words of the dialog for each way of closing a meeting. */
const WORDS = {
  end: {
    heading: (title: string) => `End ${title}?`,
    keep: 'Keep it going',
    confirm: 'End meeting',
    busy: 'Ending…',
    toast: 'Meeting ended.',
  },
  done: {
    heading: (title: string) => `Mark ${title} done?`,
    keep: 'Not yet',
    confirm: 'Mark done',
    busy: 'Saving…',
    toast: 'Meeting marked done.',
  },
  cancel: {
    heading: (title: string) => `Cancel ${title}?`,
    keep: 'Keep it',
    confirm: 'Cancel meeting',
    busy: 'Cancelling…',
    toast: 'Meeting cancelled.',
  },
} as const;

/** "N topics" in words. */
function topics(n: number): string {
  return n === 1 ? '1 topic' : `${n} topics`;
}

/**
 * "End Finance sync?" (or "Mark Finance sync done?" for a meeting never started, or "Cancel Finance sync?" for one
 * that did not take place): the open topics with a tick each; the ticked ones move, with their notes, to the meeting
 * chosen below the list: the series' next meeting to begin with (planned from its cadence when none is), or any other
 * meeting running or planned, which is how a one-off meeting hands its topics on. Topics with no notes are ticked to
 * begin with, as most likely not reached, and every open topic of a cancelled meeting; the person decides. With no
 * meeting to take them, the topics stay. The meeting is read-only once closed.
 */
@Component({
  selector: 'ah-end-meeting-dialog',
  imports: [DialogShell],
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    label {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 8px 12px;
      border-bottom: 1px solid var(--line-soft);
    }
    label:last-child {
      border-bottom: 0;
    }
    input {
      margin-top: 3px;
      accent-color: var(--accent);
    }
    .destination {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .topic {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
  template: `
    <ah-dialog
      [icon]="cancelling ? 'close' : 'check'"
      [kind]="cancelling ? 'danger' : 'default'"
      [heading]="words.heading(title())"
      [cancelLabel]="words.keep"
      [confirmLabel]="confirmLabel()"
      [busyLabel]="words.busy"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>
        @if (cancelling) {
          It didn't take place.
        }
        @if (canMove()) {
          The topics you tick move, with their notes, to the meeting you choose.
          The rest stay here. After this the meeting is read-only.
        } @else if (inSeries()) {
          No next {{ title() }} is planned, so its topics stay here; plan the
          next one first to move them. After this the meeting is read-only.
        } @else {
          No other meeting is planned, so its topics stay here; plan one first
          to move them. After this the meeting is read-only.
        }
      </span>
      @if (canMove() && candidates().length > 0) {
        <fieldset class="list">
          <legend class="ah-sr">Topics to move to another meeting</legend>
          @for (topic of candidates(); track topic.id) {
            <label>
              <input
                type="checkbox"
                [checked]="chosen().has(topic.id)"
                (change)="toggle(topic.id)"
              />
              <span class="topic">
                <span>{{ topic.title }}</span>
                <span class="ah-hint"
                  >{{ label(topic) }} · {{ notes(topic.notes.length) }}</span
                >
              </span>
            </label>
          }
        </fieldset>
        <label class="destination">
          <span>Move them to</span>
          <select
            class="ah-input"
            [value]="destination()"
            (change)="destination.set(selected($event))"
          >
            @for (d of destinations(); track d.value) {
              <option [value]="d.value" [selected]="d.value === destination()">
                {{ d.label }}
              </option>
            }
          </select>
        </label>
        <span class="ah-hint">
          @if (!seriesNext()) {
            Tick the topics to move and pick where they go; unticked topics stay
            here.
          } @else if (cancelling) {
            Every open topic is ticked to begin with: none was discussed.
          } @else {
            Topics with no notes are ticked to begin with: they were most likely
            not reached.
          }
        </span>
      }
    </ah-dialog>
  `,
})
export class EndMeetingDialog {
  private readonly data = inject<EndMeetingData>(DIALOG_DATA);
  private readonly store = this.data.store;
  /** Whether the meeting is being cancelled rather than ended. */
  protected readonly cancelling = this.data.how === 'cancel';
  private readonly ref = inject<DialogRef<EndMeetingResult>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly busy = this.store.busy;
  protected readonly title = computed(
    () => this.store.meeting()?.title ?? 'meeting'
  );
  protected readonly inSeries = computed(
    () => (this.store.meeting()?.seriesId ?? null) !== null
  );
  /**
   * Whether the series has a next meeting for the ticked topics (planned, or planned from its cadence); when the series
   * is not read yet, the API decides.
   */
  protected readonly seriesNext = computed(() => {
    const meeting = this.store.meeting();
    if (meeting === null || meeting.seriesId === null) return false;
    const series = this.store.openSeries();
    return (
      series === null ||
      hasNextMeeting(meeting, this.store.meetings(), series.cadenceDays)
    );
  });
  /**
   * Where the ticked topics can go: the series' next meeting first (value `''`, as the API finds or plans it), then
   * every other meeting running or planned.
   */
  protected readonly destinations = computed(() => {
    const meeting = this.store.meeting();
    if (meeting === null) return [];
    const targets = moveTargets(meeting, this.store.meetings());
    const next = targets.find((t) => t.nextOfSeries);
    const label = (m: { title: string; startsAt: string }) =>
      `${m.title} · ${meetingDay(m.startsAt)} ${meetingTime(m.startsAt)}`;
    return [
      ...(this.seriesNext()
        ? [
            {
              value: '',
              label:
                next === undefined
                  ? `The next ${meeting.title} (planned from its rhythm)`
                  : `${label(next.meeting)} (next in this series)`,
            },
          ]
        : []),
      ...targets
        .filter((t) => !t.nextOfSeries)
        .map((t) => ({ value: t.meeting.id, label: label(t.meeting) })),
    ];
  });
  /** Whether ticked topics have a meeting to go to. */
  protected readonly canMove = computed(() => this.destinations().length > 0);
  /** The chosen destination: `''` for the series' next meeting, else a meeting's id. */
  readonly destination = signal(this.destinations()[0]?.value ?? '');
  protected readonly candidates = computed(() =>
    carryOverCandidates(this.store.meeting()?.topics ?? [])
  );
  /** The words for the way the person chose to close the meeting, fixed while the dialog is open. */
  protected readonly words = WORDS[this.data.how];
  /**
   * The ids of the ticked topics. Without a next meeting of the series none is ticked to begin with, so a plain confirm
   * never sends topics to a meeting of another series that the person did not pick.
   */
  readonly chosen = signal<ReadonlySet<string>>(
    new Set(
      !this.seriesNext()
        ? []
        : this.cancelling
          ? this.candidates().map((t) => t.id)
          : suggestedCarryOver(this.store.meeting()?.topics ?? [])
    )
  );
  private readonly failed = signal(false);
  protected readonly error = computed(() => {
    const error = this.store.commandError();
    return this.failed() && error !== null ? meetingErrorView(error) : null;
  });
  protected readonly confirmLabel = computed(() => {
    const n = this.canMove() ? this.chosen().size : 0;
    const confirm = this.words.confirm;
    return n === 0 ? confirm : `${confirm} · move ${topics(n)}`;
  });

  protected readonly label = raisedByLabel;

  /** "no notes", "1 note", "3 notes". */
  protected notes(n: number): string {
    return n === 0 ? 'no notes' : n === 1 ? '1 note' : `${n} notes`;
  }

  /** Ticks or unticks one topic. */
  toggle(id: string): void {
    const next = new Set(this.chosen());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.chosen.set(next);
  }

  protected selected(event: Event): string {
    return event.target instanceof HTMLSelectElement ? event.target.value : '';
  }

  /** Ends or cancels the meeting with the ticked topics; on a refusal the dialog stays open with the reason. */
  async submit(): Promise<void> {
    const carryOver = this.canMove() ? [...this.chosen()] : [];
    const to = this.destination() === '' ? null : this.destination();
    const toast = this.words.toast;
    const ended = this.cancelling
      ? await this.store.cancel(carryOver, to)
      : await this.store.end(carryOver, to);
    if (ended === null) {
      this.failed.set(true);
      return;
    }
    const next = ended.nextMeeting;
    this.toasts.show(
      next === null
        ? toast
        : `${toast} ${topics(carryOver.length)} moved to ${meetingDay(next.startsAt)}.`
    );
    this.ref.close(ended);
  }
}
