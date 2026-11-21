import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { MeetingSeries } from '@core/api/types';
import {
  cadenceOf,
  dateInputValue,
  endsAtFrom,
  meetingDay,
  meetingTime,
  parseStakeholders,
  repeatChoiceOf,
  rhythmLabel,
  startsAtFrom,
  timeInputValue,
  type RepeatChoice,
} from '@domain/meetings';
import { Button } from '@ui/button/button';
import {
  ChoiceCardGroup,
  type ChoiceOption,
} from '@ui/choice-card/choice-card';
import type { DialogService } from '@ui/dialog/dialog';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';
import { browserTimeZone } from './new-meeting-dialog';
import { RepeatPicker } from './repeat-picker';

/** The session being edited: what the dialog starts from. */
export interface EditableSession {
  readonly id: string;
  readonly seriesId: string | null;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly stakeholders: readonly string[];
  readonly status: string;
}

/** What the Edit dialog is opened with: the page's store and the session to edit. */
export interface EditMeetingData {
  readonly store: MeetingsStore;
  readonly meeting: EditableSession;
}

/** Whether a change goes to this session only, or to the series from this session on. */
export type EditScope = 'this' | 'following';

/** The longest series name or meeting title the API takes (`maxLength: 200`). */
const NAME_MAX = 200;

/**
 * "Edit": a meeting's title, day, start and end, and stakeholders; for a session of a series, also how it repeats, and
 * whether the change goes to this session only or to this and the following sessions (the series). Past sessions
 * never change. A series that repeats can stop repeating from here, after a confirmation.
 */
