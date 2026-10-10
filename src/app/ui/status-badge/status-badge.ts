import { Component, booleanAttribute, computed, input } from '@angular/core';
import type { StatusPresentation } from '@domain/status';
import { statusPresentation } from '@domain/status';
import type { StoryStatus } from '@domain/types';

/** What the badge shows for a status the vocabulary does not know: its own word, in the neutral colour. */
function neutral(status: string): StatusPresentation {
  return { label: status, modifier: 'queued', api: status };
}

/**
 * A voyage's status in user-friendly words ("Needs decision", "Halted"), with the API word beside it when `showApi` is set.
 * The label and colour come from `statusPresentation`, so the vocabulary lives in one place. Use the label alone in
 * lists; on a voyage header add `showApi`, and `detail` for the gate or halt reason that follows the API word.
 *
 * ```html
 * <ah-status-badge [status]="story.status" [phase]="story.phase" showApi detail="plan_accepted" />
 * ```
 */
@Component({
  selector: 'ah-status-badge',
  template: `
    <span [class]="'ah-badge ah-badge--' + presentation().modifier"
      ><i class="ah-badge__dot"></i>{{ presentation().label }}</span
    >
    @if (showApi()) {
      <span class="ah-api">{{ apiText() }}</span>
    }
  `,
})
export class StatusBadge {
  /** The API status. */
  readonly status = input.required<StoryStatus>();
  /** The API phase; it tells a terminal voyage that is Docked (`done`) from one that is Aground (`blocked`). */
  readonly phase = input<string | null>(null);
  /** Also show the API status word, in `ah-api`, beside the badge: "Your orders" then `awaiting_decision`. */
  readonly showApi = input(false, { transform: booleanAttribute });
  /** Another API word to show after the status word, such as the gate (`plan_accepted`) or the halt reason. */
  readonly detail = input('');

  protected readonly presentation = computed((): StatusPresentation => {
    const status = this.status();
    // The API client refuses a status it does not know, so this is only a guard: an unknown word stays neutral and is
    // shown as it came, never as a verdict.
    return (
      statusPresentation(
        status,
        this.phase() === 'blocked' ? 'blocked' : null
      ) ?? neutral(status)
    );
  });
  protected readonly apiText = computed(() => {
    const api = this.presentation().api;
    return this.detail() ? `${api} · ${this.detail()}` : api;
  });
}
