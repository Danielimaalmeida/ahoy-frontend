import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { formatAiu } from '@domain/aiu';
import { CREW } from '@domain/models';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  type VoyageDialogData,
} from './dialog-support';

/**
 * "Send PROJ-123 back to intake?": for a story whose Jira ticket was wrong or incomplete, after Jira was updated. Intake
 * reads the ticket again and planning starts over; the current plan and its approvals are set aside and the questions so
 * far become history. The reason, what changed in Jira, is required and goes to the crew. It may spend AIU, from what is
 * left of the budget; with nothing left it cannot be confirmed.
 */
@Component({
  selector: 'ah-refresh-intake-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="sendback"
      icon="reset"
      [heading]="'Send ' + key() + ' back to intake?'"
      [confirmLabel]="'Back to intake · up to ' + remaining() + ' AIU'"
      busyLabel="Sending back…"
      [busy]="busy()"
      [confirmDisabled]="noBudget()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Update the Jira ticket first. {{ navigator }} reads it again, then
        {{ cartographer }} plans from the new snapshot. The current plan and its
        approvals are set aside, and the questions so far are kept as history,
        not as answers to reuse.</span
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
          >Intake and planning run again from the rest of the voyage's
          {{ budget() }} AIU budget, billed to {{ owner() }}'s Copilot account.
          What was spent so far stays spent.</ah-banner
        >
      }
      <ah-field
        label="What changed in Jira"
        required
        [hint]="
          'Given to the crew with the refresh. Recorded as ' + actor() + '.'
        "
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="3" [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class RefreshIntakeDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly remainingNano = this.context.remainingNanoAiu;

  protected readonly navigator = CREW.intake;
  protected readonly cartographer = CREW.planning;
  protected readonly actor = inject(CurrentUser).id;
  protected readonly messages = REASON_MESSAGES;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [requiredText, maxTrimmed(REASON_MAX)],
  });
  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly owner = computed(() => this.context.story()?.owner ?? '');
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
    this.command.fieldError('reason')
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || this.noBudget()) return;
    const key = this.key();
    const story = this.command.settle(
      await this.context.refreshIntake(this.reason.value.trim())
    );
    if (story === null) return;
    this.toasts.show(
      `Voyage sent back to intake. ${this.navigator} reads ${key} from Jira again.`
    );
    this.ref.close(story);
  }
}
