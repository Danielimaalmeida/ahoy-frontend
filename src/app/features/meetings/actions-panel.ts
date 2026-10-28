import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { MeetingNoteInContext } from '@core/api/types';
import { decisionsAndActions, dueLabel, meetingDay } from '@domain/meetings';
import { Button } from '@ui/button/button';
import { MeetingsStore } from './meetings-store';
import { NOTE_MAX } from './topic-card';

/**
 * What the open meeting decided and what is still to do (asked for on 2026-10-24): the open actions of its series, from
 * this meeting and the earlier ones, each ticked done here, its open questions, each answered here (asked for on
 * 2026-10-28), and the decisions taken in this meeting. Shown above the topics once there is one of them. 0 AIU.
 */
@Component({
  selector: 'ah-actions-panel',
  imports: [Button, ReactiveFormsModule, RouterLink],
  styles: `
    :host {
      display: block;
    }
    section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px 20px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }
    h2 {
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    li {
      display: flex;
      gap: 8px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .text {
      flex: 1 1 160px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .overdue {
      color: var(--danger-text);
    }
    input[type='checkbox'] {
      margin: 0;
      accent-color: var(--accent);
    }
    form {
      flex: 1 0 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    form input {
      flex: 1 1 200px;
      height: 32px;
    }
  `,
  template: `
    @if (shown()) {
      <section aria-label="Decisions and actions">
        <div>
          <h2>
            Open actions
            <span class="ah-tabs__count">{{ actions().length }}</span>
          </h2>
          @if (store.actionsError() !== null) {
            <span class="ah-hint" role="status"
              >The open actions and questions couldn't be read. Refresh to try
              again.</span
            >
          } @else if (actions().length === 0) {
            <span class="ah-hint">Nothing left to do.</span>
          } @else {
            <ul aria-label="Open actions">
              @for (a of actions(); track a.note.id) {
                <li>
                  <input
                    type="checkbox"
                    [disabled]="store.busy()"
                    [attr.aria-label]="'Mark done: ' + a.note.text"
                    (change)="done(a, $event)"
                  />
                  <span class="text">{{ a.note.text }}</span>
                  @if (a.note.owner !== null) {
                    <span class="ah-hint">{{ a.note.owner }}</span>
                  }
                  @if (due(a); as d) {
                    <span class="ah-hint" [class.overdue]="d.overdue">{{
                      d.text
                    }}</span>
                  }
                  @if (a.meetingId !== meetingId()) {
                    <a class="ah-hint" [routerLink]="['/meetings', a.meetingId]"
                      >{{ a.topicTitle }}, {{ day(a.meetingStartsAt) }}</a
                    >
                  }
                </li>
              }
            </ul>
          }
        </div>
        @if (questions().length > 0) {
          <div>
            <h2>
              Open questions
              <span class="ah-tabs__count">{{ questions().length }}</span>
            </h2>
            <ul aria-label="Open questions">
              @for (q of questions(); track q.note.id) {
                <li>
                  <span class="text">{{ q.note.text }}</span>
                  @if (q.meetingId !== meetingId()) {
                    <a class="ah-hint" [routerLink]="['/meetings', q.meetingId]"
                      >{{ q.topicTitle }}, {{ day(q.meetingStartsAt) }}</a
                    >
                  } @else {
                    <span class="ah-hint">{{ q.topicTitle }}</span>
                  }
                  @if (answering() === q.note.id) {
                    <form (submit)="$event.preventDefault(); answer(q)">
                      <label class="ah-sr" [for]="'open-answer-' + q.note.id"
                        >Answer to: {{ q.note.text }}</label
                      >
                      <input
                        class="ah-input"
                        type="text"
                        autocomplete="off"
                        placeholder="Write the answer"
                        [id]="'open-answer-' + q.note.id"
                        [maxlength]="noteMax"
                        [formControl]="text"
                        (keydown.escape)="answering.set(null)"
                      />
                      <button
                        ahButton="primary"
                        size="sm"
                        type="submit"
                        [disabled]="store.busy()"
                      >
                        Add answer
                      </button>
                      <button
                        ahButton="default"
                        size="sm"
                        type="button"
                        (click)="answering.set(null)"
                      >
                        Cancel
                      </button>
                    </form>
                  } @else {
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-label]="'Answer: ' + q.note.text"
                      [disabled]="store.busy()"
                      (click)="startAnswer(q)"
                    >
                      Answer
                    </button>
                  }
                </li>
              }
            </ul>
          </div>
        }
        @if (decisions().length > 0) {
          <div>
            <h2>
              Decided in this meeting
              <span class="ah-tabs__count">{{ decisions().length }}</span>
            </h2>
            <ul aria-label="Decisions">
              @for (d of decisions(); track d.id) {
                <li>
                  <span class="text">{{ d.text }}</span>
                </li>
              }
            </ul>
          </div>
        }
      </section>
    }
  `,
})
export class ActionsPanel {
  protected readonly store = inject(MeetingsStore);

  protected readonly actions = this.store.openActions;
  protected readonly questions = this.store.openQuestions;
  /** The open question whose answer line is open, if any. */
  readonly answering = signal<string | null>(null);
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly noteMax = NOTE_MAX;
  protected readonly meetingId = computed(() => this.store.meeting()?.id);
  protected readonly decisions = computed(() => {
    const meeting = this.store.meeting();
    return meeting === null ? [] : decisionsAndActions(meeting).decisions;
  });
  /** Shown once the series has an open action or question, this meeting a decision, or the lists could not be read. */
  protected readonly shown = computed(
    () =>
      this.actions().length > 0 ||
      this.questions().length > 0 ||
      this.decisions().length > 0 ||
      this.store.actionsError() !== null
  );
  protected readonly day = meetingDay;

  protected due(action: MeetingNoteInContext) {
    return dueLabel(action.note.dueOn, this.store.today());
  }

  /** Opens the answer line under an open question, closing any other. */
  startAnswer(question: MeetingNoteInContext): void {
    this.text.setValue('');
    this.answering.set(question.note.id);
  }

  /** Answers an open question; it leaves the list once the API agrees, and the line stays open when it does not. */
  async answer(question: MeetingNoteInContext): Promise<void> {
    const text = this.text.value.trim();
    if (text === '' || this.store.busy()) return;
    if (await this.store.answer(question.note.id, text))
      this.answering.set(null);
  }

  /** Ticks an action done; it leaves the list once the API agrees, and the box clears when it does not. */
  protected async done(
    action: MeetingNoteInContext,
    event: Event
  ): Promise<void> {
    const box = event.target as HTMLInputElement;
    if (!(await this.store.setDone(action.note.id, true))) box.checked = false;
  }
}
