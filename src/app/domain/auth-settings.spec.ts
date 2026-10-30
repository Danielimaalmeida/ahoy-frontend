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
    [{ realmUrl: REALM, clientId: 'c', scope: 'a\tb' }, 'auth.scope'],
    [
      {
        realmUrl: REALM,
        clientId: 'c',
        redirectUri: 'http://ahoy.example.com/',
      },
      'auth.redirectUri',
    ],
    [
      {
        realmUrl: REALM,
        clientId: 'c',
        silentRefreshRedirectUri: 'https://x/#a',
      },
      'auth.silentRefreshRedirectUri',
    ],
    [
      { realmUrl: REALM, clientId: 'c', postLogoutRedirectUri: 'javascript:x' },
      'auth.postLogoutRedirectUri',
    ],
    [{ realmUrl: REALM, clientId: 'c', debug: 'yes' }, 'auth.debug'],
  ])('refuses %j, saying why', (value, problem) => {
    const read = readAuthSettings(value);
    expect(read.settings).toBeNull();
    expect(read.problems.join(' ')).toContain(problem);
  });

  it.each(['http://localhost:4200/realm', 'http://127.0.0.1:4200/realm'])(
    'accepts the plain-http realm %s on this machine',
    (realmUrl) => {
      expect(
        readAuthSettings({ realmUrl, clientId: 'c' }).settings?.realmUrl
      ).toBe(realmUrl);
    }
  );

  it('keeps registered redirect URIs exactly as written, double slash included', () => {
    expect(
      readAuthSettings({
        realmUrl: REALM,
        clientId: 'c',
        redirectUri: ' https://ahoy.example.com/ ',
        postLogoutRedirectUri: 'https://ahoy.example.com',
        silentRefreshRedirectUri:
          'https://ahoy.example.com//ui/oauth/silent-refresh.html',
        debug: true,
      }).settings
    ).toEqual({
      realmUrl: REALM,
      clientId: 'c',
      redirectUri: 'https://ahoy.example.com/',
      postLogoutRedirectUri: 'https://ahoy.example.com',
      silentRefreshRedirectUri:
        'https://ahoy.example.com//ui/oauth/silent-refresh.html',
      debug: true,
    });
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
      redirectUri: 'https://ahoy.example.com/',
      silentRefreshRedirectUri:
        'https://ahoy.example.com/ui/oauth/silent-refresh.html',
      postLogoutRedirectUri: 'https://ahoy.example.com/',
      loginUrl: `${REALM}/authorize`,
      logoutUrl: `${REALM}/connect/endSession`,
      tokenEndpoint: `${REALM}/access_token`,
      userinfoEndpoint: `${REALM}/userinfo`,
      sessionCheckIFrameUrl: `${REALM}/connect/checkSession`,
      revocationEndpoint: `${REALM}/token/revoke`,
      showDebugInformation: false,
    });
  });

  it('uses the registered redirects, the scope and debug when the settings give them', () => {
    expect(
      oidcEnvironment(
        {
          realmUrl: REALM,
          clientId: 'c',
          scope: 'openid',
          redirectUri: 'https://ahoy.example.com',
          postLogoutRedirectUri: 'https://ahoy.example.com/bye',
          silentRefreshRedirectUri:
            'https://ahoy.example.com//ui/oauth/silent-refresh.html',
          debug: true,
        },
        'https://ahoy.example.com'
      )
    ).toMatchObject({
      scope: 'openid',
      redirectUri: 'https://ahoy.example.com',
      postLogoutRedirectUri: 'https://ahoy.example.com/bye',
      silentRefreshRedirectUri:
        'https://ahoy.example.com//ui/oauth/silent-refresh.html',
      showDebugInformation: true,
    });
  });
});
