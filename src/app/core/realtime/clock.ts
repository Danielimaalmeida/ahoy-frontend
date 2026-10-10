import { InjectionToken } from '@angular/core';

/** A scheduled callback that can still be cancelled. Cancelling one that already ran does nothing. */
export interface Timer {
  cancel(): void;
}

/**
 * The time and the timers of the data layer. Everything that waits (reconnection, polling, debounce) goes through it, so
 * tests drive time with a fake instead of waiting.
 */
export interface Clock {
  /** Now. */
  now(): Date;
  /** Runs `callback` once, `ms` milliseconds from now. */
  schedule(ms: number, callback: () => void): Timer;
}

/** The real clock: `Date` and `setTimeout`. */
export const systemClock: Clock = {
  now: () => new Date(),
  schedule(ms, callback) {
    const id = globalThis.setTimeout(callback, ms);
    return { cancel: () => globalThis.clearTimeout(id) };
  },
};

/** The clock in force: {@link systemClock} unless a test provides a fake. */
export const CLOCK = new InjectionToken<Clock>('CLOCK', {
  providedIn: 'root',
  factory: () => systemClock,
});

/** A number in `[0, 1)`, for the jitter of reconnection delays. `Math.random` unless a test provides its own. */
export const RANDOM = new InjectionToken<() => number>('RANDOM', {
  providedIn: 'root',
  factory: () => Math.random,
});
