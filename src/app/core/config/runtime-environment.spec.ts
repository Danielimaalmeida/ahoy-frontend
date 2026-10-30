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
} {
  const urls: string[] = [];
  const request: typeof fetch = async (input) => {
    urls.push(String(input));
    if (response instanceof Error) throw response;
    return response;
  };
  return { request, urls };
}

describe('loadRuntimeEnvironment', () => {
  it("puts the team's realm and client over the build's sign-in", async () => {
    const { request, urls } = answer(
      Response.json({ auth: { realmUrl: REALM, clientId: 'team-client' } })
    );
    const { environment, problems } = await loadRuntimeEnvironment(
      BUILD,
      request,
      'https://ahoy.example.com'
    );
    expect(urls).toEqual(['/config.json']);
    expect(problems).toEqual([]);
    expect(environment).toMatchObject({
      name: 'TEST',
      issuer: REALM,
      clientId: 'team-client',
      scope: 'openid profile email groups',
      redirectUri: 'https://ahoy.example.com',
      loginUrl: `${REALM}/authorize`,
    });
  });

  it.each([
    ['no file', new Response('', { status: 404 })],
    ['an SPA fallback page', new Response('<!doctype html>')],
    ['a failed request', new Error('offline')],
    ['a document without auth', Response.json({ apiBase: '/api/v1' })],
  ])("keeps the build's sign-in with %s", async (_, response) => {
    const { environment, problems } = await loadRuntimeEnvironment(
      BUILD,
      answer(response).request,
      'https://ahoy.example.com'
    );
    expect(environment).toEqual(BUILD);
    expect(problems).toEqual([]);
  });

  it("keeps the build's sign-in and says why when auth is unusable", async () => {
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
