/**
 * The time of the mock backend. Everything the mock does later (a simulated run's ticks, a keepalive, a cancellation)
 * goes through a {@link MockClock}, so tests drive it with {@link ManualClock} and the browser and `npm run mock:api`
 * use {@link realClock}. Plain TypeScript: it also runs in Node (`scripts/mock-api.mjs`).
 */

/** Cancels a scheduled callback; cancelling one that already ran does nothing. */
export type Cancel = () => void;

/** Now, and timers. */
export interface MockClock {
  /** Milliseconds since the epoch. */
  now(): number;
  /** Runs `callback` once, `ms` milliseconds from now. */
  schedule(ms: number, callback: () => void): Cancel;
}

/** The real clock: `Date.now` and `setTimeout`. */
export const realClock: MockClock = {
  now: () => Date.now(),
  schedule(ms, callback) {
    const id = globalThis.setTimeout(callback, ms);
    return () => globalThis.clearTimeout(id);
  },
};

interface Pending {
  readonly at: number;
  readonly order: number;
  readonly callback: () => void;
}

/** A clock that moves only when told to: callbacks run in time order (ties in the order they were scheduled). */
export class ManualClock implements MockClock {
  private time: number;
  private order = 0;
  private pending: Pending[] = [];

  constructor(start: number | string) {
    this.time = typeof start === "number" ? start : Date.parse(start);
  }

  now(): number {
    return this.time;
  }

  schedule(ms: number, callback: () => void): Cancel {
    const entry: Pending = { at: this.time + Math.max(0, ms), order: this.order++, callback };
    this.pending.push(entry);
    return () => {
      this.pending = this.pending.filter((p) => p !== entry);
    };
  }

  /** Moves time forward by `ms`, running every callback that falls due on the way (including ones they schedule). */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const next = this.nextDue(end);
      if (next === undefined) break;
      this.pending = this.pending.filter((p) => p !== next);
      this.time = next.at;
      next.callback();
    }
    this.time = end;
  }

  /** Runs callbacks until none is left (at most `limit`, so a callback that always reschedules cannot hang a test). */
  runAll(limit = 10_000): void {
    for (let i = 0; i < limit; i++) {
      const next = this.nextDue(Number.POSITIVE_INFINITY);
      if (next === undefined) return;
      this.pending = this.pending.filter((p) => p !== next);
      this.time = Math.max(this.time, next.at);
      next.callback();
    }
    throw new Error(`ManualClock.runAll: still busy after ${limit} callbacks`);
  }

  /** How many callbacks are waiting. */
  get waiting(): number {
    return this.pending.length;
  }

  private nextDue(end: number): Pending | undefined {
    let best: Pending | undefined;
    for (const p of this.pending)
      if (p.at <= end && (best === undefined || p.at < best.at || (p.at === best.at && p.order < best.order))) best = p;
    return best;
  }
}

/** An instant as the API writes it: `toISOString()`, with milliseconds and `Z`. */
export function iso(ms: number): string {
  return new Date(ms).toISOString();
}
