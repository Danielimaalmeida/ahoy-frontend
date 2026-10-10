import { TestBed } from '@angular/core/testing';
import { AppConfigStore, DEFAULT_APP_CONFIG } from '@core/config/app-config';
import { CurrentUser, initialsOf } from './current-user';

describe('initialsOf', () => {
  const CASES: readonly (readonly [string, string])[] = [
    ['alex@example.com', 'AL'],
    ['jordan@example.com', 'JO'],
    ['priya@example.com', 'PR'],
    ['alex.rivera@example.com', 'AR'],
    ['alex_rivera@example.com', 'AR'],
    ['alex-rivera-jones@example.com', 'AR'],
    ['a@example.com', 'A'],
    ['Alex Rivera', 'AR'],
    ['alex', 'AL'],
    ['élodie.dupont@example.fr', 'ÉD'],
    ['ßeta@example.com', 'SE'],
    ['李小龙@example.cn', '李小'],
    ['3f2a9c0e-77aa-4c1d-9d11-0123456789ab', '37'],
    ['+++@example.com', '?'],
    ['@example.com', '?'],
    ['', '?'],
  ];

  it.each(CASES)('%s gives %s', (id, initials) => {
    expect(initialsOf(id)).toBe(initials);
  });

  it('does not split a character outside the basic plane in two', () => {
    expect(initialsOf('𝒜lex.𝒷ob@example.com')).toBe('𝒜𝒷');
  });
});

describe('CurrentUser', () => {
  it('is the default actor until the configuration says otherwise', () => {
    const user = TestBed.inject(CurrentUser);
    expect(user.id()).toBe(DEFAULT_APP_CONFIG.actor);
    expect(user.initials()).toBe('DE');
  });

  it('follows the actor of the AppConfig, including a configuration read later', () => {
    const user = TestBed.inject(CurrentUser);
    TestBed.inject(AppConfigStore).set({
      ...DEFAULT_APP_CONFIG,
      actor: 'alex@example.com',
    });
    expect(user.id()).toBe('alex@example.com');
    expect(user.initials()).toBe('AL');
  });

  it('says whether an actor is the user, comparing exactly as the API does', () => {
    TestBed.inject(AppConfigStore).set({
      ...DEFAULT_APP_CONFIG,
      actor: 'alex@example.com',
    });
    const user = TestBed.inject(CurrentUser);
    expect(user.is('alex@example.com')).toBe(true);
    expect(user.is('jordan@example.com')).toBe(false);
    expect(user.is('Alex@Example.com')).toBe(false);
    expect(user.is('ahoy-reconciler')).toBe(false);
    expect(user.is('')).toBe(false);
  });
});
