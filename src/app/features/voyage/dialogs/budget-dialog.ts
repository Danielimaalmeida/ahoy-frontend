import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import type { AbstractControl, ValidationErrors } from "@angular/forms";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import type { Story } from "@core/api/types";
import { budgetPercent, capCoversSpent, formatAiu, parseAiu, remainingNano } from "@domain/aiu";
import { Banner } from "@ui/banner/banner";
import { formatCap } from "@ui/budget-meter/budget-meter";
import { DialogShell } from "@ui/dialog/dialog";
import { Field, FieldControl } from "@ui/field/field";
import { ToastService } from "@ui/toast/toast";
import {
  CommandState,
  REASON_MAX,
  REASON_MESSAGES,
  maxTrimmed,
  requiredText,
  type VoyageDialogData,
} from "./dialog-support";

/** An amount in nano-AIU as the person would type it: every decimal kept, no trailing zeros ("12.43", "40"). */
export function exactAiu(nanoAiu: number): string {
  return formatCap(nanoAiu, 9);
}

/** How the new cap compares with the current one: "Allows up to 10 AIU more", "Allows 5 AIU less". */
export function capChange(newCapNanoAiu: number, capNanoAiu: number): string {
  const delta = newCapNanoAiu - capNanoAiu;
  if (delta > 0) return `Allows up to ${exactAiu(delta)} AIU more`;
  if (delta < 0) return `Allows ${exactAiu(-delta)} AIU less`;
  return `The cap stays at ${exactAiu(capNanoAiu)} AIU`;
}

/** Why a "New total cap" text is refused. */
export type CapError = "required" | "amount" | "positive" | "belowSpent";

/**
 * Reads the "New total cap" text: an amount in AIU (read without floats by `parseAiu`), above zero and at least what is
 * already spent. Gives the cap in nano-AIU, or why it is refused.
 */
export function checkCap(text: string, spentNanoAiu: number): { readonly cap: number } | { readonly error: CapError } {
  if (text.trim() === "") return { error: "required" };
  const cap = parseAiu(text);
  if (cap === null) return { error: "amount" };
  if (cap < 1) return { error: "positive" };
  return capCoversSpent(cap, spentNanoAiu) ? { cap } : { error: "belowSpent" };
}

/** {@link checkCap} as a validator: its error is the key (`required`, `amount`, `positive`, `belowSpent`). */
export function capValidator(
  spentNanoAiu: () => number,
): (control: AbstractControl<string>) => ValidationErrors | null {
  return (control) => {
    const checked = checkCap(control.value, spentNanoAiu());
    return "error" in checked ? { [checked.error]: true } : null;
  };
}

/**
 * "Change the budget" (wireframe `Dialogs`): the new total cap, which includes what is already spent, and a required
 * reason. A cap below what is spent is refused in the field, without a request. Raising the cap does not resume an
 * anchored voyage, and an active run keeps the cap it started with.
 */
@Component({
  selector: "ah-budget-dialog",
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    .spent {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .spent__row {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
    }
  `,
  template: `
    <ah-dialog
      heading="Change the budget"
      icon="info"
      [confirmLabel]="newCap() === null ? 'Set cap' : 'Set cap to ' + newCapText() + ' AIU'"
      busyLabel="Saving…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <div ahDialogLead class="spent">
        <div class="spent__row">
          <span class="ah-hint">Spent so far</span><b>{{ spent() }} of {{ cap() }} AIU</b>
        </div>
        <div class="ah-meter" aria-hidden="true"><i class="ah-meter__fill" [style.width.%]="percent()"></i></div>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ah-field
          label="New total cap"
          required
          unit="AIU"
          [hint]="capHint()"
          [errorMessages]="capMessages()"
          [errorText]="capServerError()"
        >
          <input ahInput formControlName="cap" inputmode="decimal" autocomplete="off" />
        </ah-field>
        <ah-field label="Reason" required [errorMessages]="reasonMessages" [errorText]="reasonServerError()">
          <textarea ahInput rows="2" formControlName="reason"></textarea>
        </ah-field>
      </form>
      @if (newCap() !== null) {
        <ah-banner variant="cost" [heading]="change()"
          >Billed to {{ owner() }}. Raising the budget doesn't resume an anchored voyage.</ah-banner
        >
      }
    </ah-dialog>
  `,
})
export class BudgetDialog {
  private readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();
  private readonly spentNano = computed(() => this.context.story()?.spentNanoAiu ?? 0);
  private readonly capNano = computed(() => this.context.story()?.budgetNanoAiu ?? 0);

  protected readonly form = new FormGroup({
    cap: new FormControl("", { nonNullable: true, validators: [capValidator(() => this.spentNano())] }),
    reason: new FormControl("", { nonNullable: true, validators: [requiredText, maxTrimmed(REASON_MAX)] }),
  });
  private readonly capText = toSignal(this.form.controls.cap.valueChanges, { initialValue: "" });

  protected readonly reasonMessages = REASON_MESSAGES;
  protected readonly spent = computed(() => formatAiu(this.spentNano()));
  protected readonly spentExact = computed(() => exactAiu(this.spentNano()));
  protected readonly cap = computed(() => formatCap(this.capNano(), 1));
  protected readonly percent = computed(() => budgetPercent(this.capNano(), this.spentNano()));
  protected readonly owner = computed(() => this.context.story()?.owner ?? "");
  protected readonly busy = this.context.commands.pending;
  protected readonly capHint = computed(
    () => `At least ${this.spentExact()} AIU, what's already spent. An active run keeps the cap it started with.`,
  );
  protected readonly capMessages = computed(() => ({
    required: "Enter the new total cap.",
    amount: "Enter an amount in AIU, like 40 or 25.5.",
    positive: "The cap must be more than 0 AIU.",
    belowSpent: `At least ${this.spentExact()} AIU, what's already spent.`,
  }));

  /** The cap typed, in nano-AIU, once it is valid; null before. */
  protected readonly newCap = computed(() => {
    const checked = checkCap(this.capText(), this.spentNano());
    return "cap" in checked ? checked.cap : null;
  });
  protected readonly newCapText = computed(() => {
    const cap = this.newCap();
    return cap === null ? "" : exactAiu(cap);
  });
  protected readonly change = computed(() => {
    const cap = this.newCap();
    return cap === null ? "" : capChange(cap, this.capNano());
  });
  protected readonly error = this.command.error;
  protected readonly capServerError = computed(() => this.command.fieldError("budgetNanoAiu"));
  protected readonly reasonServerError = computed(() => this.command.fieldError("reason"));

  protected async submit(): Promise<void> {
    // The spent amount may have grown since the field was checked: check again against the story as it is now.
    this.form.controls.cap.updateValueAndValidity();
    this.form.markAllAsTouched();
    const cap = this.newCap();
    if (this.form.invalid || cap === null) return;
    const story = this.command.settle(await this.context.setBudget(cap, this.form.controls.reason.value.trim()));
    if (story === null) return;
    const left = formatAiu(remainingNano(story.budgetNanoAiu, story.spentNanoAiu));
    this.toasts.show(`Budget set to ${exactAiu(story.budgetNanoAiu)} AIU. Up to ${left} AIU left to spend.`);
    this.ref.close(story);
  }
}
