import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { fieldMessage, type ApiResult } from '@core/api/api-error';
import type { Refinement } from '@core/api/types';
import { agentRunErrorView } from '@core/commands/command-error';
import { checkAiuLimit } from '@domain/aiu';
import { AGENT_RUN_MAX_NANO_AIU } from '@domain/refinement';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import type { AgentDiagnoses } from '../header/agent-diagnoses';
import { REASON_MAX } from './dialog-support';

/** The longest notes the API takes for a diagnosis request (`maxLength: 2000`). */
export const DIAGNOSIS_NOTES_MAX = 2000;

function capValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const checked = checkAiuLimit(control.value, AGENT_RUN_MAX_NANO_AIU);
  return 'error' in checked ? { [checked.error]: true } : null;
}

/** The server's message for one field of the request, from a result that failed ("" when there is none). */
function resultFieldError(
  result: ApiResult<unknown> | null,
  field: string
): string {
  return fieldMessage(
    result === null || result.ok ? null : result.error,
    field
  );
}

/** What the agent diagnosis dialogs are opened with. */
export interface AgentDiagnosisDialogData {
  readonly key: string;
  /** The banner's diagnoses, which send the request or the cancel and show the outcome. */
  readonly diagnoses: AgentDiagnoses;
}

/**
 * "Ask an agent to diagnose PROJ-118?": asks the server's diagnosing agent to read the halted voyage's history and say
 * what the fixed rules cannot. Notes and the AIU limit are optional; it may spend AIU (not from the voyage's budget), so
 * it says so and sends `confirmSpend: true`. It is read-only and changes nothing on the voyage. Closes with the queued
 * diagnosis.
 */
@Component({
  selector: 'ah-agent-diagnosis-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="compass"
      [heading]="'Ask an agent to diagnose ' + key + '?'"
      [confirmLabel]="
        cap() === null ? 'Diagnose' : 'Diagnose · up to ' + capText() + ' AIU'
      "
      busyLabel="Asking…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >An agent reads what Ahoy knows of why <b>{{ key }}</b> halted (its
        runs, spend, gate verdicts and the halt event) and replies here with the
        cause, the evidence, what fixes it, who acts and what is still unknown.
        It is read-only: it changes nothing on the voyage and does not resume
        it.</span
      >
      <ah-banner ahDialogCost variant="cost" [heading]="costHeading()"
        >It is not charged to the voyage's budget. It shares the run slots with
        the voyages, so it may wait in the queue.</ah-banner
      >
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ah-field
          label="Notes for the agent"
          optional
          hint="What it should look at. Given to it as your notes."
          [errorMessages]="notesMessages"
          [errorText]="notesServerError()"
        >
          <textarea ahInput rows="3" formControlName="notes"></textarea>
        </ah-field>
        <ah-field
          label="AIU limit"
          optional
          unit="AIU"
          hint="At most 20 AIU. Leave empty for the server's diagnosis cap."
          [errorMessages]="capMessages"
          [errorText]="capServerError()"
        >
          <input
            ahInput
            formControlName="cap"
            inputmode="decimal"
            autocomplete="off"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class AgentDiagnosisDialog {
  private readonly data = inject<AgentDiagnosisDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Refinement>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<Refinement> | null>(null);

  protected readonly key = this.data.key;
  protected readonly notesMessages = {
    maxlength: `At most ${DIAGNOSIS_NOTES_MAX} characters.`,
  };
  protected readonly capMessages = {
    amount: 'Type an amount in AIU, such as 5 or 2.5.',
    positive: 'The limit must be above 0 AIU.',
    maximum: 'The limit may be at most 20 AIU.',
  };
  protected readonly form = new FormGroup({
    notes: new FormControl('', {
      nonNullable: true,
      validators: [maxTrimmed(DIAGNOSIS_NOTES_MAX)],
    }),
    cap: new FormControl('', {
      nonNullable: true,
      validators: [capValidator],
    }),
  });
  private readonly capValue = toSignal(this.form.controls.cap.valueChanges, {
    initialValue: '',
  });
  /** The limit typed, in nano-AIU; null when there is none or it is not an amount. */
  protected readonly cap = computed(() => {
    const checked = checkAiuLimit(this.capValue(), AGENT_RUN_MAX_NANO_AIU);
    return 'cap' in checked ? checked.cap : null;
  });
  protected readonly capText = computed(() => formatCap(this.cap() ?? 0, 9));
  protected readonly costHeading = computed(() => {
    const cap = this.cap();
    return cap === null
      ? "This may spend AIU, up to the server's diagnosis cap"
      : `This may spend up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok
      ? null
      : agentRunErrorView(last.error, 'request', 'diagnosis');
  });
  protected readonly notesServerError = computed(() =>
    resultFieldError(this.last(), 'notes')
  );
  protected readonly capServerError = computed(() =>
    resultFieldError(this.last(), 'budgetNanoAiu')
  );

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const checked = checkAiuLimit(
      this.form.controls.cap.value,
      AGENT_RUN_MAX_NANO_AIU
    );
    const cap = 'cap' in checked ? checked.cap : null;
    this.busy.set(true);
    const result = await this.data.diagnoses.request(
      this.form.controls.notes.value.trim(),
      cap
    );
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(`Agent diagnosis of ${this.key} queued.`);
    this.ref.close(result.value);
  }
}

/** What the Cancel diagnosis dialog is opened with: the dialog data and whether the diagnosis is still queued. */
export interface CancelAgentDiagnosisDialogData extends AgentDiagnosisDialogData {
  readonly queued: boolean;
}

/**
 * "Cancel the diagnosis of PROJ-118?": stops a diagnosis in progress. The reason is required; who cancelled and why
 * become its exit reason. A queued one ends at once and spends nothing; a running one is stopped by the reconciler.
 * Closes with the diagnosis, cancelled or being cancelled.
 */
@Component({
  selector: 'ah-cancel-agent-diagnosis-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="danger"
      icon="close"
      [heading]="'Cancel the diagnosis of ' + key + '?'"
      confirmLabel="Cancel diagnosis"
      cancelLabel="Keep it"
      busyLabel="Cancelling…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>
        @if (queued) {
          It is still waiting for a run slot: it ends at once and spends
          nothing.
        } @else {
          The agent is stopped. What it spent so far stays spent and is
          recorded.
        }
      </span>
      <ah-field
        label="Reason"
        required
        hint="Recorded with your name as its exit reason."
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="2" [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class CancelAgentDiagnosisDialog {
  private readonly data = inject<CancelAgentDiagnosisDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Refinement>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<Refinement> | null>(null);

  protected readonly key = this.data.key;
  protected readonly queued = this.data.queued;
  protected readonly messages = {
    required: 'A reason is required.',
    maxlength: `At most ${REASON_MAX} characters.`,
  };
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [requiredText, maxTrimmed(REASON_MAX)],
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok
      ? null
      : agentRunErrorView(last.error, 'cancel', 'diagnosis');
  });
  protected readonly serverError = computed(() =>
    resultFieldError(this.last(), 'reason')
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || this.busy()) return;
    this.busy.set(true);
    const result = await this.data.diagnoses.cancel(this.reason.value.trim());
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(
      result.value.status === 'cancelled'
        ? `Diagnosis of ${this.key} cancelled.`
        : `Diagnosis of ${this.key} is being cancelled.`
    );
    this.ref.close(result.value);
  }
}
