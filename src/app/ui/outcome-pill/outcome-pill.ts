import { Component, computed, input } from '@angular/core';
import { outcomePresentation } from '@domain/outcome';

/**
 * A small pill for an automated gate verdict, a human decision or a run's status. It shows the API word itself, with no
 * dot (these are audit records, compared with logs); the colour only groups them. The word comes from `value`, the
 * colour from `outcomePresentation`, and a word the vocabulary does not know stays neutral.
 *
 * ```html
 * <ah-outcome-pill value="send_back" />
 * ```
 */
@Component({
  selector: 'ah-outcome-pill',
  host: { '[class]': 'classes()' },
  template: `{{ presentation().label }}`,
})
export class OutcomePill {
  /** The API word: a gate outcome (`pass`, `send_back`…) or a run status (`running`, `failed`…). */
  readonly value = input.required<string>();

  protected readonly presentation = computed(() =>
    outcomePresentation(this.value())
  );
  protected readonly classes = computed(
    () => `ah-badge ah-badge--${this.presentation().modifier}`
  );
}
