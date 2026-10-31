import { loadRuntimeEnvironment } from './runtime-environment';

const REALM = 'https://sso.example.com/auth/oauth2/realms/root/realms/alpha';
const BUILD = {
  name: 'TEST',
  issuer: 'https://build.example.com/realm',
  clientId: 'build-client',
  scope: 'openid profile email groups',
};

/** A fake `fetch` that answers every request with `response`, or fails with it when it is an Error. */
function answer(response: Response | Error): {
  request: typeof fetch;
  urls: string[];
  inits: RequestInit[];
} {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const request: typeof fetch = async (input, init) => {
    urls.push(String(input));
    inits.push(init ?? {});
    if (response instanceof Error) throw response;
    return response;
  };
  return { request, urls, inits };
}

describe('loadRuntimeEnvironment', () => {
  it("puts the team's realm and client over the build's sign-in", async () => {
    const config = { auth: { realmUrl: REALM, clientId: 'team-client' } };
    const { request, urls, inits } = answer(Response.json(config));
    const { environment, document, problems } = await loadRuntimeEnvironment(
      BUILD,
      request,
      'https://ahoy.example.com'
    );
    expect(urls).toEqual(['/config.json']);
    expect(inits[0]?.cache).toBe('no-store');
    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(document).toEqual(config);
    expect(problems).toEqual([]);
    expect(environment).toMatchObject({
      name: 'TEST',
      issuer: REALM,
      clientId: 'team-client',
      scope: 'openid profile email groups',
      redirectUri: 'https://ahoy.example.com/',
      showDebugInformation: false,
      loginUrl: `${REALM}/authorize`,
    });
  });

  it.each([
    ['no file', new Response('', { status: 404 })],
    ['an SPA fallback page', new Response('<!doctype html>')],
    ['a failed request', new Error('offline')],
  ])(
    "keeps the build's sign-in and preloads nothing with %s",
    async (_, response) => {
      const { environment, document, problems } = await loadRuntimeEnvironment(
        BUILD,
        answer(response).request,
        'https://ahoy.example.com'
      );
      expect(environment).toEqual(BUILD);
      expect(document).toBeUndefined();
      expect(problems).toEqual([]);
    }
  );

  it.each([
    ['a document without auth', { apiBase: '/api/v1' }],
    ['an array', []],
    ['null', null],
  ])(
    "keeps the build's sign-in and passes on %s for the app configuration to judge",
    async (_, config) => {
      const { environment, document, problems } = await loadRuntimeEnvironment(
        BUILD,
        answer(Response.json(config)).request,
        'https://ahoy.example.com'
      );
      expect(environment).toEqual(BUILD);
      expect(document).toEqual(config);
      expect(problems).toEqual([]);
    }
  );

  it('says why auth is unusable, so that main.ts does not start the app', async () => {
    const { environment, problems } = await loadRuntimeEnvironment(
      BUILD,
      answer(Response.json({ auth: { realmUrl: 'ftp://x', clientId: 'c' } }))
        .request,
      'https://ahoy.example.com'
    );
    expect(environment).toEqual(BUILD);
    expect(problems).toHaveLength(1);
  });
});
