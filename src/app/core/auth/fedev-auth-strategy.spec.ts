import { describe, expect, it } from 'vitest';
import type { FedevAuthService } from '@company-name-fedev/auth';
import { FedevAuthStrategy } from './fedev-auth-strategy';

/** The slice of `FedevAuthService` the strategy reads. */
function authWith(accessToken: string | null): FedevAuthService {
  return { accessToken } as FedevAuthService;
}

describe('FedevAuthStrategy', () => {
  it('carries the access token as a bearer header', async () => {
    const strategy = new FedevAuthStrategy(authWith('abc.def.ghi'));
    await expect(strategy.headers()).resolves.toEqual({
      Authorization: 'Bearer abc.def.ghi',
    });
  });

  it('adds nothing when there is no token yet', async () => {
    const strategy = new FedevAuthStrategy(authWith(null));
    await expect(strategy.headers()).resolves.toEqual({});
  });

  it('adds nothing when the token is empty', async () => {
    const strategy = new FedevAuthStrategy(authWith(''));
    await expect(strategy.headers()).resolves.toEqual({});
  });

  it('reads the token again on every call, so a refresh is picked up', async () => {
    let token = 'first';
    const auth = {
      get accessToken(): string | null {
        return token;
      },
    } as FedevAuthService;
    const strategy = new FedevAuthStrategy(auth);

    await expect(strategy.headers()).resolves.toEqual({
      Authorization: 'Bearer first',
    });
    token = 'second';
    await expect(strategy.headers()).resolves.toEqual({
      Authorization: 'Bearer second',
    });
  });
});
