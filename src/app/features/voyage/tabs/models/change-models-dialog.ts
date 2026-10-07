import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, ElementRef, afterNextRender, computed, effect, inject, signal, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import type { ModelPlan, ModelSlot } from "@core/api/types";
import { DialogShell } from "@ui/dialog/dialog";
import { Field, FieldControl } from "@ui/field/field";
import {
  ModelChoiceTable,
  lookoutsConflictMessage,
  type EffortChoice,
  type ModelChoiceControls,
  type ModelChoiceRowSpec,
} from "@ui/model-choice/model-choice";
import { ToastService } from "@ui/toast/toast";
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  maxTrimmed,
  type VoyageDialogData,
} from "../../dialogs/dialog-support";
import {
  changedModels,
  draftsOf,
  lookoutsConflict,
  rowSpecs,
  slotErrors,
  type SlotDraft,
  type SlotDrafts,
} from "./models-change";
import { ModelsCommand } from "./models-command";

/** What the dialog opens with: the page's context, and the slot to put the focus on (from `?change=<slot>`). */
export interface ChangeModelsData extends VoyageDialogData {
  readonly slot: ModelSlot | null;
}

/** The model and effort controls of one slot, starting from `draft`. */
function slotControls(draft: SlotDraft): ModelChoiceControls {
  return {
    model: new FormControl(draft.model, { nonNullable: true }),
    effort: new FormControl<EffortChoice>(draft.effort, { nonNullable: true }),
  };
}

/**
 * "Models per phase" (wireframe `Dialogs`, Change models): one row per slot with its model and effort, a reason and Save.
 * The request carries **only the slots that changed**; a slot gone back to blank is `null` (the default); a model without
 * an effort goes as `{model}`. When both Lookouts would run on the same (effective) model, the error shows on both rows
 * and Save is blocked, with no request. On a conflict the dialog stays open and keeps what was typed.
 */
@Component({
  selector: "ah-change-models-dialog",
  imports: [DialogShell, Field, FieldControl, ModelChoiceTable, ReactiveFormsModule],
  styles: `
    .hint-apply {
      margin: 0;
    }
  `,
  template: `
    <ah-dialog
      heading="Models per phase"
      icon="wheel"
      confirmLabel="Save models"
      busyLabel="Saving…"
      [busy]="busy()"
      [confirmDisabled]="!canSave()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead class="ah-hint">Blank means the default. Changes apply from each phase's next run.</span>
      <ah-model-choice-table [rows]="rows()" [controls]="controls" />
      <form [formGroup]="reasonForm" (ngSubmit)="submit()">
        <ah-field label="Reason" optional [errorMessages]="reasonMessages" [errorText]="reasonServerError()">
          <textarea ahInput rows="2" formControlName="reason"></textarea>
        </ah-field>
      </form>
      <p class="ah-hint hint-apply">A change applies from that phase's next run; an active run keeps its model.</p>
    </ah-dialog>
  `,
})
export class ChangeModelsDialog {
  private readonly data = inject<ChangeModelsData>(DIALOG_DATA);
  private readonly context = this.data.context;
  private readonly ref = inject<DialogRef<ModelPlan>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly models = inject(ModelsCommand);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly command = new CommandState<ModelPlan>();

  /** The server's messages per row, from a `400`; cleared when anything is edited. */
  private readonly rowErrors = signal<Readonly<Partial<Record<ModelSlot, string>>>>({});

  /** The kit's controls of each slot. */
  protected readonly controls: Readonly<Record<ModelSlot, ModelChoiceControls>> = ((initial: SlotDrafts) => ({
    intake: slotControls(initial.intake),
    planning: slotControls(initial.planning),
    implementation: slotControls(initial.implementation),
    "review-design": slotControls(initial["review-design"]),
    "review-defect": slotControls(initial["review-defect"]),
  }))(draftsOf(this.context.models()));
  /** The same controls as one form, to read them together and hear any change. */
  private readonly form = new FormGroup({
    intake: new FormGroup(this.controls.intake),
    planning: new FormGroup(this.controls.planning),
    implementation: new FormGroup(this.controls.implementation),
    "review-design": new FormGroup(this.controls["review-design"]),
    "review-defect": new FormGroup(this.controls["review-defect"]),
  });
  protected readonly reasonForm = new FormGroup({
    reason: new FormControl("", { nonNullable: true, validators: [maxTrimmed(REASON_MAX)] }),
  });
  protected readonly reasonMessages = REASON_MESSAGES;

  private readonly edited = toSignal(this.form.valueChanges, { initialValue: undefined });
  private readonly reasonEdited = toSignal(this.reasonForm.controls.reason.valueChanges, { initialValue: "" });

  /** What the controls hold now. */
  protected readonly drafts = computed((): SlotDrafts => {
    this.edited();
    return this.form.getRawValue();
  });
  private readonly changes = computed(() => changedModels(this.context.models(), this.drafts()));
  /** The model both Lookouts would run on after the change, or null. */
  protected readonly conflict = computed(() => lookoutsConflict(this.context.models(), this.drafts()));
  protected readonly canSave = computed(() => {
    const reasonTooLong = this.reasonEdited().trim().length > REASON_MAX;
    return Object.keys(this.changes()).length > 0 && this.conflict() === null && !reasonTooLong;
  });

  protected readonly rows = computed((): readonly ModelChoiceRowSpec[] => {
    const conflict = this.conflict();
    const server = this.rowErrors();
    return rowSpecs(this.context.models()).map((spec) => {
      const lookout = spec.slot === "review-design" || spec.slot === "review-defect";
      const error = conflict !== null && lookout ? lookoutsConflictMessage(conflict) : server[spec.slot];
      return error === undefined ? spec : { ...spec, error };
    });
  });

  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly reasonServerError = computed(() => this.command.fieldError("reason"));

  constructor() {
    effect(() => {
      this.drafts();
      untracked(() => this.rowErrors.set({}));
    });
    const slot = this.data.slot;
    if (slot !== null) {
      // After the dialog shell put the focus on the first field: the slot named by `?change=` takes it.
      afterNextRender({
        read: () => {
          const index = rowSpecs(this.context.models()).findIndex((spec) => spec.slot === slot);
          const row = this.host.nativeElement.querySelectorAll("ah-model-choice-row")[index];
          row?.querySelector("input")?.focus();
        },
      });
    }
  }

  protected async submit(): Promise<void> {
    this.reasonForm.markAllAsTouched();
    if (!this.canSave() || this.reasonForm.invalid) return;
    const outcome = await this.models.save(this.context, this.changes(), this.reasonForm.controls.reason.value.trim());
    if (outcome.kind === "ok") {
      this.toasts.show("Models saved. Applies from each phase's next run.");
      this.ref.close(outcome.value);
      return;
    }
    this.command.settle(outcome);
    this.rowErrors.set(outcome.kind === "other" ? slotErrors(outcome.error) : {});
  }
}
