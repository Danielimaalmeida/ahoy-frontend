import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { Story } from '@core/api/types';
import { planningModeOf, planningModeChoices } from '@domain/planning-mode';
import type { PlanningMode } from '@domain/planning-mode';
import { ChoiceCardGroup } from '@ui/choice-card/choice-card';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  type VoyageDialogData,
} from '../../dialogs/dialog-support';

/** What the dialog opens with: the page's context, and how many planners the server's panel has (null when not known). */
export interface ChangePlanningModeData extends VoyageDialogData {
  readonly planners: number | null;
}

/**
 * "Planning" (Models tab): how the voyage is planned, by one planner or by a panel of planners and a judge, with an
 * optional reason. Nothing is sent while the choice is the one the voyage has. A change applies from the next planning
 * run (the first one, a re-plan, or the run after the planners' questions are answered): a run under way keeps what it
 * started with. On a conflict the dialog stays open with the banner and the choice as it was.
 */
@Component({
  selector: 'ah-change-planning-mode-dialog',
  imports: [
    ChoiceCardGroup,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
  ],
  styles: `
    .planning__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .planning__note {
      margin: 0;
    }
  `,
  template: `
    <ah-dialog
      heading="Planning"
      icon="wheel"
      confirmLabel="Save planning"
      busyLabel="Saving…"
      [busy]="busy()"
      [confirmDisabled]="!canSave()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead class="ah-hint"
        >How {{ key() }} is planned. It applies from the next planning run; a
        run under way keeps what it started with.</span
      >
      <form class="planning__form" [formGroup]="form" (ngSubmit)="submit()">
        <ah-choice-card-group
          label="Planning"
          [options]="choices()"
          formControlName="mode"
        />
        <ah-field
          label="Reason"
          optional
          [errorMessages]="reasonMessages"
          [errorText]="reasonServerError()"
        >
          <textarea ahInput rows="2" formControlName="reason"></textarea>
        </ah-field>
      </form>
      <p class="ah-hint planning__note">
        The model chosen for the planning slot is not used by a panel. A panel
        costs more AIU than one planner; the voyage's budget is still the hard
        stop.
      </p>
    </ah-dialog>
  `,
})
export class ChangePlanningModeDialog {
  private readonly data = inject<ChangePlanningModeData>(DIALOG_DATA);
  private readonly context = this.data.context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();

  /** What the voyage has now: the choice starts there. */
  private readonly current: PlanningMode = planningModeOf(
    this.context.story() ?? {}
  );

  protected readonly form = new FormGroup({
    mode: new FormControl<PlanningMode>(this.current, { nonNullable: true }),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [maxTrimmed(REASON_MAX)],
    }),
  });
  protected readonly reasonMessages = REASON_MESSAGES;
  protected readonly choices = computed(() =>
    planningModeChoices(this.data.planners)
  );
  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly reasonServerError = computed(() =>
    this.command.fieldError('reason')
  );

  private readonly edited = toSignal(this.form.valueChanges, {
    initialValue: undefined,
  });
  protected readonly canSave = computed(() => {
    this.edited();
    const { mode, reason } = this.form.getRawValue();
    return mode !== this.current && reason.trim().length <= REASON_MAX;
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.canSave() || this.form.invalid) return;
    const { mode, reason } = this.form.getRawValue();
    const story = this.command.settle(
      await this.context.setPlanningMode(mode, reason.trim())
    );
    if (story === null) return;
    this.toasts.show(
      mode === 'panel'
        ? 'Planning is now by a panel. Applies from the next planning run.'
        : 'Planning is now by one planner. Applies from the next planning run.'
    );
    this.ref.close(story);
  }
}
