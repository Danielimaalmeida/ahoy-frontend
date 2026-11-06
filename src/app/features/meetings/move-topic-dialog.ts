import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type {
  MeetingSummary,
  MeetingTopic,
  MoveMeetingTopicResult,
} from '@core/api/types';
import { meetingDay, meetingTime, moveTargets } from '@domain/meetings';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';

/** What the Move to… dialog is opened with: the page's store, which holds the open meeting, and the topic to move. */
export interface MoveTopicData {
  readonly store: MeetingsStore;
  readonly topic: MeetingTopic;
}

/** The radio value of "the series' next meeting, planned from its cadence" (no meeting to name yet). */
export const PLAN_NEXT = 'plan-next';

/** One meeting the topic can go to, as the dialog lists it. */
interface Choice {
  readonly value: string;
  readonly title: string;
  readonly sub: string;
}

/** "Tue 13 Oct 10:00 · in progress · Finance sync". */
function choiceSub(m: MeetingSummary, nextOfSeries: boolean): string {
  const when = `${meetingDay(m.startsAt)} ${meetingTime(m.startsAt)}`;
  const parts = [
    when,
    ...(m.status === 'in_progress' ? ['in progress'] : []),
    nextOfSeries
      ? 'next in this series'
      : m.seriesName !== null
        ? m.seriesName
        : 'one-off',
  ];
  return parts.join(' · ');
}

/**
 * "Move Late fees to…": the meetings that can take the topic, running or planned, of any series or none, the series'
 * next one first (or, when none is planned and the series repeats, the next one Ahoy plans from its cadence). The list
 * narrows as the person types; the topic goes at the end of that meeting's topics, or at the top when asked. It moves
 * with its notes and stays here read-only, linking to where it went. Closes with the moved topic and its copy.
 */
@Component({
  selector: 'ah-move-topic-dialog',
  imports: [DialogShell],
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      max-height: 320px;
      overflow-y: auto;
      border: 1px solid var(--line);
      border-radius: 12px;
      margin: 0;
      padding: 0;
    }
    label.meeting {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 8px 12px;
      border-bottom: 1px solid var(--line-soft);
      cursor: pointer;
    }
    label.meeting:last-of-type {
      border-bottom: 0;
    }
    input[type='radio'] {
      margin-top: 3px;
      accent-color: var(--accent);
    }
    .meeting span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .filter {
      width: 100%;
    }
    .where {
      display: flex;
      gap: 16px;
      border: 0;
      margin: 0;
      padding: 0;
    }
    .where label {
      display: flex;
      gap: 6px;
      align-items: center;
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      [heading]="'Move ' + topic.title + ' to…'"
      confirmLabel="Move topic"
      busyLabel="Moving…"
      [busy]="busy()"
      [confirmDisabled]="target() === null"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >It moves with its notes; here it stays read-only and links to where it
        went.</span
      >
      @if (choices().length === 0) {
        <p class="ah-muted">
          No other meeting is planned or running. Plan one with New meeting,
          then move the topic.
        </p>
      } @else {
        @if (choices().length > 5) {
          <label class="ah-sr" for="move-filter">Find a meeting</label>
          <input
            id="move-filter"
            class="ah-input filter"
            type="search"
            autocomplete="off"
            placeholder="Find a meeting by title or day"
            [value]="filter()"
            (input)="filter.set(filterText($event))"
          />
        }
        <fieldset class="list">
          <legend class="ah-sr">Meeting to move the topic to</legend>
          @for (c of shown(); track c.value) {
            <label class="meeting">
              <input
                type="radio"
                name="move-to"
                [value]="c.value"
                [checked]="chosen() === c.value"
                (change)="chosen.set(c.value)"
              />
              <span>
                <span>{{ c.title }}</span>
                <span class="ah-hint">{{ c.sub }}</span>
              </span>
            </label>
          } @empty {
            <p class="ah-hint">No meeting matches “{{ filter() }}”.</p>
          }
        </fieldset>
        <fieldset class="where">
          <legend class="ah-sr">Where in its topics</legend>
          <label
            ><input
              type="radio"
              name="move-position"
              [checked]="position() === 'last'"
              (change)="position.set('last')"
            />
            At the end</label
          >
          <label
            ><input
              type="radio"
              name="move-position"
              [checked]="position() === 'first'"
              (change)="position.set('first')"
            />
            At the top</label
          >
        </fieldset>
      }
    </ah-dialog>
  `,
})
export class MoveTopicDialog {
  private readonly data = inject<MoveTopicData>(DIALOG_DATA);
  private readonly store = this.data.store;
  private readonly ref = inject<DialogRef<MoveMeetingTopicResult>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly topic = this.data.topic;
  protected readonly busy = this.store.busy;

  /** Every meeting the topic can go to, the series' next one first. */
  protected readonly choices = computed<readonly Choice[]>(() => {
    const from = this.store.meeting();
    if (from === null) return [];
    const targets = moveTargets(from, this.store.meetings());
    const cadence = this.store.openSeries()?.cadenceDays ?? null;
    const planNext =
      cadence !== null &&
      from.seriesId !== null &&
      !targets.some((t) => t.nextOfSeries);
    return [
      ...(planNext
        ? [
            {
              value: PLAN_NEXT,
              title: `The next ${from.title}`,
              sub: `Planned ${cadence === 1 ? 'a day' : `${cadence} days`} on, from the series' rhythm`,
            },
          ]
        : []),
      ...targets.map((t) => ({
        value: t.meeting.id,
        title: t.meeting.title,
        sub: choiceSub(t.meeting, t.nextOfSeries),
      })),
    ];
  });
  /** What the person typed to narrow the list. */
  readonly filter = signal('');
  protected readonly shown = computed(() => {
    const words = this.filter().trim().toLowerCase();
    return words === ''
      ? this.choices()
      : this.choices().filter((c) =>
          `${c.title} ${c.sub}`.toLowerCase().includes(words)
        );
  });
  /** The chosen meeting (or {@link PLAN_NEXT}); the series' next one to begin with. */
  readonly chosen = signal<string | null>(this.choices()[0]?.value ?? null);
  /** The chosen meeting while the list shows it: a meeting the filter hides is never the one moved to. */
  protected readonly target = computed(() => {
    const chosen = this.chosen();
    return this.shown().some((c) => c.value === chosen) ? chosen : null;
  });
  /** Whether the topic goes at the end of the meeting's topics or at the top. */
  readonly position = signal<'first' | 'last'>('last');
  private readonly failed = signal(false);
  protected readonly error = computed(() => {
    const error = this.store.commandError();
    return this.failed() && error !== null ? meetingErrorView(error) : null;
  });

  protected filterText(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  /** Moves the topic; on a refusal the dialog stays open with the reason. */
  async submit(): Promise<void> {
    const chosen = this.target();
    if (chosen === null || this.busy()) return;
    const moved = await this.store.moveTopic(this.topic.id, {
      toMeetingId: chosen === PLAN_NEXT ? null : chosen,
      position: this.position(),
    });
    if (moved === null) {
      this.failed.set(true);
      return;
    }
    const to = this.store
      .meetings()
      .find((m) => m.id === moved.movedTo.meetingId);
    this.toasts.show(
      to === undefined
        ? `${this.topic.title} moved.`
        : `${this.topic.title} moved to ${to.title}, ${meetingDay(to.startsAt)}.`
    );
    this.ref.close(moved);
  }
}
