import { Component } from "@angular/core";
import type { AbstractControl, ValidationErrors } from "@angular/forms";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Field, FieldControl } from "@ui/field/field";

/** A gallery-only stand-in for the budget rule (lane 4A owns the real one). */
function atLeastSpent(c: AbstractControl<string>): ValidationErrors | null {
  return Number(c.value) >= 12.4 ? null : { spent: "At least 12.4 AIU, what's already spent." };
}

/** Gallery: the Field preview, driven by a typed reactive form; the cap starts touched so its error shows. */
@Component({
  selector: "ah-kit-field",
  imports: [Field, FieldControl, ReactiveFormsModule],
  template: `
    <form class="kit-stack" [formGroup]="form">
      <div class="kit-grid-2">
        <ah-field label="Jira key" required hint="Like PROJ-123. One voyage per key.">
          <input ahInput mono formControlName="key" />
        </ah-field>
        <ah-field label="Total budget" required hint="You can raise it later." unit="AIU">
          <input ahInput formControlName="budget" inputmode="decimal" />
        </ah-field>
        <ah-field label="New total cap" required unit="AIU">
          <input ahInput formControlName="cap" inputmode="decimal" />
        </ah-field>
        <ah-field label="Reasoning effort">
          <select ahInput formControlName="effort">
            <option value="">Default (medium)</option>
            <option value="low">low</option>
            <option value="high">high</option>
          </select>
        </ah-field>
      </div>
      <ah-field label="Reason" optional>
        <textarea ahInput formControlName="reason"></textarea>
      </ah-field>
    </form>
  `,
})
export class KitField {
  protected readonly form = new FormGroup({
    key: new FormControl("PROJ-145", { nonNullable: true, validators: [Validators.required] }),
    budget: new FormControl("25", { nonNullable: true, validators: [Validators.required] }),
    cap: new FormControl("10", { nonNullable: true, validators: [Validators.required, atLeastSpent] }),
    effort: new FormControl("", { nonNullable: true }),
    reason: new FormControl("Switched planning to a model the account can use.", { nonNullable: true }),
  });

  constructor() {
    this.form.controls.cap.markAsTouched();
  }
}
