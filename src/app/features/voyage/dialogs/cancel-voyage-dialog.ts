import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
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

/**
 * "Cancel PROJ-140?": ends the voyage for good with a required reason (`cancelStory`), so it no longer stands halted
 * waiting for someone. It says that a run under way is cancelled in the background, that nothing is written to Jira or
 * GitHub, and that it cannot be undone. On a conflict the dialog stays open with the banner and the reason as typed.
 */
@Component({
  selector: 'ah-cancel-voyage-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="danger"
      icon="close"
      [heading]="'Cancel ' + key() + '?'"
      cancelLabel="Keep the voyage"
      confirmLabel="Cancel voyage"
      busyLabel="Cancelling…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >The voyage ends for good in <b>{{ phase() }}</b
        >: no crew member works on it again and it no longer waits for anyone.
        @if (runId(); as id) {
          Run <span class="ah-mono">{{ id }}</span> is cancelled in the
          background; what it has used stays spent.
        }
        Jira and any pull request are left as they are. This can't be undone.
      </span>
      <ah-field
        label="Reason"
        required
        [hint]="'Kept in the decision log. Recorded as ' + actor() + '.'"
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="3" [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class CancelVoyageDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();

  protected readonly actor = inject(CurrentUser).id;
  protected readonly messages = REASON_MESSAGES;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [requiredText, maxTrimmed(REASON_MAX)],
  });
  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly phase = computed(() => this.context.story()?.phase ?? '');
  protected readonly runId = computed(
    () => this.context.story()?.currentRunId ?? null
  );
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly serverError = computed(() =>
    this.command.fieldError('reason')
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid) return;
    const phase = this.phase();
    const story = this.command.settle(
      await this.context.cancel(this.reason.value.trim())
    );
    if (story === null) return;
    this.toasts.show(`Voyage cancelled in ${phase}.`);
    this.ref.close(story);
  }
}
