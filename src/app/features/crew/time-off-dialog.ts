import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import type { CrewMember } from '@core/api/types';
import { spanLabel, timeOffRefusal } from '@domain/crew';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { crewErrorView } from './crew-errors';
import type { CrewStore } from './crew-store';

/** What the time off dialog is opened with: the page's store and the member, or null to pick one. */
export interface TimeOffData {
  readonly store: CrewStore;
  readonly member: CrewMember | null;
}

/**
 * Records days a member is away, both included. Nobody is moved: the page flags the person on their sprint and a person
 * changes it. Closes with true once saved.
 */
@Component({
  selector: 'ah-crew-time-off-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    .days {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      heading="Add time off"
      confirmLabel="Add time off"
      busyLabel="Saving…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Whoever is away on their sprint is flagged on the page, with who could
        step in.</span
      >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Who">
          <select ahInput formControlName="memberId">
            @for (m of members; track m.id) {
              <option [value]="m.id">{{ m.name }}</option>
            }
          </select>
        </ah-field>
        <div class="days">
          <ah-field label="First day" required>
            <input ahInput type="date" formControlName="startsOn" />
          </ah-field>
          <ah-field label="Last day" required [errorText]="refusal() ?? ''">
            <input ahInput type="date" formControlName="endsOn" />
          </ah-field>
        </div>
        <ah-field label="Note" optional hint="Such as “Holiday”.">
          <input
            ahInput
            formControlName="note"
            autocomplete="off"
            maxlength="200"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class TimeOffDialog {
  private readonly data = inject<TimeOffData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly members = this.data.store.members();
  protected readonly form = new FormGroup({
    memberId: new FormControl(
      this.data.member?.id ?? this.members[0]?.id ?? '',
      { nonNullable: true, validators: [Validators.required] }
    ),
    startsOn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    endsOn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    note: new FormControl('', { nonNullable: true }),
  });
  /** Why the days cannot be saved, shown once the person tried. */
  protected readonly refusal = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : crewErrorView(failure);
  });

  /** Saves the time off and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const { memberId, startsOn, endsOn, note } = this.form.getRawValue();
    const refusal = timeOffRefusal(startsOn, endsOn);
    this.refusal.set(refusal);
    if (this.form.invalid || refusal !== null || this.busy()) return;
    this.busy.set(true);
    const trimmed = note.trim();
    const result = await this.data.store.addTimeOff(memberId, {
      startsOn,
      endsOn,
      ...(trimmed !== '' ? { note: trimmed } : {}),
    });
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    const name = this.members.find((m) => m.id === memberId)?.name ?? '';
    this.toasts.show(`${name} is away ${spanLabel(startsOn, endsOn)}.`);
    this.ref.close(true);
  }
}
