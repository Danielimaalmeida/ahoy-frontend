import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ApiResult } from '@core/api/api-error';
import type { KnowledgeReview } from '@core/api/types';
import { agentRunErrorView } from '@core/commands/command-error';
import { checkAiuLimit } from '@domain/aiu';
import { KNOWLEDGE_REVIEW_MAX_NANO_AIU } from '@domain/refinement';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import type { KnowledgeReviews } from '../header/knowledge-reviews';
import { resultFieldError } from './agent-diagnosis-dialogs';
import { REASON_MAX } from './dialog-support';

/** The longest notes the API takes for a knowledge review request (`maxLength: 2000`). */
export const KNOWLEDGE_NOTES_MAX = 2000;

function capValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const checked = checkAiuLimit(control.value, KNOWLEDGE_REVIEW_MAX_NANO_AIU);
  return 'error' in checked ? { [checked.error]: true } : null;
}

/** What the knowledge review dialogs are opened with. */
export interface KnowledgeReviewDialogData {
  readonly key: string;
  /** Whether the voyage is done (rules and lessons) rather than halted (lessons only). */
  readonly done: boolean;
  /** The panel's reviews, which send the request or the cancel and show the outcome. */
  readonly reviews: KnowledgeReviews;
}

/**
 * "Ask for the lessons of PROJ-097?": asks the server's knowledge agent to read what the voyage decided and what got in
 * its way, and propose business rules (a done voyage only) and lessons for the content repository. Notes and the AIU
 * limit are optional; it may spend AIU (not from the voyage's budget), so it says so and sends `confirmSpend: true`.
 * It changes nothing on the voyage nor in the content repository. Closes with the queued review.
 */
@Component({
  selector: 'ah-knowledge-review-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="compass"
      [heading]="heading"
      [confirmLabel]="
        cap() === null ? 'Review' : 'Review · up to ' + capText() + ' AIU'
      "
      busyLabel="Asking…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >An agent reads what <b>{{ key }}</b> decided and what got in its way
        (halts, gate rejections, rework notes and reviewer findings) and
        proposes
        @if (done) {
          business rules and one to three lessons
        } @else {
          one to three lessons
        }
        for the content repository. Nothing changes there until a person opens a
        pull request with its patch.</span
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
          hint="At most 100 AIU. Leave empty for the server's knowledge cap."
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
export class KnowledgeReviewDialog {
  private readonly data = inject<KnowledgeReviewDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<KnowledgeReview>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<KnowledgeReview> | null>(null);

  protected readonly key = this.data.key;
  protected readonly done = this.data.done;
  protected readonly heading = this.done
    ? `Ask for the rules and lessons of ${this.key}?`
    : `Ask for the lessons of ${this.key}?`;
  protected readonly notesMessages = {
    maxlength: `At most ${KNOWLEDGE_NOTES_MAX} characters.`,
  };
  protected readonly capMessages = {
    amount: 'Type an amount in AIU, such as 5 or 2.5.',
    positive: 'The limit must be above 0 AIU.',
    maximum: 'The limit may be at most 100 AIU.',
  };
  protected readonly form = new FormGroup({
    notes: new FormControl('', {
      nonNullable: true,
      validators: [maxTrimmed(KNOWLEDGE_NOTES_MAX)],
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
    const checked = checkAiuLimit(
      this.capValue(),
      KNOWLEDGE_REVIEW_MAX_NANO_AIU
    );
    return 'cap' in checked ? checked.cap : null;
  });
  protected readonly capText = computed(() => formatCap(this.cap() ?? 0, 9));
  protected readonly costHeading = computed(() => {
    const cap = this.cap();
    return cap === null
      ? "This may spend AIU, up to the server's knowledge cap"
      : `This may spend up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok
      ? null
      : agentRunErrorView(last.error, 'request', 'knowledge');
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
      KNOWLEDGE_REVIEW_MAX_NANO_AIU
    );
    const cap = 'cap' in checked ? checked.cap : null;
    this.busy.set(true);
    const result = await this.data.reviews.request(
      this.form.controls.notes.value.trim(),
      cap
    );
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(`Knowledge review of ${this.key} queued.`);
    this.ref.close(result.value);
  }
}

/** What the Cancel knowledge review dialog is opened with: the dialog data and whether the review is still queued. */
export interface CancelKnowledgeReviewDialogData extends KnowledgeReviewDialogData {
  readonly queued: boolean;
}

/**
 * "Cancel the knowledge review of PROJ-097?": stops a review in progress. The reason is required; who cancelled and why
 * become its exit reason. A queued one ends at once and spends nothing; a running one is stopped by the reconciler.
 * Closes with the review, cancelled or being cancelled.
 */
@Component({
  selector: 'ah-cancel-knowledge-review-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="danger"
      icon="close"
      [heading]="'Cancel the knowledge review of ' + key + '?'"
      confirmLabel="Cancel review"
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
export class CancelKnowledgeReviewDialog {
  private readonly data = inject<CancelKnowledgeReviewDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<KnowledgeReview>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<KnowledgeReview> | null>(null);

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
      : agentRunErrorView(last.error, 'cancel', 'knowledge');
  });
  protected readonly serverError = computed(() =>
    resultFieldError(this.last(), 'reason')
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || this.busy()) return;
    this.busy.set(true);
    const result = await this.data.reviews.cancel(this.reason.value.trim());
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(
      result.value.status === 'cancelled'
        ? `Knowledge review of ${this.key} cancelled.`
        : `Knowledge review of ${this.key} is being cancelled.`
    );
    this.ref.close(result.value);
  }
}
