import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { StoryPlanFit } from '@core/api/types';
import { planFitPresentation } from '@domain/harness-fit';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { VoyageContext } from '../../context/voyage-context';

/** The phase where a person decides on the plan, and so the one where its fit is shown. */
const PLAN_REVIEW = 'plan_review';

/**
 * "Harness fit" (design §4 of `ahoy-hosted`): whether the plan suits the harness, by fixed rules over its work packages
 * and criteria (`getStoryPlanFit`), for the person deciding `plan_accepted`. It is read in plan review and again when
 * the voyage's version moves there; it advises and never blocks the decision. A failed read shows nothing.
 */
@Component({
  selector: 'ah-plan-fit',
  imports: [Panel, PanelBody, PanelHead],
  styles: `
    :host {
      display: contents;
    }
    .fit__verdict {
      margin: 0 0 var(--space-2);
      font-weight: 600;
    }
    .fit__verdict--good {
      color: var(--status-done-fg);
    }
    .fit__verdict--warn {
      color: var(--status-input-fg);
    }
    .fit__verdict--bad {
      color: var(--status-halted-fg);
    }
    .fit__reasons {
      margin: 0 0 var(--space-2);
      padding-left: var(--space-4);
    }
  `,
  template: `
    @if (fit(); as f) {
      <ah-panel>
        <ah-panel-head heading="Harness fit" />
        <ah-panel-body>
          <p class="fit__verdict fit__verdict--{{ presentation().tone }}">
            {{ presentation().label }}
          </p>
          @if (f.reasons.length > 0) {
            <ul class="fit__reasons">
              @for (r of f.reasons; track r.code) {
                <li>{{ r.message }}</li>
              }
            </ul>
          } @else {
            <p class="ah-muted">
              Nothing in the plan works against the harness.
            </p>
          }
          <p class="ah-hint">
            {{ f.repositories }}
            {{ f.repositories === 1 ? 'repository' : 'repositories' }} ·
            {{ f.packages }} work
            {{ f.packages === 1 ? 'package' : 'packages' }} ·
            {{ f.longestChain }} in a row at most. Fixed rules; they advise and
            do not block your decision.
          </p>
        </ah-panel-body>
      </ah-panel>
    }
  `,
})
export class PlanFitPanel {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);
  private readonly read = signal<StoryPlanFit | null>(null);
  private disposed = false;
  /** Counts reads, so that the answer to a read that was replaced meanwhile is dropped. */
  private generation = 0;

  /** The voyage on screen as its key and version while it is in plan review; equal while other fields change. */
  private readonly review = computed(
    () => {
      const story = this.context.story();
      return story?.phase === PLAN_REVIEW
        ? { key: story.key, version: story.version }
        : null;
    },
    { equal: (a, b) => a?.key === b?.key && a?.version === b?.version }
  );

  /** The plan's fit while the voyage on screen is in plan review; null before it is read or before there is a plan. */
  protected readonly fit = computed(() => {
    const story = this.context.story();
    const read = this.read();
    return story?.phase === PLAN_REVIEW && read?.key === story.key
      ? read.fit
      : null;
  });

  protected readonly presentation = computed(() =>
    planFitPresentation(this.fit()?.verdict ?? 'fits')
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.disposed = true));
    effect(() => {
      const review = this.review();
      if (review === null) return;
      untracked(() => void this.load(review.key));
    });
  }

  private async load(key: string): Promise<void> {
    const generation = ++this.generation;
    const result = await this.api.getStoryPlanFit(key);
    if (this.disposed || generation !== this.generation || !result.ok) return;
    this.read.set(result.value);
  }
}
