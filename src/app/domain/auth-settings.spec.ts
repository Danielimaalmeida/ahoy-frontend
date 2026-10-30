import { oidcEnvironment, readAuthSettings } from './auth-settings';

const REALM = 'https://sso.example.com/auth/oauth2/realms/root/realms/alpha';

describe('readAuthSettings', () => {
  it('reads a realm and a client, without the trailing slash', () => {
    expect(
      readAuthSettings({ realmUrl: `${REALM}/`, clientId: ' ui-client ' })
    ).toEqual({
      settings: { realmUrl: REALM, clientId: 'ui-client' },
      problems: [],
    });
  });

  it('keeps the scope when one is given', () => {
    expect(
      readAuthSettings({ realmUrl: REALM, clientId: 'c', scope: 'openid' })
        .settings
    ).toEqual({ realmUrl: REALM, clientId: 'c', scope: 'openid' });
  });

  it('gives no settings and no problem when the document has no auth', () => {
    expect(readAuthSettings(undefined)).toEqual({
      settings: null,
      problems: [],
    });
    expect(readAuthSettings(null)).toEqual({ settings: null, problems: [] });
  });

  it.each([
    [[], 'auth must be a JSON object'],
    [{ clientId: 'c' }, 'auth.realmUrl'],
    [
      { realmUrl: 'http://sso.example.com/realm', clientId: 'c' },
      'auth.realmUrl',
    ],
    [{ realmUrl: `${REALM}?x=1`, clientId: 'c' }, 'auth.realmUrl'],
    [
      { realmUrl: 'https://user:pw@sso.example.com', clientId: 'c' },
      'auth.realmUrl',
    ],
    [{ realmUrl: REALM }, 'auth.clientId'],
    [{ realmUrl: REALM, clientId: 'a\nb' }, 'auth.clientId'],
    [{ realmUrl: REALM, clientId: 'c', scope: '' }, 'auth.scope'],
  ])('refuses %j, saying why', (value, problem) => {
    const read = readAuthSettings(value);
    expect(read.settings).toBeNull();
    expect(read.problems.join(' ')).toContain(problem);
  });

  it('accepts a plain-http realm on localhost only', () => {
    expect(
      readAuthSettings({
        realmUrl: 'http://localhost:4200/realm',
        clientId: 'c',
      }).settings?.realmUrl
    ).toBe('http://localhost:4200/realm');
  });
});

describe('oidcEnvironment', () => {
  it('derives every WebEAM endpoint from the realm and every redirect from the page origin', () => {
    expect(
      oidcEnvironment(
        { realmUrl: REALM, clientId: 'ui-client' },
        'https://ahoy.example.com/'
      )
    ).toEqual({
      issuer: REALM,
      clientId: 'ui-client',
      redirectUri: 'https://ahoy.example.com',
      silentRefreshRedirectUri:
        'https://ahoy.example.com/ui/oauth/silent-refresh.html',
      postLogoutRedirectUri: 'https://ahoy.example.com',
      loginUrl: `${REALM}/authorize`,
      logoutUrl: `${REALM}/connect/endSession`,
      tokenEndpoint: `${REALM}/access_token`,
      userinfoEndpoint: `${REALM}/userinfo`,
      sessionCheckIFrameUrl: `${REALM}/connect/checkSession`,
      revocationEndpoint: `${REALM}/token/revoke`,
    });
  });
});
