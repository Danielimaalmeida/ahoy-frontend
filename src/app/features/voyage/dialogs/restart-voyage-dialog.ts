import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { formatAiu, parseAiu } from '@domain/aiu';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import { exactAiu } from './budget-dialog';
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  type VoyageDialogData,
} from './dialog-support';

/** Why a "Total cap" text for a restart is refused. */
export type RestartCapError = 'required' | 'amount' | 'notAboveSpent';

/**
 * Reads the "Total cap" text of a restart: an amount in AIU (read without floats by `parseAiu`) that must be more than
 * what the voyage has already spent, so the fresh attempt has room to run. Gives the cap in nano-AIU, or why it is
 * refused.
 */
export function checkRestartCap(
  text: string,
  spentNanoAiu: number
): { readonly cap: number } | { readonly error: RestartCapError } {
  if (text.trim() === '') return { error: 'required' };
  const cap = parseAiu(text);
  if (cap === null) return { error: 'amount' };
  return cap > spentNanoAiu && cap >= 1 ? { cap } : { error: 'notAboveSpent' };
}

/** The cap the dialog offers: the current one when it leaves room above what is spent, else nothing to keep. */
export function suggestedRestartCap(
  budgetNanoAiu: number,
  spentNanoAiu: number
): string {
  return budgetNanoAiu > spentNanoAiu ? exactAiu(budgetNanoAiu) : '';
}

/** {@link checkRestartCap} as a validator: its error is the key (`required`, `amount`, `notAboveSpent`). */
function restartCapValidator(
  spentNanoAiu: () => number
): (control: AbstractControl<string>) => ValidationErrors | null {
  return (control) => {
    const checked = checkRestartCap(control.value, spentNanoAiu());
    return 'error' in checked ? { [checked.error]: true } : null;
  };
}

/**
 * "Start PROJ-140 again?": sets sail again on a cancelled voyage (`restartStory`), from intake, as a fresh attempt. It
 * says that nothing of the earlier attempt is carried over (questions, plan, gates, reviews, artifacts), that its
 * history stays, that what it spent stays spent, and that the person starting it is billed. The total cap is prefilled
 * with the current one when it leaves room, and the reason is required. On a conflict the dialog stays open with the
 * banner and the fields as typed.
 */
@Component({
  selector: 'ah-restart-voyage-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="info"
      [heading]="'Start ' + key() + ' again?'"
      cancelLabel="Keep it cancelled"
      confirmLabel="Start again"
      busyLabel="Starting…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >The voyage sets sail again from <b>intake</b>, as a fresh attempt: the
        questions, plan, gate decisions, reviews and files of the cancelled
        attempt are not carried over, and the crew reads Jira again. Its history
        stays in Activity and Runs. The {{ spent() }} AIU already spent stay
        spent, and from now on it is billed to {{ actor() }}. Pull requests the
        earlier attempt opened are left as they are.
      </span>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ah-field
          label="Total cap"
          required
          unit="AIU"
          [hint]="capHint()"
          [errorMessages]="capMessages()"
          [errorText]="capServerError()"
        >
          <input
            ahInput
            formControlName="cap"
            inputmode="decimal"
            autocomplete="off"
          />
        </ah-field>
        <ah-field
          label="Reason"
          required
          [hint]="'Starts the new decision log. Recorded as ' + actor() + '.'"
          [errorMessages]="reasonMessages"
          [errorText]="reasonServerError()"
        >
          <textarea ahInput rows="3" formControlName="reason"></textarea>
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class RestartVoyageDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly spentNano = computed(
    () => this.context.story()?.spentNanoAiu ?? 0
  );

  protected readonly actor = inject(CurrentUser).id;
  protected readonly form = new FormGroup({
    cap: new FormControl(
      suggestedRestartCap(
        this.context.story()?.budgetNanoAiu ?? 0,
        this.spentNano()
      ),
      {
        nonNullable: true,
        validators: [restartCapValidator(() => this.spentNano())],
      }
    ),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(REASON_MAX)],
    }),
  });
  protected readonly reasonMessages = REASON_MESSAGES;
  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly spent = computed(() => formatAiu(this.spentNano()));
  private readonly spentExact = computed(() => exactAiu(this.spentNano()));
  protected readonly capHint = computed(
    () =>
      `The whole voyage's cap, the cancelled attempt included: more than ${this.spentExact()} AIU, what's already spent.`
  );
  protected readonly capMessages = computed(() => ({
    required: 'Enter the total cap.',
    amount: 'Enter an amount in AIU, like 40 or 25.5.',
    notAboveSpent: `More than ${this.spentExact()} AIU, what's already spent.`,
  }));
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly capServerError = computed(() =>
    this.command.fieldError('budgetNanoAiu')
  );
  protected readonly reasonServerError = computed(() =>
    this.command.fieldError('reason')
  );

  protected async submit(): Promise<void> {
    this.form.controls.cap.updateValueAndValidity();
    this.form.markAllAsTouched();
    const checked = checkRestartCap(
      this.form.controls.cap.value,
      this.spentNano()
    );
    if (this.form.invalid || !('cap' in checked)) return;
    const story = this.command.settle(
      await this.context.restart(
        this.form.controls.reason.value.trim(),
        checked.cap
      )
    );
    if (story === null) return;
    this.toasts.show(`${story.key} sets sail again from intake.`);
    this.ref.close(story);
  }
}
