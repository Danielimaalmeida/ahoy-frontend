import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { MeetingSeries } from '@core/api/types';
import {
  cadenceOf,
  parseStakeholders,
  repeatChoiceOf,
  type RepeatChoice,
} from '@domain/meetings';
import type { DialogService } from '@ui/dialog/dialog';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { meetingErrorView } from './meeting-errors';
import type { MeetingsStore } from './meetings-store';
import { browserTimeZone } from './new-meeting-dialog';
import { RepeatPicker } from './repeat-picker';

/** What the Edit series dialog is opened with: the page's store and the series to edit. */
export interface EditSeriesData {
  readonly store: MeetingsStore;
  readonly series: MeetingSeries;
}

/** The longest series name the API takes (`maxLength: 200`). */
const NAME_MAX = 200;

/**
 * "Edit series" for a series with no planned session: its name, who is on the other side and how it repeats. With a
 * planned session, Edit on that session also moves the sessions, so the series page opens that dialog instead.
 */
@Component({
  selector: 'ah-edit-series-dialog',
  imports: [
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
  `,
  template: `
    <ah-dialog
      icon="sail"
      [heading]="'Edit ' + series.name"
      confirmLabel="Save changes"
      busyLabel="Saving…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>Nothing is planned in this series yet.</span>
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Title" required [errorMessages]="messages">
          <input ahInput formControlName="name" autocomplete="off" />
        </ah-field>
        <ah-repeat-picker [(value)]="repeat" />
        @if (repeat() === 'other') {
          <ah-field label="Repeats every" unit="days" required>
            <input ahInput formControlName="cadence" inputmode="numeric" />
          </ah-field>
        }
        <ah-field
          label="Stakeholders"
          optional
          hint="Names or e-mails, separated by commas."
        >
          <input ahInput formControlName="stakeholders" autocomplete="off" />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class EditSeriesDialog {
  private readonly data = inject<EditSeriesData>(DIALOG_DATA);
  private readonly store = this.data.store;
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly series = this.data.series;
  protected readonly busy = this.store.busy;
  protected readonly messages: Readonly<Record<string, string>> = {
    required: 'A title is required.',
    maxlength: `At most ${NAME_MAX} characters.`,
  };

  /** How the series repeats; its cadence to begin with. */
  readonly repeat = signal<RepeatChoice>(
    repeatChoiceOf(this.series.cadenceDays)
  );
  protected readonly form = new FormGroup({
    name: new FormControl(this.series.name, {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(NAME_MAX)],
    }),
    cadence: new FormControl(String(this.series.cadenceDays ?? 10), {
      nonNullable: true,
    }),
    stakeholders: new FormControl(this.series.stakeholders.join(', '), {
      nonNullable: true,
    }),
  });

  private readonly failed = signal<'api' | 'cadence' | null>(null);
  protected readonly error = computed(() => {
    switch (this.failed()) {
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

  /** Saves what changed on the series and closes. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.controls.name.markAsTouched();
    if (this.form.controls.name.invalid) return;
    const value = this.form.getRawValue();
    const days = cadenceOf(this.repeat(), value.cadence);
    if (days === undefined) {
      this.failed.set('cadence');
      return;
    }
    const name = value.name.trim();
    const stakeholders = parseStakeholders(value.stakeholders);
    const change = {
      ...(name !== this.series.name ? { name } : {}),
      ...(stakeholders.join('\n') !== this.series.stakeholders.join('\n')
        ? { stakeholders }
        : {}),
      ...(days !== this.series.cadenceDays ? { cadenceDays: days } : {}),
      ...(this.series.timeZone === null ? { timeZone: browserTimeZone() } : {}),
    };
    if (Object.keys(change).length === 0) {
      this.ref.close(false);
      return;
    }
    if (await this.store.updateSeries(this.series.id, change))
      this.ref.close(true);
    else this.failed.set('api');
  }
}

/** Opens the Edit series dialog for a series with nothing planned. */
export function openEditSeries(
  dialogs: DialogService,
  store: MeetingsStore,
  series: MeetingSeries
): void {
  store.dismissError();
  dialogs.open<boolean, EditSeriesData>(EditSeriesDialog, {
    data: { store, series },
    width: '520px',
  });
}
