import type { Clock, Timer } from "../clock";

interface Scheduled {
  readonly at: number;
  readonly seq: number;
  readonly callback: () => void;
  active: boolean;
}

/** Lets pending promise callbacks run: a few turns of the real event loop, with no delay. For specs only. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

/**
 * A clock for specs: time stands still until {@link advance} moves it, which runs the timers that fall due, in order, and
 * lets the promises they start settle in between. Nothing really waits.
 */
export class FakeClock implements Clock {
  private time: number;
  private seq = 0;
  private timers: Scheduled[] = [];

  constructor(start = "2026-10-06T10:00:00.000Z") {
    this.time = Date.parse(start);
  }

  now(): Date {
    return new Date(this.time);
  }

  schedule(ms: number, callback: () => void): Timer {
    const timer: Scheduled = { at: this.time + Math.max(0, ms), seq: this.seq++, callback, active: true };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.active = false;
      },
    };
  }

  /** How many timers are waiting. */
  get pending(): number {
    return this.timers.filter((t) => t.active).length;
  }

  /** The delays, from now, of the timers that are waiting, soonest first. */
  get delays(): readonly number[] {
    return this.timers
      .filter((t) => t.active)
      .map((t) => t.at - this.time)
      .sort((a, b) => a - b);
  }

  /** Moves time forward by `ms`, running every timer that falls due on the way. */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    await settle();
    for (;;) {
      const due = this.timers.filter((t) => t.active && t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (due === undefined) break;
      due.active = false;
      this.time = due.at;
      due.callback();
      await settle();
    }
    this.timers = this.timers.filter((t) => t.active);
    this.time = target;
  }
}
