import type { ControlValueAccessor } from '@angular/forms';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';

/** One card: the choice and what happens next if it is picked. */
export interface ChoiceOption<T> {
  readonly value: T;
  /** The choice, as a verb ("Approve", "Send back"). */
  readonly title: string;
  /** The consequence ("The voyage moves on to implementation."). */
  readonly description: string;
  readonly disabled?: boolean;
}

let nextGroupId = 0;

/** Keys that move the selection, and in which direction. */
const ARROWS: Readonly<Record<string, 1 | -1>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/**
 * Radio choices drawn as cards (`ah-choice`), for decisions whose consequence must be read: the human gate's
 * Approve / Send back / Reject. A `ControlValueAccessor`: bind it with `formControlName` or `[formControl]`.
 * The checked card gets the accent ring; arrow keys move the selection to the next enabled card, wrapping around.
 *
 * ```html
 * <ah-choice-card-group label="Your decision" [options]="decisions" formControlName="decision" />
 * ```
 */
@Component({
  selector: 'ah-choice-card-group',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ChoiceCardGroup),
      multi: true,
    },
  ],
  styles: `
    :host {
      display: block;
    }
    .ah-choice-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .ah-choice:has(input:disabled) {
      cursor: default;
      color: var(--ink-disabled);
    }
  `,
  template: `
    <div
      class="ah-choice-group"
      role="radiogroup"
      [attr.aria-label]="label() || null"
    >
      @for (option of options(); track $index) {
        <label class="ah-choice">
          <input
            type="radio"
            [name]="name"
            [checked]="option.value === value()"
            [disabled]="disabled() || !!option.disabled"
            (change)="select(option.value)"
            (keydown)="onKeydown($event)"
            (blur)="touched()"
          />
          <span
            ><b>{{ option.title }}</b
            ><span class="ah-choice__desc">{{ option.description }}</span></span
          >
        </label>
      }
    </div>
  `,
})
export class ChoiceCardGroup<T> implements ControlValueAccessor {
  /** The cards, in order. */
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  /** The group's accessible name ("Your decision"). */
  readonly label = input('');

  protected readonly name = `ah-choice-${nextGroupId++}`;
  protected readonly value = signal<T | null>(null);
  protected readonly disabled = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onChange: (value: T) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** Part of `ControlValueAccessor`. */
  writeValue(value: T | null): void {
    this.value.set(value);
  }

  /** Part of `ControlValueAccessor`. */
  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }

  /** Part of `ControlValueAccessor`. */
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /** Part of `ControlValueAccessor`. */
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected select(value: T): void {
    this.value.set(value);
    this.onChange(value);
  }

  protected touched(): void {
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = ARROWS[event.key];
    if (step === undefined || this.disabled()) return;
    const options = this.options();
    const enabled = options.flatMap((o, index) => (o.disabled ? [] : [index]));
    if (enabled.length === 0) return;
    event.preventDefault();
    const current = options.findIndex((o) => o.value === this.value());
    const at = enabled.indexOf(current);
    const next =
      at < 0
        ? step === 1
          ? enabled[0]
          : enabled[enabled.length - 1]
        : enabled[(at + step + enabled.length) % enabled.length];
    const option = next === undefined ? undefined : options[next];
    if (option === undefined || next === undefined) return;
    this.select(option.value);
    this.host.nativeElement
      .querySelectorAll<HTMLInputElement>('input[type=radio]')
      [next]?.focus();
  }
}
