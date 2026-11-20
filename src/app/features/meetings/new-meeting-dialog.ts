import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { Router } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { JIRA_ISSUE_TYPES, type JiraIssueType } from '@core/api/types';
import { CLOCK } from '@core/realtime/clock';
import {
  cadenceOf,
  dateInputValue,
  endsAtFrom,
  meetingDay,
  parseStakeholders,
  REPEAT_CHOICES,
  REPEAT_LABELS,
  rhythmLabel,
  sessionStarts,
  startsAtFrom,
  timeZoneOf,
  type RepeatChoice,
} from '@domain/meetings';
import {
  isProjectKey,
  normaliseProjectKey,
  PROJECT_KEY_MAX,
} from '@domain/story-drafts';
import { Button } from '@ui/button/button';
import { DialogShell, type DialogService } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';

/**
 * What the New meeting dialog is opened with: the page's store, which holds the series and plans the meeting, and
 * optionally a series' id (to add a session to it) or {@link NEW_SERIES} (a new meeting that repeats every week).
 */
export interface NewMeetingData {
  readonly store: MeetingsStore;
  readonly series?: string;
}

/** Opens the dialog for a new meeting that repeats every week. */
export const NEW_SERIES = 'new';

/** The longest series name or meeting title the API takes (`maxLength: 200`). */
const NAME_MAX = 200;

/** How many dates the summary of a repeating meeting lists. */
const PREVIEW_SESSIONS = 3;

