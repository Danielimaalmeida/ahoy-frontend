import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CLOCK } from '@core/realtime/clock';
import {
  dateInputValue,
  parseStakeholders,
  startsAtFrom,
} from '@domain/meetings';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';

/** What the New meeting dialog is opened with: the page's store, which holds the series and plans the meeting. */
export interface NewMeetingData {
  readonly store: MeetingsStore;
}

/** The select's value for a series that does not exist yet. */
export const NEW_SERIES = 'new';
/** The select's value for a meeting outside any series. */
export const ONE_OFF = 'one-off';

/** The longest series name or meeting title the API takes (`maxLength: 200`). */
const NAME_MAX = 200;

/**
 * "New meeting": in an existing series (its title and stakeholders come with it), in a new series (name, stakeholders,
 * and how many days apart its meetings are, so Ahoy can plan the next one when topics move on), or a one-off with its
 * own title. Then the day and the start time. Answers the new meeting's id.
 */
@Component({
  selector: 'ah-new-meeting-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      heading="New meeting"
      confirmLabel="Plan meeting"
      busyLabel="Planning…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Plan the meeting now and note topics to raise until it starts.</span
      >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Series"
          hint="A series keeps its meetings together, and open topics move to the next one."
        >
          <select ahInput formControlName="series">
            @for (s of series(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
            <option [value]="newSeries">New series…</option>
            <option [value]="oneOff">One-off meeting</option>
          </select>
        </ah-field>
        @if (kind() === 'new') {
          <ah-field label="Series name" required [errorMessages]="messages">
            <input
              ahInput
              formControlName="name"
              autocomplete="off"
              placeholder="Finance sync"
            />
          </ah-field>
          <ah-field
            label="Repeats every"
            unit="days"
            optional
            hint="Leave empty if it has no fixed rhythm."
          >
            <input ahInput formControlName="cadence" inputmode="numeric" />
          </ah-field>
        }
        @if (kind() === 'one-off') {
          <ah-field label="Title" required [errorMessages]="messages">
            <input
              ahInput
              formControlName="name"
              autocomplete="off"
              placeholder="Pricing review with Sales"
            />
          </ah-field>
        }
        @if (kind() !== 'series') {
          <ah-field
            label="Stakeholders"
            optional
            hint="Names or e-mails, separated by commas."
          >
            <input ahInput formControlName="stakeholders" autocomplete="off" />
          </ah-field>
        }
        <div class="row">
          <ah-field label="Day" required>
            <input ahInput type="date" formControlName="date" />
          </ah-field>
          <ah-field label="Starts at" required>
            <input ahInput type="time" formControlName="time" />
          </ah-field>
        </div>
      </form>
    </ah-dialog>
  `,
})
export class NewMeetingDialog {
  private readonly store = inject<NewMeetingData>(DIALOG_DATA).store;
  private readonly ref = inject<DialogRef<string>>(DialogRef);
  private readonly clock = inject(CLOCK);

  protected readonly newSeries = NEW_SERIES;
  protected readonly oneOff = ONE_OFF;
  protected readonly messages: Readonly<Record<string, string>> = {
    required: 'A name is required.',
    maxlength: `At most ${NAME_MAX} characters.`,
  };
  protected readonly series = this.store.series;
  protected readonly busy = this.store.busy;

  protected readonly form = new FormGroup({
    series: new FormControl(this.store.series()[0]?.id ?? NEW_SERIES, {
      nonNullable: true,
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(NAME_MAX)],
    }),
    cadence: new FormControl('7', { nonNullable: true }),
    stakeholders: new FormControl('', { nonNullable: true }),
    date: new FormControl(dateInputValue(this.clock.now()), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    time: new FormControl('10:00', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  private readonly choice = signal(this.form.controls.series.value);
  /** Which kind of meeting is being planned. */
  readonly kind = computed(() =>
    this.choice() === NEW_SERIES
      ? 'new'
      : this.choice() === ONE_OFF
        ? 'one-off'
        : 'series'
  );
  private readonly failed = signal<'api' | 'when' | 'cadence' | null>(null);
  protected readonly error = computed(() => {
    switch (this.failed()) {
      case 'when':
        return {
          variant: 'error' as const,
          heading: 'Pick a day and a start time',
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
    this.form.controls.series.valueChanges.subscribe((value) =>
      this.choice.set(value)
    );
  }

  /** Plans the meeting (starting the series first when it is new) and closes with its id. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    const kind = this.kind();
    const value = this.form.getRawValue();
    if (kind !== 'series') {
      this.form.controls.name.markAsTouched();
      if (this.form.controls.name.invalid) return;
    }
    const startsAt = startsAtFrom(value.date, value.time);
    if (startsAt === null) {
      this.failed.set('when');
      return;
    }
    const stakeholders = parseStakeholders(value.stakeholders);
    let seriesId: string | null = kind === 'series' ? value.series : null;
    if (kind === 'new') {
      const cadence = value.cadence.trim();
      const days = cadence === '' ? null : Number(cadence);
      if (
        days !== null &&
        (!Number.isSafeInteger(days) || days < 1 || days > 366)
      ) {
        this.failed.set('cadence');
        return;
      }
      const created = await this.store.createSeries({
        name: value.name,
        stakeholders,
        cadenceDays: days,
      });
      if (created === null) {
        this.failed.set('api');
        return;
      }
      seriesId = created.id;
      this.form.controls.series.setValue(created.id);
    }
    const id = await this.store.create({
      seriesId,
      title: kind === 'one-off' ? value.name : '',
      startsAt,
      ...(kind === 'one-off' ? { stakeholders } : {}),
    });
    if (id === null) {
      this.failed.set('api');
      return;
    }
    this.ref.close(id);
  }
}
