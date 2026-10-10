import { InjectionToken } from '@angular/core';

/** Returns the current instant. Pipes read "now" through it so tests, and a shell that ticks, can supply their own. */
export type Clock = () => Date;

/**
 * The clock the pipes use. By default it is the real one. A shell that wants relative times to refresh as the minutes
 * pass can provide a clock that reads a signal: the pipes call it during change detection, so the view follows it.
 */
export const CLOCK = new InjectionToken<Clock>('CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
