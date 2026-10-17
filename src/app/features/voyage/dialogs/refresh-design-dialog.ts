import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import type { Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { formatAiu } from '@domain/aiu';
import { figmaLinksInput } from '@domain/figma-links';
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

/** Refuses the links text with what `figmaLinksInput` says is wrong with it. */
function figmaLinksValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const input = figmaLinksInput(control.value);
  return input.ok ? null : { figmaLinks: input.message };
}

/**
 * "Refresh the design of PROJ-123?": for a voyage built to a Figma design that the designer has since changed, usually
 * in a copy of the frames with new links. The new links, one per line, replace the old ones; the old design is kept as
 * a record, the frames are read again and every UI work package is built again to match them. The reason is required
 * and goes to the crew. It may spend AIU, from what is left of the budget; with nothing left it cannot be confirmed.
 */
@Component({
  selector: 'ah-refresh-design-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="sendback"
      icon="reset"
      [heading]="'Refresh the design of ' + key() + '?'"
      [confirmLabel]="'Refresh design · up to ' + remaining() + ' AIU'"
      busyLabel="Refreshing…"
      [busy]="busy()"
      [confirmDisabled]="noBudget()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Ahoy reads the new Figma frames, then each UI work package goes round
        again to match them, and the {{ lookout }} reviews the change. The old
        design is kept as a record. The plan and the acceptance criteria still
        win where the new design differs.</span
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
          >The design is read and the UI work runs again from the rest of the
          voyage's {{ budget() }} AIU budget, billed to {{ owner() }}'s Copilot
          account. What was spent so far stays spent.</ah-banner
        >
      }
      <ah-field
        label="New Figma links"
        required
        hint="One per line, each copied from a frame so it has its node-id."
        [errorText]="linksServerError()"
      >
        <textarea
          ahInput
          rows="3"
          spellcheck="false"
          [formControl]="links"
        ></textarea>
      </ah-field>
      <ah-field
        label="What changed in the design"
        required
        [hint]="
          'Given to the crew with the new frames. Recorded as ' + actor() + '.'
        "
        [errorMessages]="messages"
        [errorText]="reasonServerError()"
      >
        <textarea ahInput rows="3" [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class RefreshDesignDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly remainingNano = this.context.remainingNanoAiu;

  protected readonly lookout = CREW.review;
  protected readonly actor = inject(CurrentUser).id;
  protected readonly messages = REASON_MESSAGES;
  protected readonly links = new FormControl('', {
    nonNullable: true,
    validators: [figmaLinksValidator],
  });
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
  protected readonly linksServerError = computed(() =>
    this.command.fieldError('figmaLinks')
  );
  protected readonly reasonServerError = computed(() =>
    this.command.fieldError('reason')
  );

  protected async submit(): Promise<void> {
    this.links.markAsTouched();
    this.reason.markAsTouched();
    const input = figmaLinksInput(this.links.value);
    if (!input.ok || this.reason.invalid || this.noBudget()) return;
    const story = this.command.settle(
      await this.context.refreshDesign(this.reason.value.trim(), input.links)
    );
    if (story === null) return;
    this.toasts.show(
      `Design refresh started. Ahoy reads the new frames of ${this.key()}, then the UI work goes round again.`
    );
    this.ref.close(story);
  }
}
