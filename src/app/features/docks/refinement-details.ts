import { Component, computed, input, output } from '@angular/core';
import type { Refinement, RefinementSummary } from '@core/api/types';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { Markdown } from '@ui/markdown/markdown';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api } from '@ui/table/table';
import { isActiveRefinement, refinementStateLabel } from '@domain/refinement';
import { REFINEMENT_POLL_MS } from './backlog-refinements';

/**
 * The detail row of a refined backlog item: the newest refinement's state, who asked for it, what it spent and why it
 * ended, with Cancel refinement while it is in progress and Refine again once it ended. A succeeded refinement shows the
 * agent's Markdown, which is untrusted text, through `ah-markdown`.
 */
@Component({
  selector: 'ah-refinement-details',
  imports: [Api, Banner, Button, Markdown, RelativePipe, Skeleton],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      padding: 6px 0 10px;
    }
    .refinement__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px 24px;
    }
    .refinement__facts {
      display: flex;
      flex: 1 1 auto;
      flex-wrap: wrap;
      gap: 8px 24px;
      margin: 0;
    }
    .refinement__facts dt {
      color: var(--ink-muted);
      font-size: 11px;
      font-weight: 600;
    }
    .refinement__facts dd {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    .refinement__reason {
      flex-basis: 100%;
    }
    .refinement__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-left: auto;
    }
    .refinement__content {
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
  `,
  template: `
    <div class="refinement__head">
      <dl class="refinement__facts">
        <div>
          <dt>State</dt>
          <dd>
            <span class="ah-tag">{{ label() }}</span
            >&ngsp;
            <span ahApi>{{ summary().status }}</span>
          </dd>
        </div>
        <div>
          <dt>Requested by</dt>
          <dd>
            {{ summary().requestedBy }} ·
            {{ summary().createdAt | ahRelative }}
          </dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd>{{ spent() }} of {{ cap() }} AIU</dd>
        </div>
        @if (summary().notes; as notes) {
          <div class="refinement__reason">
            <dt>Notes</dt>
            <dd>{{ notes }}</dd>
          </div>
        }
        @if (summary().exitReason; as reason) {
          <div class="refinement__reason">
            <dt>Exit reason</dt>
            <dd>{{ reason }}</dd>
          </div>
        }
      </dl>
      <div class="refinement__actions">
        @if (active()) {
          @if (!summary().cancelRequested) {
            <button
              ahButton
              size="sm"
              type="button"
              (click)="cancelRefinement.emit()"
            >
              Cancel refinement
            </button>
          }
        } @else {
          <button
            ahButton="soft"
            size="sm"
            type="button"
            (click)="refineAgain.emit()"
          >
            Refine again
          </button>
        }
      </div>
    </div>
    @if (active()) {
      <span class="ah-muted" role="status">
        @if (summary().cancelRequested) {
          Stopping the agent; checked again every {{ pollSeconds }} s.
        } @else if (summary().status === 'queued') {
          Waiting for a run slot; checked again every {{ pollSeconds }} s.
        } @else {
          The agent is refining it; checked again every {{ pollSeconds }} s.
        }
      </span>
    }
    @if (summary().status === 'succeeded') {
      <div class="refinement__content">
        @if (refinement()?.content; as content) {
          <ah-markdown [source]="content" />
        } @else if (failed()) {
          <ah-banner variant="error" heading="Could not read the refinement">
            <button ahButton size="sm" type="button" (click)="retry.emit()">
              Try again
            </button>
          </ah-banner>
        } @else {
          <ah-skeleton width="60%" />
        }
      </div>
    } @else if (failed()) {
      <ah-banner
        variant="error"
        heading="Could not read this item's refinements"
      >
        What is shown may be out of date.
        <button ahButton size="sm" type="button" (click)="retry.emit()">
          Try again
        </button>
      </ah-banner>
    }
  `,
})
export class RefinementDetails {
  /** The newest refinement, as the backlog's list shows it. */
  readonly summary = input.required<RefinementSummary>();
  /** The same refinement with its Markdown, once the item's refinements were read; null before. */
  readonly refinement = input<Refinement | null>(null);
  /** Whether the last read of the item's refinements failed. */
  readonly failed = input(false);

  /** The person asked to cancel the refinement in progress. */
  readonly cancelRefinement = output();
  /** The person asked for a new refinement. */
  readonly refineAgain = output();
  /** The person asked to read the item's refinements again. */
  readonly retry = output();

  protected readonly pollSeconds = REFINEMENT_POLL_MS / 1000;
  protected readonly label = computed(() =>
    refinementStateLabel(this.summary())
  );
  protected readonly active = computed(() =>
    isActiveRefinement(this.summary().status)
  );
  protected readonly spent = computed(() =>
    formatCap(this.summary().usage.nanoAiu, 2)
  );
  protected readonly cap = computed(() =>
    formatCap(this.summary().budgetNanoAiu, 2)
  );
}
