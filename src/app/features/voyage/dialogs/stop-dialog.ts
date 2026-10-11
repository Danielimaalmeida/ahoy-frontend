import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { formatAiu } from '@domain/aiu';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { runById, runCrew } from '../context/crew';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  type VoyageDialogData,
} from './dialog-support';

/**
 * "Drop anchor on PROJ-140?" (wireframe `Dialogs`): halts the voyage with a required reason. With a run under way it says
 * that the run is cancelled in the background and that what it used stays spent. On a conflict the dialog stays open
 * with the banner and the reason as typed.
 */
@Component({
  selector: 'ah-stop-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="danger"
      icon="anchor"
      [heading]="'Stop ' + key() + '?'"
      cancelLabel="Keep it running"
      confirmLabel="Stop voyage"
      busyLabel="Stopping…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >The voyage halts in <b>{{ phase() }}</b
        >.
        @if (run(); as r) {
          @if (r.used !== null) {
            {{ r.crew }}'s run <span class="ah-mono">{{ r.id }}</span> is
            cancelled in the background; the {{ r.used }} AIU it has used stays
            spent.
          } @else {
            Run <span class="ah-mono">{{ r.id }}</span> is cancelled in the
            background; what it has used stays spent.
          }
        }
      </span>
      <ah-field
        label="Reason"
        required
        [hint]="'Shown to the crew on the voyage. Recorded as ' + actor() + '.'"
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="3" [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class StopDialog {
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
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly serverError = computed(() =>
    this.command.fieldError('reason')
  );

  /** The run that stopping cancels, if one is under way. */
  protected readonly run = computed(() => {
    const runId = this.context.story()?.currentRunId ?? null;
    if (runId === null) return null;
    const run = runById(this.context.runs(), runId);
    return run === undefined
      ? { id: runId, crew: '', used: null }
      : {
          id: run.id,
          crew: runCrew(run),
          used: formatAiu(run.usage.nanoAiu, 2),
        };
  });

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid) return;
    const phase = this.phase();
    const story = this.command.settle(
      await this.context.stop(this.reason.value.trim())
    );
    if (story === null) return;
    this.toasts.show(
      `Voyage stopped. It stays anchored in ${phase} until someone resumes it.`
    );
    this.ref.close(story);
  }
}
