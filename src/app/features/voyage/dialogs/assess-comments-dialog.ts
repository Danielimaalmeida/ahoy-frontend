import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { formatAiu } from '@domain/aiu';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import type { VoyageContext } from '../context/voyage-context';
import { CommandState, REASON_MAX } from './dialog-support';

/** What Assess comments is opened with: the page's context and the count of people's comments waiting, if counted. */
export interface AssessCommentsDialogData {
  readonly context: VoyageContext;
  readonly waiting: number | null;
}

/**
 * "Assess the comments on PROJ-123's pull requests?": the reviewer reads the open pull requests' comments, people's
 * among them, and rules on each: accepted (the work goes back to rework), declined with a reason Ahoy replies with, or a
 * question for a person. Then the voyage comes back to the delivery gate, also from done. The optional note goes to
 * the reviewer as a person's decision. It may spend AIU, from what is left of the budget; with nothing left it cannot
 * be confirmed.
 */
@Component({
  selector: 'ah-assess-comments-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="message"
      [heading]="'Assess the comments on ' + key() + '’s pull requests?'"
      [confirmLabel]="'Assess comments · up to ' + remaining() + ' AIU'"
      busyLabel="Asking the reviewer…"
      [busy]="busy()"
      [confirmDisabled]="noBudget()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >{{ lead() }} The reviewer rules on each comment: accepted ones go back
        to rework like any finding, declined ones get Ahoy's reason as a reply,
        and a question stops the voyage for a person. Then the delivery comes
        back to the gate{{ done() ? ', and needs accepting again' : '' }}.</span
      >
      @if (noBudget()) {
        <ah-banner
          ahDialogCost
          variant="error"
          heading="No budget left: raise the budget first."
          announce="status"
          >The voyage has spent all of its {{ budget() }} AIU.</ah-banner
        >
      } @else {
        <ah-banner
          ahDialogCost
          variant="cost"
          [heading]="'This may spend up to ' + remaining() + ' AIU'"
          >The review, and any rework it leads to, run from the rest of the
          voyage's {{ budget() }} AIU budget, billed to {{ owner() }}'s Copilot
          account.</ah-banner
        >
      }
      <ah-field
        label="Note for the reviewer"
        [hint]="
          'Optional: which comment matters, and why. Recorded as ' +
          actor() +
          '’s decision.'
        "
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="3" [formControl]="note"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class AssessCommentsDialog {
  private readonly data = inject<AssessCommentsDialogData>(DIALOG_DATA);
  private readonly context = this.data.context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly remainingNano = this.context.remainingNanoAiu;

  protected readonly actor = inject(CurrentUser).id;
  protected readonly messages: Readonly<Record<string, string>> = {
    maxlength: `At most ${REASON_MAX} characters.`,
  };
  protected readonly note = new FormControl('', {
    nonNullable: true,
    validators: [maxTrimmed(REASON_MAX)],
  });
  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly owner = computed(() => this.context.story()?.owner ?? '');
  protected readonly done = computed(() => {
    const story = this.context.story();
    return story?.status === 'terminal' && story.phase === 'done';
  });
  protected readonly lead = computed(() => {
    const waiting = this.data.waiting;
    if (waiting === null) return 'People’s comments have not been counted yet.';
    if (waiting === 0)
      return 'No comment by a person was waiting at the last count; Copilot’s still without a ruling are assessed too.';
    return `${waiting} comment${waiting === 1 ? '' : 's'} by people ${waiting === 1 ? 'is' : 'are'} waiting.`;
  });
  protected readonly budget = computed(() =>
    formatCap(this.context.story()?.budgetNanoAiu ?? 0, 1)
  );
  protected readonly remaining = computed(() =>
    formatAiu(this.remainingNano())
  );
  protected readonly noBudget = computed(() => this.remainingNano() === 0);
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly serverError = computed(() =>
    this.command.fieldError('note')
  );

  protected async submit(): Promise<void> {
    this.note.markAsTouched();
    if (this.note.invalid || this.noBudget()) return;
    const story = this.command.settle(
      await this.context.assessComments(this.note.value.trim())
    );
    if (story === null) return;
    this.toasts.show(
      `The reviewer assesses the comments on ${this.key()}'s pull requests.`
    );
    this.ref.close(story);
  }
}
