import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FedevAuthService } from '@company-name-fedev/auth';
import { AppConfigStore, DEFAULT_APP_CONFIG } from '@core/config/app-config';
import { AccessControl } from './access-control';

function configure(
  profile: Record<string, unknown> | null,
  allowedQnumbers?: readonly string[],
  currentUser: string | null = null
) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FedevAuthService,
        useValue: {
          userProfile: signal(profile),
          currentUser: signal(currentUser),
          logout: () => undefined,
        },
      },
    ],
  });
  TestBed.inject(AppConfigStore).set({
    ...DEFAULT_APP_CONFIG,
    ...(allowedQnumbers !== undefined ? { allowedQnumbers } : {}),
  });
  return TestBed.inject(AccessControl);
}

describe('AccessControl', () => {
  it("reads the qnumber from the token's sub, lower-cased", () => {
    expect(configure({ sub: 'Q123456', uid: 'q7' }).qnumber()).toBe('q123456');
  });

  it('falls back to the uid, then to the current user of the auth library', () => {
    expect(configure({ sub: 'alex', uid: 'q7' }).qnumber()).toBe('q7');
    TestBed.resetTestingModule();
    expect(configure(null, undefined, 'Q9').qnumber()).toBe('q9');
  });

  it('allows everyone when the configuration has no list', () => {
    expect(configure({ sub: 'q654321' }).denied()).toBe(false);
  });

  it('allows a user on the list and denies one who is not', () => {
    expect(configure({ sub: 'q123456' }, ['q123456']).denied()).toBe(false);
    TestBed.resetTestingModule();
    expect(configure({ sub: 'q654321' }, ['q123456']).denied()).toBe(true);
  });

  it('denies a user whose qnumber cannot be read when there is a list', () => {
    expect(configure({ sub: 'alex' }, ['q123456']).denied()).toBe(true);
  });

  it('denies a user the API refused, whatever the configuration says', () => {
    const access = configure({ sub: 'q123456' });
    access.refuseByApi();
    expect(access.denied()).toBe(true);
  });
});
