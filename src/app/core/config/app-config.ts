import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isRecord } from '@core/api/guard-kit';

/**
 * Runtime configuration, read from `/config.json` at start-up. In production whatever serves the app (the nginx of the
 * image, lane 6D) provides the file. The dev server has none, and without it, or when it is invalid, the app runs on
 * {@link DEFAULT_APP_CONFIG}.
 */
export interface AppConfig {
  /** Base path of the API: a same-origin path such as `/api/v1` (F9). It is what `API_BASE` provides. */
  readonly apiBase: string;
  /**
   * Who the UI says you are. **Must match** the `AHOY_ACTOR` the dev proxy sends as `X-Ahoy-Actor` (`proxy.conf.mjs`),
   * or "(you)", the avatar and the owner checks will disagree with what the API records.
   */
  readonly actor: string;
  /** Base URL for "Open in Jira"; without it the button stays hidden (G13). */
  readonly jiraBaseUrl?: string;
}

/** Values used when `/config.json` is missing or invalid. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  apiBase: '/api/v1',
  actor: 'dev@example.com',
};

/** Where the runtime configuration is served from. */
export const APP_CONFIG_URL = '/config.json';

/** How long start-up waits for it: a stalled request must not keep the app from opening. */
export const APP_CONFIG_TIMEOUT_MS = 5_000;

/** A path on this origin: one `/`, then letters, digits and `._~%-/`. No scheme, no host, no `.` or `..` segment. */
const SAME_ORIGIN_PATH = /^\/(?!\/)[A-Za-z0-9._~%/-]+$/;
const DOT_SEGMENT = /(?:^|\/)\.\.?(?:\/|$)/;

/** What `parseAppConfig` made of a document: the configuration to use, and what was wrong with the document. */
export interface ParsedAppConfig {
  readonly config: AppConfig;
  /** One line per field that was refused (its default is used instead). Empty when the document was fine. */
  readonly problems: readonly string[];
}

/** The `apiBase` for a document value: a same-origin path without trailing slashes, or null. */
function readApiBase(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !SAME_ORIGIN_PATH.test(value) ||
    DOT_SEGMENT.test(value)
  )
    return null;
  const trimmed = value.replace(/\/+$/, '');
  return trimmed === '' ? null : trimmed;
}

/** The `actor` for a document value: 1 to 200 characters without control characters, or null. */
function readActor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 &&
    trimmed.length <= 200 &&
    !/\p{Cc}/u.test(trimmed)
    ? trimmed
    : null;
}

/** The `jiraBaseUrl` for a document value: an http(s) URL without credentials, query or fragment, or null. */
function readJiraBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const plain =
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '';
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !plain)
      return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Whether a document sets a field: a missing field and a `null` both mean "not set". */
const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null;

/**
 * Reads a `/config.json` document. Everything in it is untrusted: a field that is not set (missing, `null`, or an empty
 * `jiraBaseUrl`, which is how the file says "no Jira") takes its default, and so does one that is invalid, with a note in
 * `problems`. Fields the app does not know are ignored.
 */
export function parseAppConfig(document: unknown): ParsedAppConfig {
  if (!isRecord(document))
    return {
      config: DEFAULT_APP_CONFIG,
      problems: ['it must be a JSON object'],
    };
  const problems: string[] = [];

  const apiBase = readApiBase(document['apiBase']);
  if (isSet(document['apiBase']) && apiBase === null) {
    problems.push('apiBase must be a path on this origin, such as /api/v1');
  }
  const actor = readActor(document['actor']);
  if (isSet(document['actor']) && actor === null) {
    problems.push(
      'actor must be 1 to 200 characters without control characters'
    );
  }
  const jiraBaseUrl =
    document['jiraBaseUrl'] === ''
      ? null
      : readJiraBaseUrl(document['jiraBaseUrl']);
  if (
    isSet(document['jiraBaseUrl']) &&
    document['jiraBaseUrl'] !== '' &&
    jiraBaseUrl === null
  ) {
    problems.push(
      'jiraBaseUrl must be an http(s) URL without credentials, query or fragment'
    );
  }

  return {
    config: {
      apiBase: apiBase ?? DEFAULT_APP_CONFIG.apiBase,
      actor: actor ?? DEFAULT_APP_CONFIG.actor,
      ...(jiraBaseUrl !== null ? { jiraBaseUrl } : {}),
    },
    problems,
  };
}

/**
 * Fetches and reads `/config.json`. No file (404), a body that is not JSON (a server with an SPA fallback, such as nginx
 * with `try_files`, answers an unknown path with its `index.html`) and a request that fails or stalls all give the
 * defaults without a complaint: that is how the app runs without the file.
 */
export async function loadAppConfig(
  http: HttpClient
): Promise<ParsedAppConfig> {
  const defaults: ParsedAppConfig = {
    config: DEFAULT_APP_CONFIG,
    problems: [],
  };
  try {
    const body = await firstValueFrom(
      http.get(APP_CONFIG_URL, {
        responseType: 'text',
        cache: 'no-cache',
        timeout: APP_CONFIG_TIMEOUT_MS,
      })
    );
    let document: unknown;
    try {
      document = JSON.parse(body);
    } catch {
      return defaults;
    }
    return parseAppConfig(document);
  } catch {
    return defaults;
  }
}

/** Holds the runtime configuration: the defaults until `initAppConfig` has read `/config.json`. */
@Injectable({ providedIn: 'root' })
export class AppConfigStore {
  private readonly value = signal<AppConfig>(DEFAULT_APP_CONFIG);

  /** The configuration in force. */
  readonly config: Signal<AppConfig> = this.value.asReadonly();

  /** Replaces the configuration. Start-up calls it once; so do tests. */
  set(config: AppConfig): void {
    this.value.set(config);
  }
}

/** App initializer: reads `/config.json` before the app opens, so that nothing runs on defaults by accident. */
export async function initAppConfig(): Promise<void> {
  const http = inject(HttpClient);
  const store = inject(AppConfigStore);
  const { config, problems } = await loadAppConfig(http);
  for (const problem of problems)
    console.warn(`config.json: ${problem}; using the default`);
  store.set(config);
}