/** The browser's time zone, which a new series' rhythm is counted in. */
export function browserTimeZone(): string | null {
  return timeZoneOf(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * "New meeting": its title, day, start and end, and whether it repeats (every week, every two weeks or every N days),
 * with the dates that follows; then its stakeholders and the Jira project its stories go to. A meeting that repeats is
 * a series, whose next session Ahoy keeps planned. Opened with a series, it adds a session to it (day and time only).
 * Answers the new meeting's id.
 */
@Component({
  selector: 'ah-new-meeting-dialog',
  imports: [Button, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .when {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    @media (max-width: 480px) {
      .when,
      .row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    legend {
      font-weight: 600;
      font-size: 12.5px;
      padding: 0;
      margin-bottom: var(--space-1);
    }
    .repeats {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    .repeats button[aria-pressed='true'] {
      background: var(--accent-soft);
    }
    .summary {
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--accent-soft);
      padding: var(--space-2) var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .summary b {
      color: var(--accent-text);
    }
    .dates {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      list-style: none;
      margin: 0;
      padding: 0;
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      [heading]="heading()"
      [confirmLabel]="adding() ? 'Add session' : 'Plan meeting'"
      busyLabel="Planning…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>{{ lead() }}</span>
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        @if (!adding()) {
          <ah-field label="Title" required [errorMessages]="messages">
            <input
              ahInput
              formControlName="name"
              autocomplete="off"
              placeholder="Finance sync"
            />
          </ah-field>
        }
        <div class="when">
          <ah-field label="Day" required>
            <input ahInput type="date" formControlName="date" />
          </ah-field>
          <ah-field label="Starts" required>
            <input ahInput type="time" formControlName="time" />
          </ah-field>
          <ah-field label="Ends" optional>
            <input ahInput type="time" formControlName="endTime" />
          </ah-field>
        </div>
        @if (!adding()) {
          <fieldset>
            <legend>Repeats</legend>
            <div class="repeats" role="group" aria-label="Repeats">
              @for (choice of repeatChoices; track choice) {
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  [attr.aria-pressed]="repeat() === choice"
                  (click)="repeat.set(choice)"
                >
                  {{ repeatLabels[choice] }}
                </button>
              }
            </div>
          </fieldset>
          @if (repeat() === 'other') {
            <ah-field label="Repeats every" unit="days" required>
              <input ahInput formControlName="cadence" inputmode="numeric" />
            </ah-field>
          }
          @if (preview(); as p) {
            <div class="summary" aria-live="polite">
              <b>↻ {{ p.rhythm }}</b>
              <ul class="dates" aria-label="Next sessions">
                @for (d of p.dates; track d) {
                  <li class="ah-tag ah-tag--accent">{{ d }}</li>
                }
              </ul>
              <span class="ah-hint"
                >And so on. Ahoy keeps the next session planned, so it shows in
                Upcoming.</span
              >
            </div>
          }
          <ah-field
            label="Stakeholders"
            optional
            hint="Names or e-mails, separated by commas."
          >
            <input ahInput formControlName="stakeholders" autocomplete="off" />
          </ah-field>
          <div class="row">
            <ah-field
              label="Jira project"
              optional
              hint="Where its stories go, such as FIN. You can set it later."
              [errorMessages]="keyMessages"
            >
              <input
                ahInput
                formControlName="jiraKey"
                autocomplete="off"
                [maxlength]="keyMax"
              />
            </ah-field>
            <ah-field label="Issue type">
              <select ahInput formControlName="jiraType">
                @for (type of issueTypes; track type) {
                  <option [value]="type">{{ type }}</option>
                }
              </select>
            </ah-field>
          </div>
        }
      </form>
    </ah-dialog>
  `,
})
export class NewMeetingDialog {
  private readonly data = inject<NewMeetingData>(DIALOG_DATA);
  private readonly store = this.data.store;
  private readonly ref = inject<DialogRef<string>>(DialogRef);
  private readonly clock = inject(CLOCK);

  protected readonly repeatChoices = REPEAT_CHOICES;
  protected readonly repeatLabels = REPEAT_LABELS;
  protected readonly messages: Readonly<Record<string, string>> = {
    required: 'A title is required.',
    maxlength: `At most ${NAME_MAX} characters.`,
  };
  protected readonly busy = this.store.busy;
  protected readonly issueTypes = JIRA_ISSUE_TYPES;
  protected readonly keyMax = PROJECT_KEY_MAX;
  protected readonly keyMessages: Readonly<Record<string, string>> = {
    projectKey:
      'A project key: a capital letter, then capitals, digits or _ (such as FIN).',
  };
  /** The series a session is added to, when the dialog was opened with one. */
  protected readonly series = computed(() => {
    const id = this.data.series;
    if (id === undefined || id === NEW_SERIES) return null;
    return this.store.series().find((s) => s.id === id) ?? null;
  });
  /** Whether a session is added to an existing series. */
  protected readonly adding = computed(() => this.series() !== null);
  protected readonly heading = computed(() => {
    const series = this.series();
    return series === null ? 'New meeting' : `Add a session to ${series.name}`;
  });
  protected readonly lead = computed(() =>
    this.adding()
      ? 'An extra session, outside the rhythm. It takes the series’ title and stakeholders.'
      : 'Plan it now and note topics to raise until it starts.'
  );
  /** The Jira target of the latest one-off meeting that has one, to begin with. */
  private readonly lastTarget = [...this.store.meetings()]
    .filter((m) => m.seriesId === null && m.jiraProjectKey !== null)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];

  /** How the meeting repeats; every week when the dialog was opened for a new series. */
  readonly repeat = signal<RepeatChoice>(
    this.data.series === NEW_SERIES ? 'week' : 'none'
  );

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(NAME_MAX)],
    }),
    cadence: new FormControl('10', { nonNullable: true }),
    stakeholders: new FormControl('', { nonNullable: true }),
    date: new FormControl(dateInputValue(this.clock.now()), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    time: new FormControl('10:00', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    endTime: new FormControl('11:00', { nonNullable: true }),
    jiraKey: new FormControl(this.lastTarget?.jiraProjectKey ?? '', {
      nonNullable: true,
      validators: [
        (control) => {
          const key = normaliseProjectKey(String(control.value));
          return key === '' || isProjectKey(key) ? null : { projectKey: true };
        },
      ],
    }),
    jiraType: new FormControl<JiraIssueType>(
      this.lastTarget?.jiraIssueType ?? 'Story',
      { nonNullable: true }
    ),
  });

  /** The form's day, times and cadence as signals, for the summary. */
  private readonly when = signal(this.form.getRawValue());

  /** The rhythm in words and the first sessions' days, when the meeting repeats and its day and time can be read. */
  protected readonly preview = computed(() => {
    const value = this.when();
    const days = cadenceOf(this.repeat(), value.cadence);
    if (days === null || days === undefined) return null;
    const startsAt = startsAtFrom(value.date, value.time);
    if (startsAt === null) return null;
    const endsAt = endsAtFrom(value.date, value.time, value.endTime) ?? null;
    return {
      rhythm: `${rhythmLabel(days, startsAt, endsAt)}, from ${meetingDay(startsAt)}`,
      dates: sessionStarts(startsAt, days, PREVIEW_SESSIONS).map(meetingDay),
    };
  });

  private readonly failed = signal<'api' | 'when' | 'ends' | 'cadence' | null>(
    null
  );
  protected readonly error = computed(() => {
    switch (this.failed()) {
      case 'when':
        return {
          variant: 'error' as const,
          heading: 'Pick a day and a start time',
        };
      case 'ends':
        return {
          variant: 'error' as const,
          heading: 'The end time must be after the start time',
        };
      case 'cadence':
        return {
          variant: 'error' as const,
          heading: 'Repeats every: a whole number of days, from 1 to 366',
        };
      case 'api': {
        const error = this.store.commandError();
        return error === null ? null : meetingErrorView(error);
      }
      case null:
        return null;
    }
  });

  constructor() {
    this.form.valueChanges.subscribe(() =>
      this.when.set(this.form.getRawValue())
    );
  }

  /** Plans the meeting (starting its series first when it repeats) and closes with its id. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    const value = this.form.getRawValue();
    const series = this.series();
    if (series === null) {
      this.form.controls.name.markAsTouched();
      this.form.controls.jiraKey.markAsTouched();
      if (this.form.controls.name.invalid || this.form.controls.jiraKey.invalid)
        return;
    }
    const startsAt = startsAtFrom(value.date, value.time);
    if (startsAt === null) {
      this.failed.set('when');
      return;
    }
    const endsAt = endsAtFrom(value.date, value.time, value.endTime);
    if (endsAt === undefined) {
      this.failed.set('ends');
      return;
    }
    const when = {
      startsAt,
      ...(endsAt !== null ? { endsAt } : {}),
    };
    if (series !== null) {
      await this.finish(
        this.store.create({ seriesId: series.id, title: '', ...when })
      );
      return;
    }
    const days = cadenceOf(this.repeat(), value.cadence);
    if (days === undefined) {
      this.failed.set('cadence');
      return;
    }
    const stakeholders = parseStakeholders(value.stakeholders);
    const key = normaliseProjectKey(value.jiraKey);
    const jira =
      key === '' ? undefined : { projectKey: key, issueType: value.jiraType };
    if (days === null) {
      await this.finish(
        this.store.create({
          seriesId: null,
          title: value.name,
          ...when,
          stakeholders,
          ...(jira !== undefined ? { jira } : {}),
        })
      );
      return;
    }
    const created = await this.store.createSeries({
      name: value.name,
      stakeholders,
      cadenceDays: days,
      timeZone: browserTimeZone(),
      ...(jira !== undefined ? { jira } : {}),
    });
    if (created === null) {
      this.failed.set('api');
      return;
    }
    await this.finish(
      this.store.create({ seriesId: created.id, title: '', ...when })
    );
  }

  /** Closes with the planned meeting's id, or shows why it was refused. */
  private async finish(planned: Promise<string | null>): Promise<void> {
    const id = await planned;
    if (id === null) {
      this.failed.set('api');
      return;
    }
    this.ref.close(id);
  }
}

/**
 * Opens the New meeting dialog over the page (with a series' id, to add a session to it; with {@link NEW_SERIES}, for a
 * meeting that repeats every week), and opens the meeting it plans.
 */
export function openNewMeeting(
  dialogs: DialogService,
  router: Router,
  store: MeetingsStore,
  series?: string
): void {
  store.dismissError();
  const ref = dialogs.open<string, NewMeetingData>(NewMeetingDialog, {
    data: series === undefined ? { store } : { store, series },
    width: '560px',
  });
  ref.closed.subscribe((id) => {
    if (id !== undefined) void router.navigate(['/meetings', id]);
  });
}
