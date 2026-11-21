import { Component, input, model } from '@angular/core';
import {
  REPEAT_CHOICES,
  REPEAT_LABELS,
  type RepeatChoice,
} from '@domain/meetings';
import { Button } from '@ui/button/button';

/**
 * "Repeats": one button per choice (does not repeat, every week, every two weeks, other), the chosen one pressed. The
 * chosen one also shows a check mark, so it is not told apart by colour alone.
 */
@Component({
  selector: 'ah-repeat-picker',
  imports: [Button],
  styles: `
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    legend {
      font-weight: 600;
      font-size: 12.5px;
      padding: 0;
      margin-bottom: var(--space-1);
    }
    .choices {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    button[aria-pressed='true'] {
      background: var(--accent-soft);
      font-weight: 600;
    }
  `,
  template: `
    <fieldset>
      <legend>Repeats</legend>
      <div class="choices">
        @for (choice of choices; track choice) {
          @if (choice !== 'none' || showNone()) {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              [attr.aria-pressed]="value() === choice"
              (click)="value.set(choice)"
            >
              @if (value() === choice) {
                <span aria-hidden="true">✓ </span>
              }
              {{ labels[choice] }}
            </button>
          }
        }
      </div>
    </fieldset>
  `,
})
export class RepeatPicker {
  protected readonly choices = REPEAT_CHOICES;
  protected readonly labels = REPEAT_LABELS;
  /** The chosen way to repeat. */
  readonly value = model.required<RepeatChoice>();
  /** Whether "Does not repeat" is offered (a series that repeats stops from "Stop repeating" instead). */
  readonly showNone = input(true);
}
