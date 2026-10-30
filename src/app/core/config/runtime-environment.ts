import {
  oidcEnvironment,
  readAuthSettings,
  type OidcEnvironment,
} from '@domain/auth-settings';
import { APP_CONFIG_TIMEOUT_MS, APP_CONFIG_URL } from './app-config';

/** The environment with the team's sign-in from `/config.json`, and what was wrong with the document's `auth`. */
export interface RuntimeEnvironment<E> {
  readonly environment: E;
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
  const unchanged = { environment, problems: [] };
  let document: unknown;
  try {
    const response = await request(APP_CONFIG_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(APP_CONFIG_TIMEOUT_MS),
    });
    if (!response.ok) return unchanged;
    document = JSON.parse(await response.text());
  } catch {
    return unchanged;
  }
  if (typeof document !== 'object' || document === null) return unchanged;
  const { settings, problems } = readAuthSettings(
    (document as { readonly auth?: unknown }).auth
  );
  if (settings === null) return { environment, problems };
  return {
    environment: { ...environment, ...oidcEnvironment(settings, origin) },
    problems,
  };
}
