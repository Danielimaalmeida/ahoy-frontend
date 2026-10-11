import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { isInvalidState, type ApiResult } from '@core/api/api-error';
import type { Refinement, RefinementSummary } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import { isActiveRefinement } from '@domain/refinement';

/** How often refinements in progress are read again: they send no events. */
export const REFINEMENT_POLL_MS = 5_000;

/** What the backlog has read of one item's refinements: every one, newest first, once read. */
export interface RefinementHistory {
  /** Null until the first read answered. */
  readonly items: readonly Refinement[] | null;
  /** Whether the last read failed; the items read before stay. */
  readonly failed: boolean;
}

/**
 * The refinements the Backlog shows (provided by the Docks component): the newest of every refined item, for the row's
 * state, and the full history of the rows a person opened. Refinements send no events, so while one is in progress the
 * list is read again every {@link REFINEMENT_POLL_MS}, with the history of each open row whose newest refinement moved
 * on; nothing is polled otherwise.
 */
@Injectable()
export class BacklogRefinements {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);

  private readonly latestByKey = signal<ReadonlyMap<string, RefinementSummary>>(
    new Map()
  );
  private readonly historyByKey = signal<
    ReadonlyMap<string, RefinementHistory>
  >(new Map());
  private readonly openKeys = signal<ReadonlySet<string>>(new Set());
  private readonly statusSignal = signal<'loading' | 'ready' | 'error'>(
    'loading'
  );
  private timer: Timer | null = null;
  private disposed = false;
  /**
   * Counts the refinements the API answered to a request or a cancel ({@link accept}). A read that began before one was
   * answered may not have seen it, so its answer is read again instead of replacing what the row shows.
   */
  private accepted = 0;

  /** Whether the list of refinements is in hand; `error` leaves the rows without a refinement state. */
  readonly status = this.statusSignal.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  /** The newest refinement of an item, or null when it was never refined (or the list is not read yet). */
  latest(key: string): RefinementSummary | null {
    return this.latestByKey().get(key) ?? null;
  }

  /** What has been read of an item's refinements, or null before its row was first opened. */
  history(key: string): RefinementHistory | null {
    return this.historyByKey().get(key) ?? null;
  }

  /** The newest refinement of an item with its Markdown, once its history has been read; null before. */
  newest(key: string): Refinement | null {
    const latest = this.latest(key);
    const newest = this.history(key)?.items?.[0];
    return latest !== null && newest?.id === latest.id ? newest : null;
  }

  /** Whether an item's refinement row is open. */
  isOpen(key: string): boolean {
    return this.openKeys().has(key);
  }

  /**
   * Reads the newest refinement of every item, then the history of each open row whose newest refinement changed. A
   * failure keeps what was read before. An answer that began before a request or a cancel was answered is read again:
   * it may not hold that refinement, and taking it would drop the refinement from the row and stop its polling.
   */
  async load(): Promise<void> {
    const accepted = this.accepted;
    const result = await this.api.listRefinements();
    if (this.disposed) return;
    if (accepted !== this.accepted) return this.load();
    if (result.ok) {
      this.latestByKey.set(new Map(result.value.map((r) => [r.key, r])));
      this.statusSignal.set('ready');
      await Promise.all(
        [...this.openKeys()]
          .filter((key) => this.moved(key))
          .map((key) => this.readHistory(key))
      );
    } else if (this.statusSignal() !== 'ready') {
      this.statusSignal.set('error');
    }
    this.schedule();
  }

  /** Opens or closes an item's refinement row; opening it reads its history. */
  toggle(key: string): void {
    if (this.isOpen(key)) {
      this.setOpen(key, false);
      return;
    }
    this.setOpen(key, true);
    void this.readHistory(key);
  }

  /**
   * Reads an item's refinements, newest first, and takes the newest as its row's state. Like {@link load}, an answer that
   * began before a request or a cancel was answered is read again.
   */
  async readHistory(key: string): Promise<void> {
    const accepted = this.accepted;
    const result = await this.api.getRefinements(key);
    if (this.disposed) return;
    if (accepted !== this.accepted) return this.readHistory(key);
    if (!result.ok) {
      this.setHistory(key, {
        items: this.history(key)?.items ?? null,
        failed: true,
      });
      return;
    }
    this.setHistory(key, { items: result.value.items, failed: false });
    const newest = result.value.items[0];
    if (newest !== undefined) this.setLatest(newest);
    this.schedule();
  }

  /**
   * Asks for a refinement (`confirmSpend: true`); on success the row shows it at once, open. Empty notes and a missing
   * cap are left out of the request. A `409 invalid_state` (one is already in progress) reads the item again.
   */
  async request(
    key: string,
    notes: string,
    budgetNanoAiu: number | null
  ): Promise<ApiResult<Refinement>> {
    const result = await this.api.requestRefinement(key, {
      confirmSpend: true,
      ...(notes !== '' ? { notes } : {}),
      ...(budgetNanoAiu !== null ? { budgetNanoAiu } : {}),
    });
    if (this.disposed) return result;
    if (result.ok) {
      this.accept(result.value);
      this.setOpen(key, true);
    } else if (isInvalidState(result.error)) {
      void this.refresh(key);
    }
    return result;
  }

  /**
   * Stops an item's refinement in progress; on success the row shows it cancelled, or being cancelled. A
   * `409 invalid_state` (nothing in progress any more) reads the item again.
   */
  async cancel(key: string, reason: string): Promise<ApiResult<Refinement>> {
    const result = await this.api.cancelRefinement(key, { reason });
    if (this.disposed) return result;
    if (result.ok) this.accept(result.value);
    else if (isInvalidState(result.error)) void this.refresh(key);
    return result;
  }

  /** Reads the list and, when its row is open, the item's history: after the API said the item is not as shown. */
  private async refresh(key: string): Promise<void> {
    await Promise.all([
      this.load(),
      ...(this.isOpen(key) ? [this.readHistory(key)] : []),
    ]);
  }

  /** Whether an open row's history is behind the list: it was never read, or its newest differs in id or status. */
  private moved(key: string): boolean {
    const latest = this.latest(key);
    if (latest === null) return false;
    const newest = this.history(key)?.items?.[0];
    return (
      newest === undefined ||
      newest.id !== latest.id ||
      newest.status !== latest.status ||
      newest.cancelRequested !== latest.cancelRequested
    );
  }

  /** Takes a refinement the API answered as the newest of its item, in its row's state and history. */
  private accept(refinement: Refinement): void {
    this.accepted += 1;
    this.setLatest(refinement);
    const items = this.history(refinement.key)?.items ?? [];
    this.setHistory(refinement.key, {
      items: [refinement, ...items.filter((r) => r.id !== refinement.id)],
      failed: false,
    });
    this.schedule();
  }

  /**
   * Reads again in {@link REFINEMENT_POLL_MS} while some refinement is in progress, never twice at once; drops a pending
   * read once none is.
   */
  private schedule(): void {
    if (this.disposed) return;
    const active = [...this.latestByKey().values()].some((r) =>
      isActiveRefinement(r.status)
    );
    if (!active) {
      this.timer?.cancel();
      this.timer = null;
      return;
    }
    if (this.timer !== null) return;
    this.timer = this.clock.schedule(REFINEMENT_POLL_MS, () => {
      this.timer = null;
      void this.load();
    });
  }

  private setLatest(refinement: RefinementSummary): void {
    this.latestByKey.update((map) =>
      new Map(map).set(refinement.key, refinement)
    );
  }

  private setHistory(key: string, history: RefinementHistory): void {
    this.historyByKey.update((map) => new Map(map).set(key, history));
  }

  private setOpen(key: string, open: boolean): void {
    this.openKeys.update((keys) => {
      const next = new Set(keys);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  private dispose(): void {
    this.disposed = true;
    this.timer?.cancel();
    this.timer = null;
  }
}
