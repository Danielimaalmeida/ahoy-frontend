import { InjectionToken } from '@angular/core';

/**
 * The `fetch` behind the event stream (F6): `globalThis.fetch` unless something else is provided. Tests and the mock
 * backend replace it with a fake.
 */
export const FETCH = new InjectionToken<typeof fetch>('FETCH', {
  providedIn: 'root',
  factory: () => globalThis.fetch.bind(globalThis),
});
