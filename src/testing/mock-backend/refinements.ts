/**
 * The mock's refinements of backlog items (`/refinements`): a request is queued, runs on the mock's clock and ends with a
 * simulated pre-refinement, as `apps/reconciler/src/refinement.ts` of `ahoy-hosted` drives the real ones. Fictional text,
 * 0 AIU of anything real.
 */
import type {
  Refinement,
  RefinementRequest,
  RefinementSummary,
} from '@core/api/types';
import { iso, type Cancel, type MockClock } from './clock';
import { refinementMarkdown } from './content';
import { MockProblem } from './http';
import { sha256Hex } from './sha256';
import type { SimulationTiming } from './simulator';
import { DEFAULT_CONTROL_SHA, type Writable } from './voyage';

/** The cap a refinement gets when the request names none: the server's default `refinement` phase cap. */
export const DEFAULT_REFINEMENT_BUDGET_NANO_AIU = 10_000_000_000;

/** What a simulated refinement spends when it succeeds. */
const REFINEMENT_COST_NANO_AIU = 1_200_000_000;

/** A refinement without its content, as `listRefinements` lists it. */
function summary(item: Refinement): RefinementSummary {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => key !== 'content')
  ) as RefinementSummary; // every field of a refinement but `content` is a summary's
}

/** The refinements of a mock world, newest first per Jira key, and the timers that move them on. */
export class RefinementDesk {
  private readonly byKey = new Map<string, Writable<Refinement>[]>();
  private readonly timers = new Map<string, Cancel>();

  constructor(
    private readonly clock: MockClock,
    private readonly timing: SimulationTiming
  ) {}

  /** The newest refinement of every refined key, newest first, without content. */
  latest(): RefinementSummary[] {
    return [...this.byKey.values()]
      .map((items) => items[0])
      .filter((item): item is Writable<Refinement> => item !== undefined)
      .sort(
        (a, b) =>
          (a.createdAt < b.createdAt
            ? 1
            : a.createdAt > b.createdAt
              ? -1
              : 0) || (a.id < b.id ? 1 : -1)
      )
      .map((item) => summary(item));
  }

  /** Every refinement of one key, newest first, with content. */
  of(key: string): Refinement[] {
    return (this.byKey.get(key) ?? []).map((item) => ({ ...item }));
  }

  /** Queues a refinement; `409 invalid_state` when the key already has one in progress. */
  request(key: string, actor: string, body: RefinementRequest): Refinement {
    const items = this.byKey.get(key) ?? [];
    if (
      items.some(
        (item) => item.status === 'queued' || item.status === 'running'
      )
    )
      throw new MockProblem(
        'invalid_state',
        `${key} already has a refinement in progress`
      );
    const attempt = items.length + 1;
    const suffix = sha256Hex(`${key}/refinement/${attempt}`).slice(0, 4);
    const notes =
      body.notes !== undefined && body.notes.trim() !== ''
        ? body.notes.trim()
        : null;
    const refinement: Writable<Refinement> = {
      id: `${key.toLowerCase()}-refinement-${String(attempt).padStart(3, '0')}-${suffix}`,
      key,
      status: 'queued',
      notes,
      requestedBy: actor,
      agent: null,
      model: null,
      reasoningEffort: null,
      runtime: null,
      controlSha: DEFAULT_CONTROL_SHA,
      budgetNanoAiu: body.budgetNanoAiu ?? DEFAULT_REFINEMENT_BUDGET_NANO_AIU,
      usage: { requests: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0 },
      exitReason: null,
      cancelRequested: false,
      createdAt: this.now(),
      startedAt: null,
      endedAt: null,
      content: null,
    };
    this.byKey.set(key, [refinement, ...items]);
    this.after(refinement, this.timing.dispatchMs, () =>
      this.start(refinement)
    );
    return { ...refinement };
  }

  /** Cancels the key's refinement in progress: a queued one at once, a running one a moment later. */
  cancel(key: string, actor: string, reason: string): Refinement {
    const active = (this.byKey.get(key) ?? []).find(
      (item) => item.status === 'queued' || item.status === 'running'
    );
    if (!active)
      throw new MockProblem(
        'invalid_state',
        `${key} has no refinement in progress`
      );
    if (reason.trim() === '')
      throw new MockProblem(
        'validation_failed',
        'Cancelling a refinement needs a reason'
      );
    active.cancelRequested = true;
    active.exitReason = `cancelled by ${actor}: ${reason.trim()}`;
    this.timers.get(active.id)?.();
    if (active.status === 'queued') {
      active.status = 'cancelled';
      active.endedAt = this.now();
    } else {
      this.after(active, this.timing.cancelMs, () => {
        active.status = 'cancelled';
        active.usage = { ...active.usage, requests: 1, nanoAiu: 300_000_000 };
        active.endedAt = this.now();
      });
    }
    return { ...active };
  }

  /** Cancels every timer (the server is closing or being reset). */
  stopAll(): void {
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }

  private start(refinement: Writable<Refinement>): void {
    refinement.status = 'running';
    refinement.agent = 'quartermaster';
    refinement.model = 'claude-sonnet-5';
    refinement.runtime = 'mock';
    refinement.startedAt = this.now();
    this.after(refinement, this.timing.tickMs * 2, () => {
      refinement.status = 'succeeded';
      refinement.usage = {
        requests: 4,
        nanoAiu: Math.min(REFINEMENT_COST_NANO_AIU, refinement.budgetNanoAiu),
        inputTokens: 21_400,
        outputTokens: 1_850,
      };
      refinement.content = refinementMarkdown(refinement.key, refinement.notes);
      refinement.endedAt = this.now();
    });
  }

  private after(
    refinement: Writable<Refinement>,
    ms: number,
    callback: () => void
  ): void {
    const cancel = this.clock.schedule(ms, () => {
      this.timers.delete(refinement.id);
      callback();
    });
    this.timers.set(refinement.id, cancel);
  }

  private now(): string {
    return iso(this.clock.now());
  }
}
