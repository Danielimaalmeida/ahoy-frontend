import { Component, computed, inject } from '@angular/core';
import type { RefinementStatus, RuntimeStatus } from '@core/api/types';
import { actorLabel } from '@domain/identifiers';
import { isActiveRefinement } from '@domain/refinement';
import { workerStartup } from '@domain/worker-startup';
import { Button } from '@ui/button/button';
import { Markdown } from '@ui/markdown/markdown';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { CLOCK } from '@ui/pipes/clock';
import { WorkerStartupNotice } from '@ui/worker-startup/worker-startup';
import { VoyageContext } from '../context/voyage-context';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';
import {
  isReviewable,
  KnowledgeReviews,
  KNOWLEDGE_REVIEW_POLL_MS,
} from './knowledge-reviews';

/** The words for a knowledge review as it stands ("Waiting for a run slot", "Reviewed", "Failed"). */
export function knowledgeStateLabel(
  review: {
    readonly status: RefinementStatus;
    readonly cancelRequested: boolean;
    readonly runtimeStatus?: RuntimeStatus | null;
  },
  now = new Date()
): string {
  if (isActiveRefinement(review.status)) {
    if (review.cancelRequested) return 'Stopping the agent';
    const startup = workerStartup(review, now);
    if (startup !== null) return startup.heading;
    return review.status === 'queued'
      ? 'Waiting for a run slot'
      : 'The agent is reviewing it';
  }
  if (review.status === 'succeeded') return 'Reviewed';
  return review.status === 'cancelled' ? 'Cancelled' : 'Failed';
}

/**
 * The Knowledge panel of a done or halted voyage (design §5 of `ahoy-hosted`): the newest knowledge review, with the
 * agent's summary, the proposed lessons (`knowledge/lessons.md`), the proposed business rules
 * (`knowledge/business-context.md`, a done voyage only) and one patch of both for the content repository, as plain text.
 * Ahoy applies nothing: a person opens a pull request there with the patch. It offers to ask for a review, again, or to
 * cancel the one in progress.
 */
@Component({
  selector: 'ah-knowledge-panel',
  imports: [
    Button,
    Markdown,
    Panel,
    PanelBody,
    PanelHead,
    RelativePipe,
    WorkerStartupNotice,
  ],
  providers: [KnowledgeReviews],
  styleUrl: './knowledge-panel.scss',
  template: `
    @if (key(); as key) {
      <ah-panel>
        <ah-panel-head
          heading="Lessons and rules"
          [subtitle]="
            reviews.done()
              ? 'What this voyage taught, for the next ones'
              : 'What this halt taught, for the next voyages'
          "
        >
          @if (reviews.active()) {
            @if (!review()?.cancelRequested) {
              <button
                type="button"
                ahButton
                size="sm"
                ahPanelActions
                (click)="cancel()"
              >
                Cancel review
              </button>
            }
          } @else {
            <button
              type="button"
              ahButton="soft"
              size="sm"
              ahPanelActions
              (click)="ask(key)"
            >
              {{ review() === null ? 'Ask for lessons' : 'Review again' }}
            </button>
          }
        </ah-panel-head>
        <ah-panel-body>
          <div class="knowledge" aria-label="Knowledge review">
            @if (review(); as r) {
              <p>
                <b>{{ r.state }}</b>
                <span class="ah-muted">
                  · asked by {{ r.requestedBy }} ·
                  {{ r.createdAt | ahRelative }}</span
                >
              </p>
              @if (reviews.newest(); as newest) {
                <ah-worker-startup [run]="newest" />
              }
              @if (r.active) {
                <p class="ah-muted" role="status">
                  Checked again every {{ pollSeconds }} s.
                </p>
              } @else if (r.exitReason !== '') {
                <p>{{ r.exitReason }}</p>
              }
              @if (r.content !== '') {
                <ah-markdown [source]="r.content" />
              }
              @if (r.succeeded) {
                @if (r.patch === '') {
                  <p class="ah-muted">
                    The agent proposed no change to the content repository.
                  </p>
                } @else {
                  <p>
                    Nothing changes until a person opens a pull request in the
                    content repository with this patch (<code>git apply</code>);
                    the lessons and rules are approved there.
                  </p>
                  @if (r.lessons !== '') {
                    <details class="knowledge__file">
                      <summary>Proposed lessons (knowledge/lessons.md)</summary>
                      <pre>{{ r.lessons }}</pre>
                    </details>
                  }
                  @if (r.proposal !== '') {
                    <details class="knowledge__file">
                      <summary>
                        Proposed rules (knowledge/business-context.md)
                      </summary>
                      <pre>{{ r.proposal }}</pre>
                    </details>
                  }
                  <details class="knowledge__file">
                    <summary>Patch for the content repository</summary>
                    <pre>{{ r.patch }}</pre>
                  </details>
                }
              }
            } @else if (reviews.state() === 'error') {
              <p class="ah-muted">
                Could not read the knowledge reviews; you can still ask for one.
              </p>
            } @else {
              <p class="ah-muted">
                An agent can read what got in this voyage's way and propose
                @if (reviews.done()) {
                  business rules and lessons
                } @else {
                  lessons
                }
                that the next voyages in the same repositories read. It may
                spend AIU, not the voyage's.
              </p>
            }
          </div>
        </ah-panel-body>
      </ah-panel>
    }
  `,
})
export class KnowledgePanel {
  private readonly context = inject(VoyageContext);
  private readonly clock = inject(CLOCK);
  private readonly dialogs = inject(VoyageDialogs);
  protected readonly reviews = inject(KnowledgeReviews);
  protected readonly pollSeconds = KNOWLEDGE_REVIEW_POLL_MS / 1000;

  /** The voyage's key while it is done or halted; null hides the panel. */
  protected readonly key = computed(() => {
    const story = this.context.story();
    return story !== null && isReviewable(story) ? story.key : null;
  });

  /** The newest knowledge review as the panel shows it; null when there is none. */
  protected readonly review = computed(() => {
    const newest = this.reviews.newest();
    if (newest === null) return null;
    return {
      active: isActiveRefinement(newest.status),
      succeeded: newest.status === 'succeeded',
      cancelRequested: newest.cancelRequested,
      state: knowledgeStateLabel(newest, this.clock()),
      requestedBy: actorLabel(newest.requestedBy),
      createdAt: newest.createdAt,
      exitReason: newest.exitReason ?? '',
      content: newest.content ?? '',
      lessons: newest.lessons ?? '',
      proposal: newest.proposal ?? '',
      patch: newest.patch ?? '',
    };
  });

  protected ask(key: string): void {
    this.dialogs.reviewKnowledge({
      key,
      done: this.reviews.done(),
      reviews: this.reviews,
    });
  }

  protected cancel(): void {
    const key = this.context.story()?.key ?? '';
    const queued = this.reviews.newest()?.status === 'queued';
    this.dialogs.cancelKnowledgeReview({
      key,
      done: this.reviews.done(),
      reviews: this.reviews,
      queued,
    });
  }
}
