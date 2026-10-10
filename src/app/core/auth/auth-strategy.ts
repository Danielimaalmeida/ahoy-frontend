import { InjectionToken } from '@angular/core';

/**
 * What proves who the user is, as request headers (F8). It is the one place a real sign-in will plug in: a WebEAM strategy
 * returns a Bearer header here, and nothing else in the app changes. `ApiClient` gets it through `authInterceptor`; the
 * event stream (lane 2B) calls it directly because it uses `fetch`.
 */
export interface AuthStrategy {
  /** The headers to add to a request to the API. May be asynchronous: a token may need refreshing first. */
  headers(): Promise<Record<string, string>>;
}

/**
 * The only strategy today: it adds nothing. **No request carries `Authorization`.** Locally the dev server's proxy adds
 * `X-Ahoy-Actor` (`AHOY_AUTH=dev`, local only); elsewhere whatever sits in front of the app authenticates.
 */
export class NoAuthStrategy implements AuthStrategy {
  headers(): Promise<Record<string, string>> {
    return Promise.resolve({});
  }
}

/** The strategy in force. Defaults to {@link NoAuthStrategy}; tests and the future sign-in provide their own. */
export const AUTH_STRATEGY = new InjectionToken<AuthStrategy>('AUTH_STRATEGY', {
  providedIn: 'root',
  factory: () => new NoAuthStrategy(),
});
