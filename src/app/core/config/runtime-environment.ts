import {
  oidcEnvironment,
  readAuthSettings,
  type OidcEnvironment,
} from '@domain/auth-settings';
import { isConfigRecord } from '@domain/config-values';
import { APP_CONFIG_TIMEOUT_MS, APP_CONFIG_URL } from './app-config';

/** The environment with the team's sign-in from `/config.json`, the document it came from, and what was wrong with it. */
export interface RuntimeEnvironment<E> {
  readonly environment: E;
  /** The parsed `/config.json`, for `PRELOADED_APP_CONFIG`; `undefined` when there was no usable file. */
  readonly document: unknown;
  /** Why the document's `auth` is unusable. Not empty means the app must not start: it would sign in to the wrong realm. */
  readonly problems: readonly string[];
}

/**
 * Reads `/config.json` before the app starts (the auth library takes its settings when it is provided, so this cannot
 * wait for `initAppConfig`) and puts its `auth` realm and client over the build's `environment`. No file, a body that
 * is not JSON, a failed or stalled request, or no `auth` field keep the build's sign-in, which is how local builds run.
 */
export async function loadRuntimeEnvironment<E extends object>(
  environment: E,
  request: typeof fetch,
  origin: string
): Promise<RuntimeEnvironment<E & Partial<OidcEnvironment>>> {
  let document: unknown;
  try {
    const response = await request(APP_CONFIG_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(APP_CONFIG_TIMEOUT_MS),
    });
    if (!response.ok) return { environment, document: undefined, problems: [] };
    document = JSON.parse(await response.text());
  } catch {
    return { environment, document: undefined, problems: [] };
  }
  const auth = isConfigRecord(document) ? document['auth'] : undefined;
  const { settings, problems } = readAuthSettings(auth);
  if (settings === null) return { environment, document, problems };
  return {
    environment: { ...environment, ...oidcEnvironment(settings, origin) },
    document,
    problems,
  };
}
