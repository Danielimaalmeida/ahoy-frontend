import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiResult } from '@core/api/api-error';
import type {
  Refinement,
  RefinementStatus,
  RefinementSummary,
} from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';

/** How often refinements in progress are read again: they send no events. */
export const REFINEMENT_POLL_MS = 5_000;

/** Whether a refinement is still in progress: queued for a run slot, or running. */
export function isActiveRefinement(status: RefinementStatus): boolean {
  return status === 'queued' || status === 'running';
}

/** The word a backlog row shows for a refinement's status. */
export function refinementLabel(status: RefinementStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Refining';
    case 'succeeded':
      return 'Refined';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
    case 'budget_exceeded':
    case 'timed_out':
    case 'output_violation':
    case 'auth_failed':
    case 'lost':
      return 'Failed';
  }
}

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
 * list, and the history of the open rows, are read again every {@link REFINEMENT_POLL_MS}; nothing is polled otherwise.
 */
@Injectable()
export class BacklogRefinements {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);

  private readonly latestByKey = signal<
    ReadonlyMap<string, RefinementSummary>
  >(new Map());
  private readonly historyByKey = signal<
    ReadonlyMap<string, RefinementHistory>
  >(new Map());
  private readonly openKeys = signal<ReadonlySet<string>>(new Set());
  private readonly statusSignal = signal<'loading' | 'ready' | 'error'>(
    'loading'
  );
  private timer: Timer | null = null;
  private disposed = false;

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

  /** Whether an item's refinement row is open. */
  isOpen(key: string): boolean {
    return this.openKeys().has(key);
  }

  /** Reads the newest refinement of every item. A failure keeps what was read before. */
  async load(): Promise<void> {
    const result = await this.api.listRefinements();
    if (this.disposed) return;
    if (result.ok) {
      this.latestByKey.set(new Map(result.value.map((r) => [r.key, r])));
      this.statusSignal.set('ready');
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

  /** Reads an item's refinements, newest first, and takes the newest as its row's state. */
  async readHistory(key: string): Promise<void> {
    const result = await this.api.getRefinements(key);
    if (this.disposed) return;
    const before = this.history(key);
    if (!result.ok) {
      this.setHistory(key, { items: before?.items ?? null, failed: true });
      return;
    }
    this.setHistory(key, { items: result.value.items, failed: false });
    const newest = result.value.items[0];
    if (newest !== undefined) this.setLatest(newest);
    this.schedule();
  }

  /** Asks for a refinement; on success the row shows it at once, open. */
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
    if (result.ok && !this.disposed) {
      this.accept(result.value);
      this.setOpen(key, true);
    }
    return result;
  }

  /** Stops an item's refinement in progress; on success the row shows it cancelled, or being cancelled. */
  async cancel(key: string, reason: string): Promise<ApiResult<Refinement>> {
    const result = await this.api.cancelRefinement(key, { reason });
    if (result.ok && !this.disposed) this.accept(result.value);
    return result;
  }

  /** Takes a refinement the API answered as the newest of its item, in its row's state and history. */
  private accept(refinement: Refinement): void {
    this.setLatest(refinement);
    const items = this.history(refinement.key)?.items ?? [];
    this.setHistory(refinement.key, {
      items: [refinement, ...items.filter((r) => r.id !== refinement.id)],
      failed: false,
    });
    this.schedule();
  }

  /** Reads again in {@link REFINEMENT_POLL_MS} while some refinement is in progress; never twice at once. */
  private schedule(): void {
    if (this.disposed || this.timer !== null) return;
    const active = [...this.latestByKey().values()].some((r) =>
      isActiveRefinement(r.status)
    );
    if (!active) return;
    this.timer = this.clock.schedule(REFINEMENT_POLL_MS, () => {
      this.timer = null;
      void this.poll();
    });
  }

  /** One round: the list, and the history of the open rows whose refinement is in progress. */
  private async poll(): Promise<void> {
    const open = [...this.openKeys()].filter((key) => {
      const latest = this.latest(key);
      return latest !== null && isActiveRefinement(latest.status);
    });
    await Promise.all([
      this.load(),
      ...open.map((key) => this.readHistory(key)),
    ]);
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
