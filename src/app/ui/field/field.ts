import { NgTemplateOutlet } from '@angular/common';
import type { AfterContentInit } from '@angular/core';
import {
  Component,
  DestroyRef,
  Directive,
  HostAttributeToken,
  booleanAttribute,
  computed,
  contentChild,
  inject,
  input,
  signal,
} from '@angular/core';
import type { ValidationErrors } from '@angular/forms';
import { NgControl } from '@angular/forms';

let nextFieldId = 0;

/** What a field shows for an error key when the form gives no message and the validator gave no text. */
const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  required: 'This is required.',
};
const FALLBACK_MESSAGE = 'Check this value.';

/** The form state a field needs from its control. */
export interface ControlState {
  readonly invalid: boolean;
  readonly touched: boolean;
  readonly dirty: boolean;
  readonly errors: ValidationErrors | null;
}

/**
 * The message for the first error of a control: the form's own message for that key, else the validator's text when
 * it returned a string, else a generic one.
 */
export function firstErrorMessage(
  errors: ValidationErrors | null,
  messages: Readonly<Record<string, string>>
): string {
  const key = errors === null ? undefined : Object.keys(errors)[0];
  if (errors === null || key === undefined) return '';
  const own = messages[key] ?? DEFAULT_MESSAGES[key];
  if (own !== undefined) return own;
  const value: unknown = errors[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value
    : FALLBACK_MESSAGE;
}

/**
 * Marks the input, select or textarea inside an `ah-field`: adds `ah-input` (and `ah-input--mono` for keys and model
 * ids), and receives the field's id, `aria-invalid`, `aria-describedby` and `aria-required`.
 */
@Directive({
  selector: 'input[ahInput], textarea[ahInput], select[ahInput]',
  host: {
    class: 'ah-input',
    '[class.ah-input--mono]': 'mono()',
    '[id]': 'id',
    '[attr.aria-invalid]': "field?.error() ? 'true' : null",
    '[attr.aria-describedby]': 'field?.describedBy() ?? null',
    '[attr.aria-required]': "field?.required() ? 'true' : null",
  },
})
export class FieldControl implements AfterContentInit {
  /** Monospace text, for Jira keys and model ids. */
  readonly mono = input(false, { transform: booleanAttribute });
  /** The element's id: its own `id` attribute, or a generated one. */
  readonly id =
    inject(new HostAttributeToken('id'), { optional: true }) ??
    `ah-field-${nextFieldId++}-control`;

  protected readonly field = inject(Field, { optional: true });
  private readonly ngControl = inject(NgControl, {
    self: true,
    optional: true,
  });
  private readonly destroyRef = inject(DestroyRef);
  private readonly current = signal<ControlState | null>(null);

  /** The control's state, or `null` without a form control. Kept current through the control's events. */
  readonly state = this.current.asReadonly();

  ngAfterContentInit(): void {
    // Reactive Forms sets `control` while binding, so it is only known once the element's directives have started.
    const control = this.ngControl?.control;
    if (!control) return;
    const read = (): void =>
      this.current.set({
        invalid: control.invalid,
        touched: control.touched,
        dirty: control.dirty,
        errors: control.errors,
      });
    read();
    const subscription = control.events.subscribe(read);
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }
}

/**
 * A labelled form control (`ah-field`) with optional hint, unit suffix and error. Project one `ahInput` element; the
 * field links the label, hint and error to it and shows the first error of its form control once it is touched or
 * changed. `errorText` (a server error, for example) shows regardless.
 *
 * ```html
 * <ah-field label="Total budget" required hint="A hard cap for every run." unit="AIU" [errorMessages]="{ min: '…' }">
 *   <input ahInput formControlName="budget" inputmode="decimal" />
 * </ah-field>
 * ```
 */
@Component({
  selector: 'ah-field',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #controlSlot><ng-content /></ng-template>
    <div class="ah-field">
      <label class="ah-label" [attr.for]="control()?.id ?? null"
        >{{ label() }}
        @if (required()) {
          <span class="ah-req" aria-hidden="true">*</span>
        }
        @if (optional()) {
          <span class="ah-hint ah-field__optional">(optional)</span>
        }
      </label>
      @if (unit()) {
        <div class="ah-suffix">
          <ng-container [ngTemplateOutlet]="controlSlot" />
          <span class="ah-suffix__unit" [id]="unitId">{{ unit() }}</span>
        </div>
      } @else {
        <ng-container [ngTemplateOutlet]="controlSlot" />
      }
      @if (error()) {
        <span class="ah-field__error" [id]="errorId">{{ error() }}</span>
      }
      @if (hint()) {
        <span class="ah-hint" [id]="hintId">{{ hint() }}</span>
      }
    </div>
  `,
})
export class Field {
  /** The label above the control. */
  readonly label = input.required<string>();
  /** Shows the required asterisk and sets `aria-required` on the control. */
  readonly required = input(false, { transform: booleanAttribute });
  /** Shows "(optional)" after the label. */
  readonly optional = input(false, { transform: booleanAttribute });
  /** What the value does, under the control. */
  readonly hint = input('');
  /** A unit shown inside the control on the right, such as AIU. */
  readonly unit = input('');
  /** An error to show whatever the control's state, such as one from the server. */
  readonly errorText = input('');
  /** Messages by validator key (`required`, `min`, …) for the control's errors. */
  readonly errorMessages = input<Readonly<Record<string, string>>>({});

  private readonly baseId = `ah-field-${nextFieldId++}`;
  protected readonly hintId = `${this.baseId}-hint`;
  protected readonly errorId = `${this.baseId}-error`;
  protected readonly unitId = `${this.baseId}-unit`;
  protected readonly control = contentChild(FieldControl);

  /** The error on show: `errorText`, else the first error of a touched or changed invalid control, else "". */
  readonly error = computed(() => {
    if (this.errorText()) return this.errorText();
    const state = this.control()?.state();
    if (!state?.invalid || !(state.touched || state.dirty)) return '';
    return firstErrorMessage(state.errors, this.errorMessages());
  });

  /** The ids that describe the control: the error, the unit and the hint, as far as they are shown. */
  readonly describedBy = computed(() => {
    const ids = [
      ...(this.error() ? [this.errorId] : []),
      ...(this.unit() ? [this.unitId] : []),
      ...(this.hint() ? [this.hintId] : []),
    ];
    return ids.length > 0 ? ids.join(' ') : null;
  });
}
