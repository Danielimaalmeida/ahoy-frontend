import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MeetingNoteInContext } from '@core/api/types';
import { decisionsAndActions, dueLabel, meetingDay } from '@domain/meetings';
import { MeetingsStore } from './meetings-store';

/**
 * What the open meeting decided and what is still to do (asked for on 2026-10-24): the open actions of its series, from
 * this meeting and the earlier ones, each ticked done here, and the decisions taken in this meeting. Shown above the
 * topics once there is one or the other. 0 AIU.
 */
@Component({
  selector: 'ah-actions-panel',
  imports: [RouterLink],
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
    input {
      margin: 0;
      accent-color: var(--accent);
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
              >The open actions couldn't be read. Refresh to try again.</span
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
  protected readonly meetingId = computed(() => this.store.meeting()?.id);
  protected readonly decisions = computed(() => {
    const meeting = this.store.meeting();
    return meeting === null ? [] : decisionsAndActions(meeting).decisions;
  });
  /** Shown once the series has an open action, this meeting a decision, or the actions could not be read. */
  protected readonly shown = computed(
    () =>
      this.actions().length > 0 ||
      this.decisions().length > 0 ||
      this.store.actionsError() !== null
  );
  protected readonly day = meetingDay;

  protected due(action: MeetingNoteInContext) {
    return dueLabel(action.note.dueOn, this.store.today());
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
