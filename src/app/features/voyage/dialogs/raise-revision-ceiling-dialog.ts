import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { Banner } from '@ui/banner/banner';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  type VoyageDialogData,
} from './dialog-support';

/** The most rounds one raise may add (`rounds` of `raiseRevisionCeiling`). */
export const MAX_RAISE = 4;

/**
 * "Raise the revision ceiling?": lets a voyage and its follow-ups use more revision rounds. The ceiling keeps a delivery
 * from looping, and with it the AIU it spends; raising it is a decision with a reason, taken by anyone allowed into
 * Ahoy, and it applies to the whole lineage.
 */
@Component({
  selector: 'ah-raise-revision-ceiling-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="reset"
      kind="sendback"
      heading="Raise the revision ceiling?"
      confirmLabel="Raise the ceiling"
      busyLabel="Raising…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >{{ rounds() }}. Each round is another pass through planning and
        implementation, so raising the ceiling lets the lineage spend more
        AIU.</span
      >
      <ah-banner
        ahDialogCost
        variant="cost"
        heading="Raising the ceiling permits more work and may spend AIU"
        >Each extra round bills {{ actor() }}'s Copilot account or its owner's,
        within the voyage's budget.</ah-banner
      >
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ah-field
          label="Additional rounds"
          required
          [hint]="'From 1 to ' + max + '.'"
          [errorMessages]="roundsMessages"
          [errorText]="serverError('rounds')"
        >
          <input
            ahInput
            type="number"
            min="1"
            [max]="max"
            step="1"
            formControlName="rounds"
          />
        </ah-field>
        <ah-field
          label="Reason"
          required
          [hint]="'Recorded as ' + actor() + '.'"
          [errorMessages]="reasonMessages"
          [errorText]="serverError('reason')"
        >
          <textarea ahInput rows="3" formControlName="reason"></textarea>
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class RaiseRevisionCeilingDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();

  protected readonly max = MAX_RAISE;
  protected readonly actor = inject(CurrentUser).id;
  protected readonly reasonMessages = REASON_MESSAGES;
  protected readonly roundsMessages = {
    required: 'Enter the rounds to add.',
    min: 'Add at least 1 round.',
    max: `Add at most ${MAX_RAISE} rounds.`,
    integer: 'Enter a whole number of rounds.',
  };
  protected readonly form = new FormGroup({
    rounds: new FormControl<number | null>(1, {
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(MAX_RAISE),
        (control) =>
          Number.isSafeInteger(control.value) ? null : { integer: true },
      ],
    }),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(REASON_MAX)],
    }),
  });
  protected readonly rounds = computed(() => {
    const revisions = this.context.lineage()?.revisions;
    return revisions === undefined
      ? 'The lineage has a ceiling on its revision rounds'
      : `The lineage has used ${revisions.used} of its ${revisions.ceiling} revision rounds`;
  });
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;

  protected serverError(field: string): string {
    return this.command.fieldError(field);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const { rounds, reason } = this.form.getRawValue();
    if (this.form.invalid || rounds === null) return;
    const story = this.command.settle(
      await this.context.raiseRevisionCeiling(rounds, reason.trim())
    );
    if (story === null) return;
    this.toasts.show('The revision ceiling was raised.');
    this.ref.close(story);
  }
}
