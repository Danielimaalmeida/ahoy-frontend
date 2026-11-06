import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ApiClient } from '@core/api/api-client';
import { fieldMessage, type ApiResult } from '@core/api/api-error';
import type { Story } from '@core/api/types';
import { apiErrorView } from '@core/commands/command-error';
import { checkAiuLimit } from '@domain/aiu';
import { MAX_DEFECT_BUDGET_NANO_AIU } from '@domain/defect-settings';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogService, DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';

/** What the Try to fix dialog is opened with. */
export interface TryToFixDialogData {
  readonly key: string;
  /** The Jira summary, to say which defect is meant. */
  readonly summary: string;
  /** Team settings › Defects' AIU cap per defect, the field's starting value; null when none is set or it is unknown. */
  readonly defaultCapNanoAiu: number | null;
}

/** The cap must be an amount above zero and at most 200 AIU; this dialog has no server default to fall back on. */
function capValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  if (control.value.trim() === '') return { required: true };
  const checked = checkAiuLimit(control.value, MAX_DEFECT_BUDGET_NANO_AIU);
  return 'error' in checked ? { [checked.error]: true } : null;
}

/**
 * "Try to fix PROJ-212?": starts the defect's voyage now (`startDefect`), owned by the person, with the AIU cap typed,
 * which starts at Team settings › Defects' cap per defect. The voyage runs as any other: the plan and the delivery
 * wait for a person. Closes with the voyage.
 */
@Component({
  selector: 'ah-try-to-fix-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="sail"
      [heading]="'Try to fix ' + key + '?'"
      [confirmLabel]="
        cap() === null
          ? 'Try to fix'
          : 'Try to fix · up to ' + capText() + ' AIU'
      "
      busyLabel="Starting…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Ahoy starts a voyage for <b>{{ key }}</b> ({{ summary }}): it reads the
        defect from Jira, plans the fix in the repositories it touches, and asks
        you to accept the plan before it changes any code.</span
      >
      <ah-banner ahDialogCost variant="cost" [heading]="costHeading()"
        >The voyage is yours: it is charged to you and waits for you at the plan
        and at the delivery.</ah-banner
      >
      <form (ngSubmit)="submit()">
        <ah-field
          label="AIU cap"
          required
          unit="AIU"
          hint="Every run of the voyage together. At most 200 AIU."
          [errorMessages]="capMessages"
          [errorText]="capServerError()"
        >
          <input
            ahInput
            [formControl]="capControl"
            inputmode="decimal"
            autocomplete="off"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class TryToFixDialog {
  private readonly data = inject<TryToFixDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly api = inject(ApiClient);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<Story> | null>(null);

  protected readonly key = this.data.key;
  protected readonly summary = this.data.summary;
  protected readonly capMessages = {
    required: 'Give the voyage an AIU cap.',
    amount: 'Type an amount in AIU, such as 20 or 12.5.',
    positive: 'The cap must be above 0 AIU.',
    maximum: 'The cap may be at most 200 AIU.',
  };
  protected readonly capControl = new FormControl(
    this.data.defaultCapNanoAiu === null
      ? ''
      : formatCap(this.data.defaultCapNanoAiu, 9),
    { nonNullable: true, validators: [capValidator] }
  );
  private readonly capValue = toSignal(this.capControl.valueChanges, {
    initialValue: this.capControl.value,
  });
  /** The cap typed, in nano-AIU; null when it is not a usable amount. */
  protected readonly cap = computed(() => {
    const checked = checkAiuLimit(this.capValue(), MAX_DEFECT_BUDGET_NANO_AIU);
    return 'cap' in checked ? checked.cap : null;
  });
  protected readonly capText = computed(() => formatCap(this.cap() ?? 0, 9));
  protected readonly costHeading = computed(() => {
    const cap = this.cap();
    return cap === null
      ? 'This spends AIU, up to the cap you give'
      : `This may spend up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok ? null : apiErrorView(last.error);
  });
  protected readonly capServerError = computed(() => {
    const last = this.last();
    return fieldMessage(
      last === null || last.ok ? null : last.error,
      'budgetNanoAiu'
    );
  });

  protected async submit(): Promise<void> {
    this.capControl.markAsTouched();
    const cap = this.cap();
    if (this.capControl.invalid || cap === null || this.busy()) return;
    this.busy.set(true);
    const result = await this.api.startDefect(this.key, cap);
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(`Voyage ${this.key} started.`);
    this.ref.close(result.value);
  }
}

/** Opens the Defects tab's Try to fix dialog. It closes with the voyage, or `undefined`. */
@Injectable({ providedIn: 'root' })
export class TryToFixDialogs {
  private readonly dialogs = inject(DialogService);

  /** "Try to fix PROJ-212?" */
  open(data: TryToFixDialogData): DialogRef<Story, TryToFixDialog> {
    return this.dialogs.open<Story, TryToFixDialogData, TryToFixDialog>(
      TryToFixDialog,
      { data }
    );
  }
}
