import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Story } from '@core/api/types';
import { apiErrorView } from '@core/commands/command-error';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import { CommandState, type VoyageDialogData } from './dialog-support';

/** Confirms more rework without approving delivery; the reason is an audit record, not an instruction. */
@Component({
  selector: 'ah-unblock-dialog',
  imports: [
    Banner,
    Button,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
  ],
  styles: `
    select[multiple] {
      height: auto;
      padding-block: var(--space-2);
    }
    .unblock__confirm {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .unblock__confirm input {
      margin-top: 3px;
    }
  `,
  template: `
    <ah-dialog
      [heading]="'Unblock ' + key() + '?'"
      icon="reset"
      confirmLabel="Unblock"
      busyLabel="Unblocking…"
      [busy]="busy()"
      [confirmDisabled]="!canConfirm()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>
        Add rework rounds and return the voyage to the phase it was blocked
        from, where its gate runs again. A voyage blocked by a person's
        rejection at a human gate cannot be unblocked.
      </span>
      <ah-banner
        ahDialogCost
        variant="cost"
        heading="Unblocking permits more work and may spend AIU. It does not approve the delivery or waive acceptance criteria."
      >
        The reason is recorded in the decision history, not sent as an
        implementation instruction.
      </ah-banner>
      @if (refreshError(); as e) {
        <ah-banner
          [variant]="e.variant"
          [heading]="e.heading"
          [tech]="e.tech ?? ''"
        >
          {{ e.text ?? '' }}
          <button
            ahButton
            type="button"
            [disabled]="busy()"
            (click)="refresh()"
          >
            Try again
          </button>
        </ah-banner>
      }
      @if (reviewRequired()) {
        <ah-banner
          variant="notice"
          heading="Review the refreshed voyage before retrying"
          announce="alert"
        >
          Current phase: {{ context.story()?.phase }}. Status:
          {{ context.story()?.status }}. Version: {{ context.version() }}. Your
          entries are kept. Confirm again only after reviewing the changes.
        </ah-banner>
      }
      @if (!blocked()) {
        <ah-banner
          variant="notice"
          heading="This voyage is no longer blocked"
          announce="status"
        >
          Close this dialog and review the refreshed voyage.
        </ah-banner>
      }
      <ah-field
        label="Reason"
        required
        hint="Recorded in the decision history, not sent as an implementation instruction."
        [errorMessages]="reasonMessages"
        [errorText]="reasonError()"
      >
        <textarea
          ahInput
          rows="3"
          [formControl]="form.controls.reason"
        ></textarea>
      </ah-field>
      <ah-field
        label="Additional rework rounds"
        required
        hint="Add 1 to 10 rounds to each selected repository's rework ceiling."
        [errorMessages]="roundsMessages"
        [errorText]="roundsError()"
      >
        <input
          ahInput
          type="number"
          min="1"
          max="10"
          step="1"
          [formControl]="form.controls.rounds"
        />
      </ah-field>
      <ah-field
        label="Repositories"
        optional
        hint="Select specific repository aliases, or leave all unselected for repositories at their rework ceiling."
        [errorText]="reposError()"
      >
        <select ahInput multiple size="4" [formControl]="form.controls.repos">
          @for (repo of aliases(); track repo) {
            <option [value]="repo">{{ repo }}</option>
          } @empty {
            <option disabled>No repository aliases recorded</option>
          }
        </select>
      </ah-field>
      <label class="unblock__confirm">
        <input type="checkbox" [formControl]="form.controls.confirmed" />
        <span
          >I understand that unblocking permits more work and may spend AIU
          without approving delivery.</span
        >
      </label>
    </ah-dialog>
  `,
})
export class UnblockDialog {
  protected readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly submitting = signal(false);

  protected readonly form = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, maxTrimmed(5000)],
    }),
    rounds: new FormControl<number | null>(1, {
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(10),
        (control) =>
          Number.isSafeInteger(control.value) ? null : { integer: true },
      ],
    }),
    repos: new FormControl<readonly string[]>([], {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    confirmed: new FormControl(false, { nonNullable: true }),
  });
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly reasonMessages = {
    required: 'A reason is required.',
    maxlength: 'At most 5000 characters.',
  };
  protected readonly roundsMessages = {
    required: 'Enter the number of additional rounds.',
    min: 'Add at least 1 round.',
    max: 'Add at most 10 rounds.',
    integer: 'Enter a whole number of rounds.',
  };
  protected readonly key = this.context.key;
  protected readonly blocked = computed(
    () => this.context.story()?.phase === 'blocked'
  );
  protected readonly aliases = computed(
    () => this.context.state()?.repositoryAliases ?? []
  );
  protected readonly busy = computed(
    () => this.submitting() || this.context.commands.pending()
  );
  protected readonly reviewRequired = signal(false);
  protected readonly error = this.command.error;
  protected readonly refreshError = computed(() => {
    const handle = this.context.handle();
    const error = handle?.story.error() ?? handle?.state.error();
    return error ? apiErrorView(error) : null;
  });
  protected readonly reasonError = computed(() =>
    this.command.fieldError('reason')
  );
  protected readonly roundsError = computed(() =>
    this.command.fieldError('rounds')
  );
  protected readonly reposError = computed(() => {
    this.values();
    const selected = this.form.controls.repos.value;
    if (selected.length > 50) return 'Select at most 50 repositories.';
    if (selected.some((repo) => !this.aliases().includes(repo)))
      return 'The repository list changed. Review your selection.';
    return this.command.fieldError('repos');
  });
  protected readonly canConfirm = computed(() => {
    this.values();
    return (
      this.blocked() &&
      this.refreshError() === null &&
      this.form.valid &&
      this.form.controls.confirmed.value &&
      this.form.controls.repos.value.every((repo) =>
        this.aliases().includes(repo)
      )
    );
  });

  protected async refresh(): Promise<void> {
    this.form.controls.confirmed.setValue(false);
    await this.context.refresh();
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.busy() || !this.canConfirm()) return;
    const { reason, rounds, repos } = this.form.getRawValue();
    if (rounds === null) return;
    this.submitting.set(true);
    try {
      const outcome = await this.context.unblock(reason.trim(), rounds, repos);
      const story = this.command.settle(outcome);
      if (story !== null) {
        this.toasts.show(
          'Voyage unblocked. Its gates and acceptance criteria still apply.'
        );
        this.ref.close(story);
      } else if (
        outcome.kind !== 'skipped' &&
        outcome.kind !== 'ok' &&
        outcome.error.kind === 'problem' &&
        outcome.error.status === 409
      ) {
        this.reviewRequired.set(true);
        this.form.controls.confirmed.setValue(false);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
