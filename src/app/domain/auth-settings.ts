import {
  isConfigRecord,
  readBaseUrl,
  readExactUrl,
  readLine,
} from './config-values';

/**
 * The team's WebEAM sign-in, read at runtime from `/config.json` (`auth`) so that one image serves every team. Only the
 * realm and the client differ between teams; every endpoint follows from the realm, as WebEAM lays them out, and every
 * redirect from the page's origin unless the team's client registered other ones.
 */
export interface AuthSettings {
  /** The realm, such as `https://sso.example.com/auth/oauth2/realms/root/realms/alpha`, without a trailing slash. */
  readonly realmUrl: string;
  /** The front end's own WebEAM client. */
  readonly clientId: string;
  /** The scopes asked for; the build's own when absent. */
  readonly scope?: string;
  /** Where WebEAM sends the browser after sign-in, exactly as registered; `<origin>/` when absent. */
  readonly redirectUri?: string;
  /** Where it sends the browser after sign-out, exactly as registered; `<origin>/` when absent. */
  readonly postLogoutRedirectUri?: string;
  /** The silent-refresh page, exactly as registered; `<origin>/ui/oauth/silent-refresh.html` when absent. */
  readonly silentRefreshRedirectUri?: string;
  /** Whether the auth library logs its debug information to the console; off unless `true`. */
  readonly debug?: boolean;
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
  readonly showDebugInformation: boolean;
  readonly scope?: string;
}

/** What `readAuthSettings` made of a document's `auth`: null when it is absent or unusable, with why. */
export interface ReadAuthSettings {
  readonly settings: AuthSettings | null;
  readonly problems: readonly string[];
}

const REDIRECTS = [
  'redirectUri',
  'postLogoutRedirectUri',
  'silentRefreshRedirectUri',
] as const;

/** Whether a document sets a field: a missing field and a `null` both mean "not set". */
const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null;

/**
 * Reads the `auth` field of a `/config.json` document. Absent (or `null`) gives no settings and no problem: the build's
 * own sign-in stays in force. Present but unusable gives no settings and says why, so the app never signs in against a
 * half-configured realm.
 */
export function readAuthSettings(value: unknown): ReadAuthSettings {
  if (!isSet(value)) return { settings: null, problems: [] };
  if (!isConfigRecord(value))
    return { settings: null, problems: ['auth must be a JSON object'] };
  const problems: string[] = [];
  const realmUrl = readBaseUrl(value['realmUrl'], 'local');
  if (realmUrl === null)
    problems.push(
      'auth.realmUrl must be an https URL without credentials, query or fragment'
    );
  const clientId = readLine(value['clientId']);
  if (clientId === null)
    problems.push('auth.clientId must be 1 to 200 characters on one line');
  const scope = isSet(value['scope']) ? readLine(value['scope']) : null;
  if (isSet(value['scope']) && scope === null)
    problems.push('auth.scope must be 1 to 200 characters on one line');
  const redirects: Partial<Record<(typeof REDIRECTS)[number], string>> = {};
  for (const key of REDIRECTS) {
    if (!isSet(value[key])) continue;
    const uri = readExactUrl(value[key], 'local');
    if (uri === null)
      problems.push(
        `auth.${key} must be an https URL without credentials, query or fragment`
      );
    else redirects[key] = uri;
  }
  const debug = value['debug'];
  if (isSet(debug) && typeof debug !== 'boolean')
    problems.push('auth.debug must be true or false');
  if (realmUrl === null || clientId === null || problems.length > 0)
    return { settings: null, problems };
  return {
    settings: {
      realmUrl,
      clientId,
      ...(scope !== null ? { scope } : {}),
      ...redirects,
      ...(debug === true ? { debug } : {}),
    },
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
    redirectUri: settings.redirectUri ?? `${host}/`,
    silentRefreshRedirectUri:
      settings.silentRefreshRedirectUri ??
      `${host}/ui/oauth/silent-refresh.html`,
    postLogoutRedirectUri: settings.postLogoutRedirectUri ?? `${host}/`,
    loginUrl: `${realm}/authorize`,
    logoutUrl: `${realm}/connect/endSession`,
    tokenEndpoint: `${realm}/access_token`,
    userinfoEndpoint: `${realm}/userinfo`,
    sessionCheckIFrameUrl: `${realm}/connect/checkSession`,
    revocationEndpoint: `${realm}/token/revoke`,
    showDebugInformation: settings.debug === true,
    ...(settings.scope !== undefined ? { scope: settings.scope } : {}),
  };
}
