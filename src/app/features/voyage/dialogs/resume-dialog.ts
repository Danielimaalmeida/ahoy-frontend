import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, computed, inject } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import type { Story } from "@core/api/types";
import { formatAiu } from "@domain/aiu";
import { CREW } from "@domain/models";
import { Banner } from "@ui/banner/banner";
import { formatCap } from "@ui/budget-meter/budget-meter";
import { DialogShell } from "@ui/dialog/dialog";
import { Field, FieldControl } from "@ui/field/field";
import { ToastService } from "@ui/toast/toast";
import { modelLabel, slotsForPhase } from "../context/crew";
import { CommandState, REASON_MAX, REASON_MESSAGES, maxTrimmed, type VoyageDialogData } from "./dialog-support";

/** One crew member a resume restarts, and the model its next run gets. */
interface ResumeCrew {
  readonly crew: string;
  readonly model: string;
}

/**
 * "Weigh anchor and resume?" (wireframe `Dialogs`): says which phase is retried, by whom and on which model, and how much
 * it may spend (what is left of the budget, billed to the owner). With nothing left it cannot be confirmed: the budget
 * must be raised first. The reason is optional and sent only when there is one.
 */
@Component({
  selector: "ah-resume-dialog",
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      heading="Weigh anchor and resume?"
      icon="sail"
      [confirmLabel]="'Resume · up to ' + remaining() + ' AIU'"
      busyLabel="Resuming…"
      [busy]="busy()"
      [confirmDisabled]="noBudget()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Ahoy retries <b>{{ phase() }}</b>
        @for (member of crew(); track member.crew) {
          {{ $first ? "with" : "and" }} {{ member.crew }} on <span class="ah-mono">{{ member.model }}</span>
        }
        .</span
      >
      @if (noBudget()) {
        <ah-banner ahDialogCost variant="error" heading="No budget left: raise the budget first." announce="status"
          >The voyage has spent all of its {{ budget() }} AIU.</ah-banner
        >
      } @else {
        <ah-banner ahDialogCost variant="cost" [heading]="'This may spend up to ' + remaining() + ' AIU'"
          >The rest of the voyage's {{ budget() }} AIU budget, billed to {{ owner() }}'s Copilot account. Anyone can
          stop it again.</ah-banner
        >
      }
      <ah-field label="Reason" optional [errorMessages]="messages" [errorText]="serverError()">
        <textarea ahInput rows="2" [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class ResumeDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly remainingNano = this.context.remainingNanoAiu;

  protected readonly messages = REASON_MESSAGES;
  protected readonly reason = new FormControl("", { nonNullable: true, validators: [maxTrimmed(REASON_MAX)] });
  protected readonly phase = computed(() => this.context.story()?.phase ?? "");
  protected readonly owner = computed(() => this.context.story()?.owner ?? "");
  protected readonly budget = computed(() => formatCap(this.context.story()?.budgetNanoAiu ?? 0, 1));
  protected readonly remaining = computed(() => formatAiu(this.remainingNano()));
  protected readonly noBudget = computed(() => this.remainingNano() === 0);
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly serverError = computed(() => this.command.fieldError("reason"));

  /** Who the resume restarts: the slots of the phase in the model plan (two Lookouts in `pr_review`). */
  protected readonly crew = computed((): readonly ResumeCrew[] =>
    slotsForPhase(this.context.models(), this.phase()).map((slot) => ({
      crew: CREW[slot.slot],
      model: modelLabel(slot),
    })),
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || this.noBudget()) return;
    const phase = this.phase();
    const story = this.command.settle(await this.context.resume(this.reason.value.trim()));
    if (story === null) return;
    this.toasts.show(`Voyage resumed. ${phase} is queued again.`);
    this.ref.close(story);
  }
}