@Component({
  selector: 'ah-edit-meeting-dialog',
  imports: [
    Button,
    ChoiceCardGroup,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
    RepeatPicker,
  ],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .when {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    @media (max-width: 480px) {
      .when {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .stop {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      border-top: 1px solid var(--line);
      padding-top: var(--space-3);
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      [heading]="'Edit ' + session.title"
      confirmLabel="Save changes"
      busyLabel="Saving…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>{{ lead() }}</span>
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Title" required [errorMessages]="messages">
          <input ahInput formControlName="title" autocomplete="off" />
        </ah-field>
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
        @if (canChangeSeries()) {
          <ah-repeat-picker
            [(value)]="repeat"
            [showNone]="series()?.cadenceDays === null"
          />
          @if (repeat() === 'other') {
            <ah-field label="Repeats every" unit="days" required>
              <input ahInput formControlName="cadence" inputmode="numeric" />
            </ah-field>
          }
        }
        @if (series() === null) {
          <ah-repeat-picker [(value)]="repeat" />
          @if (repeat() === 'other') {
            <ah-field label="Repeats every" unit="days" required>
              <input ahInput formControlName="cadence" inputmode="numeric" />
            </ah-field>
          }
          @if (repeat() !== 'none') {
            <span class="ah-hint"
              >It becomes the first session of a series. The next one is planned
              when this one ends.</span
            >
          }
        }
        <ah-field
          label="Stakeholders"
          optional
          hint="Names or e-mails, separated by commas."
        >
          <input ahInput formControlName="stakeholders" autocomplete="off" />
        </ah-field>
        @if (canChangeSeries()) {
          <ah-choice-card-group
            label="Apply the changes to"
            [options]="scopes()"
            [formControl]="scope"
          />
          @if (series()?.cadenceDays !== null) {
            <div class="stop">
              <span role="status">
                @if (stopping()) {
                  No new session is planned after the ones already planned. Past
                  and planned sessions stay.
                }
              </span>
              @if (!stopping()) {
                <button
                  #stopButton
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  [disabled]="busy()"
                  (click)="ask(true)"
                >
                  Stop repeating…
                </button>
              } @else {
                <button
                  #confirmButton
                  ahButton="danger"
                  size="sm"
                  type="button"
                  [disabled]="busy()"
                  (click)="stopRepeating()"
                >
                  Stop repeating
                </button>
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  (click)="ask(false)"
                >
                  Keep it
                </button>
              }
            </div>
          }
        }
      </form>
    </ah-dialog>
  `,
})
export class EditMeetingDialog {
  private readonly data = inject<EditMeetingData>(DIALOG_DATA);
  private readonly store = this.data.store;
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly session = this.data.meeting;

  protected readonly busy = this.store.busy;
  protected readonly messages: Readonly<Record<string, string>> = {
    required: 'A title is required.',
    maxlength: `At most ${NAME_MAX} characters.`,
  };

  /** The session's series, when it has one. */
  protected readonly series = computed<MeetingSeries | null>(() => {
    const id = this.session.seriesId;
    return id === null
      ? null
      : (this.store.series().find((s) => s.id === id) ?? null);
  });
  /** Whether the change can go to the series: a planned session of a series. */
  protected readonly canChangeSeries = computed(
    () => this.series() !== null && this.session.status === 'planned'
  );
  protected readonly lead = computed(() => {
    const series = this.series();
    const when = `${meetingDay(this.session.startsAt)}, ${meetingTime(this.session.startsAt)}`;
    return series === null
      ? when
      : `Session of ${when} · ↻ ${rhythmLabel(series.cadenceDays, series.startsAt, series.endsAt)}`;
  });

  private readonly start = new Date(this.session.startsAt);
  protected readonly form = new FormGroup({
    title: new FormControl(this.session.title, {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(NAME_MAX)],
    }),
    date: new FormControl(dateInputValue(this.start), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    time: new FormControl(timeInputValue(this.start), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    endTime: new FormControl(
      this.session.endsAt === null
        ? ''
        : timeInputValue(new Date(this.session.endsAt)),
      { nonNullable: true }
    ),
    cadence: new FormControl(String(this.series()?.cadenceDays ?? 10), {
      nonNullable: true,
    }),
    stakeholders: new FormControl(this.session.stakeholders.join(', '), {
      nonNullable: true,
    }),
  });

  /** How the series repeats; its cadence to begin with. */
  readonly repeat = signal<RepeatChoice>(
    repeatChoiceOf(this.series()?.cadenceDays ?? null)
  );
  /** Whether the person changed how the series repeats, which only the series can take. */
  private readonly repeatChanged = computed(() => {
    const series = this.series();
    if (series === null) return false;
    return this.repeat() !== repeatChoiceOf(series.cadenceDays);
  });
  protected readonly scope = new FormControl<EditScope>('following', {
    nonNullable: true,
  });
  protected readonly scopes = computed<readonly ChoiceOption<EditScope>[]>(
    () => [
      {
        value: 'this',
        title: 'Only this session',
        description: this.repeatChanged()
          ? 'How it repeats belongs to the series, so it cannot change for one session.'
          : `${meetingDay(this.session.startsAt)} changes; the series and its other sessions stay as they are.`,
        disabled: this.repeatChanged(),
      },
      {
        value: 'following',
        title: 'This and the following sessions',
        description:
          'The series changes from this session on, and its rhythm counts from it. Past sessions keep what they had.',
      },
    ]
  );
  private readonly injector = inject(Injector);
  private readonly stopButton =
    viewChild<ElementRef<HTMLButtonElement>>('stopButton');
  private readonly confirmButton =
    viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  /** Whether the person asked to stop the series repeating and is confirming it. */
  protected readonly stopping = signal(false);

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

  /** Picks how the series repeats; a change of rhythm goes to the series, so the scope moves there. */
  protected chooseRepeat(choice: RepeatChoice): void {
    this.repeat.set(choice);
    if (this.repeatChanged()) this.scope.setValue('following');
  }

  /** Saves the change to this session, or to the series from it on, and closes. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.controls.title.markAsTouched();
    if (this.form.controls.title.invalid) return;
    const value = this.form.getRawValue();
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
    const title = value.title.trim();
    const stakeholders = parseStakeholders(value.stakeholders);
    const moved =
      startsAt !== new Date(this.session.startsAt).toISOString() ||
      endsAt !==
        (this.session.endsAt === null
          ? null
          : new Date(this.session.endsAt).toISOString());
    const renamed = title !== this.session.title;
    const regrouped =
      stakeholders.join('\n') !== this.session.stakeholders.join('\n');
    const series = this.series();
    if (
      series !== null &&
      this.canChangeSeries() &&
      this.scope.value === 'following'
    ) {
      const days = cadenceOf(this.repeat(), value.cadence);
      if (days === undefined) {
        this.failed.set('cadence');
        return;
      }
      const ok = await this.store.updateSeries(series.id, {
        fromMeetingId: this.session.id,
        ...(renamed && title !== series.name ? { name: title } : {}),
        ...(regrouped ? { stakeholders } : {}),
        ...(days !== series.cadenceDays ? { cadenceDays: days } : {}),
        ...(series.timeZone === null ? { timeZone: browserTimeZone() } : {}),
        ...(moved ? { startsAt, endsAt } : {}),
      });
      this.done(ok);
      return;
    }
    // A one-off meeting that now repeats becomes the first session of a series, after its own changes are saved.
    const days =
      series === null ? cadenceOf(this.repeat(), value.cadence) : null;
    if (days === undefined) {
      this.failed.set('cadence');
      return;
    }
    if (!moved && !renamed && !regrouped && days === null) {
      this.ref.close(false);
      return;
    }
    if (moved || renamed || regrouped) {
      const saved = await this.store.updateSession(this.session.id, {
        ...(renamed ? { title } : {}),
        ...(moved ? { startsAt, endsAt } : {}),
        ...(regrouped ? { stakeholders } : {}),
      });
      if (!saved || days === null) {
        this.done(saved);
        return;
      }
    }
    this.done(
      days === null
        ? true
        : await this.store.repeatMeeting(
            this.session.id,
            days,
            browserTimeZone()
          )
    );
  }

  /** Asks for, or withdraws, the confirmation to stop repeating; the focus goes to the button that takes its place. */
  protected ask(stopping: boolean): void {
    this.stopping.set(stopping);
    afterNextRender(
      () =>
        (stopping
          ? this.confirmButton()
          : this.stopButton()
        )?.nativeElement.focus(),
      { injector: this.injector }
    );
  }

  /** Stops the series repeating: no new session is planned after the ones already planned. */
  protected async stopRepeating(): Promise<void> {
    const series = this.series();
    if (series === null || this.busy()) return;
    this.done(await this.store.updateSeries(series.id, { cadenceDays: null }));
  }

  private done(ok: boolean): void {
    if (ok) this.ref.close(true);
    else this.failed.set('api');
  }
}

/** Opens the Edit dialog for a session (or a one-off meeting). */
export function openEditMeeting(
  dialogs: DialogService,
  store: MeetingsStore,
  meeting: EditableSession
): void {
  store.dismissError();
  dialogs.open<boolean, EditMeetingData>(EditMeetingDialog, {
    data: { store, meeting },
    width: '580px',
  });
}
