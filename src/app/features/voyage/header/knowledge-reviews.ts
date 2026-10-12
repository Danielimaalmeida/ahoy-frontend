import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { isInvalidState, type ApiResult } from '@core/api/api-error';
import type { KnowledgeReview, Story } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import { isActiveRefinement } from '@domain/refinement';
import { VoyageContext } from '../context/voyage-context';

/** How often a knowledge review in progress is read again: it sends no events. */
export const KNOWLEDGE_REVIEW_POLL_MS = 5_000;

/** Whether a story may have a knowledge review: it is done (rules and lessons) or halted (lessons only). */
export function isReviewable(
  story: Pick<Story, 'status' | 'phase'> | null
): boolean {
  return (
    story?.status === 'halted' ||
    (story?.status === 'terminal' && story.phase === 'done')
  );
}

/**
 * The knowledge reviews of the done or halted voyage on screen (`listKnowledgeReviews`, design §5 of `ahoy-hosted`),
 * provided by the Knowledge panel. As `AgentDiagnoses`, they are read when the voyage becomes reviewable and again when
 * its version moves; while the newest is queued or running the list is read again every
 * {@link KNOWLEDGE_REVIEW_POLL_MS}, and nothing is polled otherwise. A request or a cancel shows its answer at once, and
 * a read that began before it and answers after it does not take that answer away. A failed read keeps what was read.
 */
@Injectable()
export class KnowledgeReviews {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);
  private readonly clock = inject(CLOCK);

  private readonly read = signal<{
    readonly key: string;
    readonly items: readonly KnowledgeReview[];
  } | null>(null);
  private readonly stateSignal = signal<'loading' | 'ready' | 'error'>(
    'loading'
  );
  private timer: Timer | null = null;
  private disposed = false;
  /** Counts the reads and the answers to a request or a cancel, so that an answer a later one replaced is dropped. */
  private sequence = 0;

  /** The reviewable voyage on screen as its key and version; equal while only other fields of the story change. */
  private readonly target = computed(
    () => {
      const story = this.context.story();
      return story !== null && isReviewable(story)
        ? { key: story.key, version: story.version }
        : null;
    },
    { equal: (a, b) => a?.key === b?.key && a?.version === b?.version }
  );

  /** Whether the reviews are in hand; `error` leaves the panel without them, still offering to ask. */
  readonly state = this.stateSignal.asReadonly();

  /** Whether the voyage on screen is done, so that a review may propose business rules as well as lessons. */
  readonly done = computed(() => {
    const story = this.context.story();
    return story?.status === 'terminal' && story.phase === 'done';
  });

  /** The newest knowledge review of the voyage on screen while it is reviewable, with its files once it succeeded. */
  readonly newest = computed((): KnowledgeReview | null => {
    const story = this.context.story();
    const read = this.read();
    return isReviewable(story) && read?.key === story?.key
      ? (read?.items[0] ?? null)
      : null;
  });

  /** Whether the newest is still in progress: queued for a run slot, or running. */
  readonly active = computed(() => {
    const newest = this.newest();
    return newest !== null && isActiveRefinement(newest.status);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
    effect(() => {
      const target = this.target();
      if (target === null) {
        untracked(() => this.stopPolling());
        return;
      }
      untracked(() => void this.load(target.key));
    });
  }

  /**
   * Asks the knowledge agent to review the voyage (`confirmSpend: true`); on success the panel shows it queued at once.
   * Empty notes and a missing limit are left out of the request. A `409 invalid_state` (one is already in progress, or
   * the voyage is neither done nor halted any more) reads the voyage's reviews again.
   */
  async request(
    notes: string,
    budgetNanoAiu: number | null
  ): Promise<ApiResult<KnowledgeReview>> {
    const key = this.context.story()?.key ?? '';
    const result = await this.api.requestKnowledgeReview(key, {
      confirmSpend: true,
      ...(notes !== '' ? { notes } : {}),
      ...(budgetNanoAiu !== null ? { budgetNanoAiu } : {}),
    });
    if (this.disposed) return result;
    if (result.ok) this.accept(key, result.value);
    else if (isInvalidState(result.error)) void this.load(key);
    return result;
  }

  /** Stops the voyage's knowledge review in progress; on success the panel shows it cancelled, or being cancelled. */
  async cancel(reason: string): Promise<ApiResult<KnowledgeReview>> {
    const key = this.context.story()?.key ?? '';
    const result = await this.api.cancelKnowledgeReview(key, { reason });
    if (this.disposed) return result;
    if (result.ok) this.accept(key, result.value);
    else if (isInvalidState(result.error)) void this.load(key);
    return result;
  }

  /** Reads the voyage's reviews, newest first; an answer a later read or an accepted answer replaced is dropped. */
  private async load(key: string): Promise<void> {
    const sequence = ++this.sequence;
    const result = await this.api.listKnowledgeReviews(key);
    if (this.disposed || sequence !== this.sequence) return;
    if (result.ok) {
      this.read.set({ key, items: result.value.items });
      this.stateSignal.set('ready');
    } else if (this.read()?.key !== key) {
      this.stateSignal.set('error');
    }
    this.schedule(key);
  }

  /** Takes a review the API answered as the newest of its voyage. */
  private accept(key: string, review: KnowledgeReview): void {
    this.sequence += 1;
    const items = this.read()?.key === key ? (this.read()?.items ?? []) : [];
    this.read.set({
      key,
      items: [review, ...items.filter((r) => r.id !== review.id)],
    });
    this.stateSignal.set('ready');
    this.schedule(key);
  }

  /** Reads again in {@link KNOWLEDGE_REVIEW_POLL_MS} while the newest is in progress, never twice at once. */
  private schedule(key: string): void {
    if (this.disposed) return;
    if (!this.active()) {
      this.stopPolling();
      return;
    }
    if (this.timer !== null) return;
    this.timer = this.clock.schedule(KNOWLEDGE_REVIEW_POLL_MS, () => {
      this.timer = null;
      void this.load(key);
    });
  }

  private stopPolling(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  private dispose(): void {
    this.disposed = true;
    this.stopPolling();
  }
}
