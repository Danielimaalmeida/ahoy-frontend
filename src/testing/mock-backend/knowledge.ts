/**
 * The mock's knowledge reviews (`/stories/{key}/knowledge-reviews`): a refinement desk of the `knowledge` kind, plus the
 * files each succeeded review proposes. As `knowledgeOutputsFor` of `ahoy-hosted` decides, a done story gets the
 * business rules and the lessons and a halted one the lessons only, fixed when the review is asked for. Fictional
 * text, 0 AIU of anything real.
 */
import type { KnowledgeReview, KnowledgeReviewRequest } from '@core/api/types';
import type { MockClock } from './clock';
import { knowledgeFiles, knowledgeMarkdown } from './content';
import { RefinementDesk } from './refinements';
import type { SimulationTiming } from './simulator';

/** The knowledge reviews of a mock world, newest first per story key. */
export class KnowledgeDesk {
  private readonly desk: RefinementDesk;
  /** Whether each review (by id) may propose business rules, as the story stood when it was asked for. */
  private readonly rulesOf = new Map<string, boolean>();

  constructor(clock: MockClock, timing: SimulationTiming) {
    this.desk = new RefinementDesk(clock, timing, 'knowledge', (r) =>
      knowledgeMarkdown(r.key, this.rulesOf.get(r.id) ?? false, r.notes)
    );
  }

  /** Every knowledge review of one story, newest first, with the proposed files of those that succeeded. */
  of(key: string): KnowledgeReview[] {
    return this.desk.of(key).map((r) => this.withFiles(r.id, r));
  }

  /** Queues a review; `rules` is true for a done story. `409 invalid_state` when one is already in progress. */
  request(
    key: string,
    actor: string,
    body: KnowledgeReviewRequest,
    rules: boolean
  ): KnowledgeReview {
    const queued = this.desk.request(key, actor, body);
    this.rulesOf.set(queued.id, rules);
    return this.withFiles(queued.id, queued);
  }

  /** Cancels the story's review in progress. */
  cancel(key: string, actor: string, reason: string): KnowledgeReview {
    const cancelled = this.desk.cancel(key, actor, reason);
    return this.withFiles(cancelled.id, cancelled);
  }

  /** Cancels every timer (the server is closing or being reset). */
  stopAll(): void {
    this.desk.stopAll();
  }

  private withFiles(
    id: string,
    review: Omit<KnowledgeReview, 'proposal' | 'lessons' | 'patch'>
  ): KnowledgeReview {
    if (review.status !== 'succeeded')
      return { ...review, proposal: null, lessons: null, patch: null };
    return {
      ...review,
      ...knowledgeFiles(review.key, this.rulesOf.get(id) ?? false),
    };
  }
}
