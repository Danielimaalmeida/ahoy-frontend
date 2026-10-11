import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { fieldMessage, type ApiResult } from '@core/api/api-error';
import type { Refinement, RefinementSummary } from '@core/api/types';
import { agentRunErrorView } from '@core/commands/command-error';
import { checkAiuLimit } from '@domain/aiu';
import { AGENT_RUN_MAX_NANO_AIU } from '@domain/refinement';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogService, DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import type { BacklogRefinements } from './backlog-refinements';

/** The longest notes and cancel reason the API takes (`maxLength: 2000`). */
export const REFINEMENT_TEXT_MAX = 2000;

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

/** What the Refine dialog is opened with. */
export interface RefineDialogData {
  readonly key: string;
  /** The Jira summary, to say which item is meant. */
  readonly summary: string;
  /** The page's refinements, which send the request and show its outcome in the row. */
  readonly refinements: BacklogRefinements;
}

/**
 * "Refine PROJ-145?": asks the server's refinement agent to pre-refine a backlog item. The notes and the AIU limit are
 * optional; it may spend AIU (not from any voyage's budget), so it says so and sends `confirmSpend: true`. Closes with
 * the queued refinement.
 */
@Component({
  selector: 'ah-refine-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="compass"
      [heading]="'Refine ' + key + '?'"
      [confirmLabel]="
        cap() === null ? 'Refine' : 'Refine · up to ' + capText() + ' AIU'
      "
      busyLabel="Asking…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >An agent reads <b>{{ key }}</b> ({{ summary }}) in Jira and Confluence,
        and the mapped repositories read-only, and replies here with a
        pre-refinement: a verdict, acceptance criteria, open questions and
        risks. Nothing is written to Jira.</span
      >
      <ah-banner ahDialogCost variant="cost" [heading]="costHeading()"
        >It is not charged to any voyage's budget. It shares the run slots with
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
          hint="At most 20 AIU. Leave empty for the server's refinement cap."
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
export class RefineDialog {
  private readonly data = inject<RefineDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Refinement>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<Refinement> | null>(null);

  protected readonly key = this.data.key;
  protected readonly summary = this.data.summary;
  protected readonly notesMessages = {
    maxlength: `At most ${REFINEMENT_TEXT_MAX} characters.`,
  };
  protected readonly capMessages = {
    amount: 'Type an amount in AIU, such as 5 or 2.5.',
    positive: 'The limit must be above 0 AIU.',
    maximum: 'The limit may be at most 20 AIU.',
  };
  protected readonly form = new FormGroup({
    notes: new FormControl('', {
      nonNullable: true,
      validators: [maxTrimmed(REFINEMENT_TEXT_MAX)],
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
      ? "This may spend AIU, up to the server's refinement cap"
      : `This may spend up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok
      ? null
      : agentRunErrorView(last.error, 'request', 'refinement');
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
    const result = await this.data.refinements.request(
      this.key,
      this.form.controls.notes.value.trim(),
      cap
    );
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(`Refinement of ${this.key} queued.`);
    this.ref.close(result.value);
  }
}

/** What the Cancel refinement dialog is opened with. */
export interface CancelRefinementDialogData {
  /** The refinement in progress, as the row shows it. */
  readonly refinement: RefinementSummary;
  /** The page's refinements, which send the cancel and show its outcome in the row. */
  readonly refinements: BacklogRefinements;
}

/**
 * "Cancel the refinement of PROJ-145?": stops a refinement in progress. The reason is required; who cancelled and why
 * become its exit reason. A queued one ends at once and spends nothing; a running one is stopped by the reconciler.
 * Closes with the refinement, cancelled or being cancelled.
 */
@Component({
  selector: 'ah-cancel-refinement-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="danger"
      icon="close"
      [heading]="'Cancel the refinement of ' + key + '?'"
      confirmLabel="Cancel refinement"
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
export class CancelRefinementDialog {
  private readonly data = inject<CancelRefinementDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Refinement>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<Refinement> | null>(null);

  protected readonly key = this.data.refinement.key;
  protected readonly queued = this.data.refinement.status === 'queued';
  protected readonly messages = {
    required: 'A reason is required.',
    maxlength: `At most ${REFINEMENT_TEXT_MAX} characters.`,
  };
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [requiredText, maxTrimmed(REFINEMENT_TEXT_MAX)],
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok
      ? null
      : agentRunErrorView(last.error, 'cancel', 'refinement');
  });
  protected readonly serverError = computed(() =>
    resultFieldError(this.last(), 'reason')
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || this.busy()) return;
    this.busy.set(true);
    const result = await this.data.refinements.cancel(
      this.key,
      this.reason.value.trim()
    );
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(
      result.value.status === 'cancelled'
        ? `Refinement of ${this.key} cancelled.`
        : `Refinement of ${this.key} is being cancelled.`
    );
    this.ref.close(result.value);
  }
}

/** Opens the Backlog's Refine and Cancel refinement dialogs. Each closes with the refinement, or `undefined`. */
@Injectable({ providedIn: 'root' })
export class RefinementDialogs {
  private readonly dialogs = inject(DialogService);

  /** "Refine PROJ-145?" */
  refine(data: RefineDialogData): DialogRef<Refinement, RefineDialog> {
    return this.dialogs.open<Refinement, RefineDialogData, RefineDialog>(
      RefineDialog,
      { data }
    );
  }

  /** "Cancel the refinement of PROJ-145?" */
  cancel(
    data: CancelRefinementDialogData
  ): DialogRef<Refinement, CancelRefinementDialog> {
    return this.dialogs.open<
      Refinement,
      CancelRefinementDialogData,
      CancelRefinementDialog
    >(CancelRefinementDialog, { data });
  }
}
