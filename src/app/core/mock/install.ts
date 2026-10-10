import { DEFAULT_APP_CONFIG } from '@core/config/app-config';
import { createMockFetch } from '@testing/mock-backend/fetch-adapter';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import {
  applyQuerySwitches,
  applyStorageSwitches,
  SWITCH_PREFIX,
  type SwitchStorage,
} from '@testing/mock-backend/switches';
import { createMockServer } from './mock-backend';

/** What `installMockBackend` reads from the page; specs pass fakes. */
export interface MockInstallHost {
  /** The global object whose `fetch` is replaced. */
  readonly global: { fetch: typeof fetch };
  readonly storage: SwitchStorage | null;
  /** The page's query string, such as `?ahoy.mock.latencyMs=300`. */
  readonly search: string;
  readonly log: (message: string) => void;
}

/** The browser's own host: `globalThis`, `localStorage` (when the page may use it) and `location.search`. */
function browserHost(): MockInstallHost {
  let storage: SwitchStorage | null = null;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = null;
  }
  return {
    global: globalThis,
    storage,
    search: globalThis.location?.search ?? '',
    log: (message) => console.info(message),
  };
}

/**
 * Puts the mock backend behind the page's `fetch`, for the `mock` configuration (`npm run start:mock`, via
 * `src/environments/environment.mock.ts`). Angular's `HttpClient` (`withFetch`) and the event stream (`FETCH`) both call
 * `fetch` per request, so every `/api/v1` request is answered by the mock and everything else (`/config.json`, assets)
 * goes to the real `fetch`. It needs no change to `app.config.ts`.
 *
 * The actor is what the dev proxy would send: `localStorage["ahoy.mock.actor"]`, else `DEFAULT_APP_CONFIG.actor`. The
 * switches are read once from the query string and before each request from `localStorage` (`ahoy.mock.failNext`...).
 * The server is also on `globalThis.ahoyMock` for the browser console (`ahoyMock.dropStreams()`, `ahoyMock.reset()`).
 */
export function installMockBackend(
  host: MockInstallHost = browserHost()
): MockAhoyServer {
  const server = createMockServer();
  const realFetch = host.global.fetch.bind(host.global);
  const read = (key: string): string | null => {
    try {
      return host.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const fromQuery = applyQuerySwitches(server, host.search);
  host.global.fetch = createMockFetch(server, {
    fallback: realFetch,
    actor: () => read(`${SWITCH_PREFIX}actor`) ?? DEFAULT_APP_CONFIG.actor,
    beforeEach: () => {
      const applied = applyStorageSwitches(server, host.storage);
      if (applied.length > 0) host.log(`Ahoy mock: ${applied.join(', ')}`);
    },
  });
  Object.assign(host.global, { ahoyMock: server });
  host.log(
    `Ahoy mock backend: /api/v1 is answered in the browser (fictional data, 0 AIU)` +
      (fromQuery.length > 0 ? `; ${fromQuery.join(', ')}` : '')
  );
  return server;
}
