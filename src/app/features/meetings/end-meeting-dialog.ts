import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { EndMeetingResult } from '@core/api/types';
import {
  carryOverCandidates,
  meetingDay,
  raisedByLabel,
  suggestedCarryOver,
} from '@domain/meetings';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';

/**
 * What the End meeting dialog is opened with: the page's store, which holds the open meeting and closes it, and how:
 * `end` (the default) ends it or marks a planned one done, `cancel` cancels a planned one.
 */
export interface EndMeetingData {
  readonly store: MeetingsStore;
  readonly how?: 'end' | 'cancel';
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
 * that did not take place): the open topics with a tick each; the ticked ones move, with their notes, to the series'
 * next meeting (planned from its cadence when none is). Topics with no notes are ticked to begin with, as most likely
 * not reached, and every open topic of a cancelled meeting; the person decides. A meeting outside a series keeps its
 * topics. The meeting is read-only once closed.
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
      [heading]="words().heading(title())"
      [cancelLabel]="words().keep"
      [confirmLabel]="confirmLabel()"
      [busyLabel]="words().busy"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>
        @if (cancelling) {
          It didn't take place.
        }
        @if (inSeries()) {
          The topics you tick move, with their notes, to the next {{ title() }}.
          The rest stay here. After this the meeting is read-only.
        } @else {
          This meeting isn't part of a series, so its topics stay here. After
          this the meeting is read-only.
        }
      </span>
      @if (inSeries() && candidates().length > 0) {
        <fieldset class="list">
          <legend class="ah-sr">Topics to move to the next meeting</legend>
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
        <span class="ah-hint">
          @if (cancelling) {
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
  protected readonly candidates = computed(() =>
    carryOverCandidates(this.store.meeting()?.topics ?? [])
  );
  /** The words for cancelling, marking a meeting never started done, or ending one in progress. */
  protected readonly words = computed(() =>
    this.cancelling
      ? WORDS.cancel
      : this.store.meeting()?.status === 'planned'
        ? WORDS.done
        : WORDS.end
  );
  /** The ids of the ticked topics. */
  readonly chosen = signal<ReadonlySet<string>>(
    new Set(
      this.cancelling
        ? carryOverCandidates(this.store.meeting()?.topics ?? []).map(
            (t) => t.id
          )
        : suggestedCarryOver(this.store.meeting()?.topics ?? [])
    )
  );
  private readonly failed = signal(false);
  protected readonly error = computed(() => {
    const error = this.store.commandError();
    return this.failed() && error !== null ? meetingErrorView(error) : null;
  });
  protected readonly confirmLabel = computed(() => {
    const n = this.inSeries() ? this.chosen().size : 0;
    const confirm = this.words().confirm;
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

  /** Ends or cancels the meeting with the ticked topics; on a refusal the dialog stays open with the reason. */
  async submit(): Promise<void> {
    const carryOver = this.inSeries() ? [...this.chosen()] : [];
    const toast = this.words().toast;
    const ended = this.cancelling
      ? await this.store.cancel(carryOver)
      : await this.store.end(carryOver);
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
