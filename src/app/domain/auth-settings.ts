/**
 * The team's WebEAM sign-in, read at runtime from `/config.json` (`auth`) so that one image serves every team. Only the
 * realm and the client differ between teams; every endpoint follows from the realm, as WebEAM lays them out.
 */
export interface AuthSettings {
  /** The realm, such as `https://sso.example.com/auth/oauth2/realms/root/realms/alpha`, without a trailing slash. */
  readonly realmUrl: string;
  /** The front end's own WebEAM client. */
  readonly clientId: string;
  /** The scopes asked for; the build's own when absent. */
  readonly scope?: string;
}

/** The sign-in fields of the environment the auth library takes, all derived from {@link AuthSettings}. */
export interface OidcEnvironment {
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly silentRefreshRedirectUri: string;
  readonly postLogoutRedirectUri: string;
  readonly loginUrl: string;
  readonly logoutUrl: string;
  readonly tokenEndpoint: string;
  readonly userinfoEndpoint: string;
  readonly sessionCheckIFrameUrl: string;
  readonly revocationEndpoint: string;
  readonly scope?: string;
}

/** What `readAuthSettings` made of a document's `auth`: null when it is absent or unusable, with why. */
export interface ReadAuthSettings {
  readonly settings: AuthSettings | null;
  readonly problems: readonly string[];
}

const CONTROL = /\p{Cc}/u;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A realm URL: https (http only for localhost), no credentials, query or fragment; trailing slashes dropped. */
function readRealmUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const secure =
      url.protocol === 'https:' || (url.protocol === 'http:' && local);
    if (
      !secure ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    )
      return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** A one-line value of 1 to 200 characters, or null. */
function readLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 200 && !CONTROL.test(trimmed)
    ? trimmed
    : null;
}

/**
 * Reads the `auth` field of a `/config.json` document. Absent (or `null`) gives no settings and no problem: the build's
 * own sign-in stays in force. Present but unusable gives no settings and says why, so the app never signs in against a
 * half-configured realm.
 */
export function readAuthSettings(value: unknown): ReadAuthSettings {
  if (value === undefined || value === null)
    return { settings: null, problems: [] };
  if (!isRecord(value))
    return { settings: null, problems: ['auth must be a JSON object'] };
  const problems: string[] = [];
  const realmUrl = readRealmUrl(value['realmUrl']);
  if (realmUrl === null)
    problems.push(
      'auth.realmUrl must be an https URL without credentials, query or fragment'
    );
  const clientId = readLine(value['clientId']);
  if (clientId === null)
    problems.push('auth.clientId must be 1 to 200 characters on one line');
  const hasScope = value['scope'] !== undefined && value['scope'] !== null;
  const scope = hasScope ? readLine(value['scope']) : null;
  if (hasScope && scope === null)
    problems.push('auth.scope must be 1 to 200 characters on one line');
  if (realmUrl === null || clientId === null || problems.length)
    return { settings: null, problems };
  return {
    settings: { realmUrl, clientId, ...(scope !== null ? { scope } : {}) },
    problems,
  };
}

/** The sign-in environment for a realm and client, served from `origin` (the page's own, such as `https://ahoy.example.com`). */
export function oidcEnvironment(
  settings: AuthSettings,
  origin: string
): OidcEnvironment {
  const realm = settings.realmUrl;
  const host = origin.replace(/\/+$/, '');
  return {
    issuer: realm,
    clientId: settings.clientId,
    redirectUri: host,
    silentRefreshRedirectUri: `${host}/ui/oauth/silent-refresh.html`,
    postLogoutRedirectUri: host,
    loginUrl: `${realm}/authorize`,
    logoutUrl: `${realm}/connect/endSession`,
    tokenEndpoint: `${realm}/access_token`,
    userinfoEndpoint: `${realm}/userinfo`,
    sessionCheckIFrameUrl: `${realm}/connect/checkSession`,
    revocationEndpoint: `${realm}/token/revoke`,
    ...(settings.scope !== undefined ? { scope: settings.scope } : {}),
  };
}
