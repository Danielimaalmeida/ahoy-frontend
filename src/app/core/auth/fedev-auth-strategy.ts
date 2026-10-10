import type { FedevAuthService } from '@company-name-fedev/auth';
import type { AuthStrategy } from './auth-strategy';

/**
 * The real strategy (F8): it carries the WebEAM access token `@company-name-fedev/auth` holds, as `Authorization: Bearer …`.
 *
 * `provideFedevAuth({ includeAccessTokenInBackendRequests: true })` already adds that header to `HttpClient` requests, but
 * the event stream reads `fetch` directly (F6) and has no interceptor, so it needs the token from here. Without a token
 * the headers are empty and the API answers `401 unauthenticated`.
 */
export class FedevAuthStrategy implements AuthStrategy {
  constructor(private readonly auth: FedevAuthService) {}

  headers(): Promise<Record<string, string>> {
    const token = this.auth.accessToken;
    if (token === null || token === '') return Promise.resolve({});
    return Promise.resolve({ Authorization: `Bearer ${token}` });
  }
}
