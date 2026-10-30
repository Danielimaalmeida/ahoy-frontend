import { HttpClient } from '@angular/common/http';
import {
  InjectionToken,
  Injectable,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isRecord } from '@core/api/guard-kit';
import { normalizeQnumber } from '@domain/access';
import { readBaseUrl, readLine } from '@domain/config-values';

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
  /** The team's Jira base URL, for the Backlog's issue links; without it the Backlog shows no Jira link. */
  readonly jiraBaseUrl?: string;
  /**
   * The qnumbers allowed to use the app, lower-cased. Anyone else sees "Access denied". Without it the app does not
   * check and the API's `AHOY_ALLOWED_QNUMBERS` decides (it answers `403 forbidden`, which shows the same screen).
   */
  readonly allowedQnumbers?: readonly string[];
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

/**
 * The `allowedQnumbers` for a document value: an array of qnumbers, or a text with them separated by commas or spaces.
 * Lower-cased; null when it is neither, or when any entry is not a qnumber (one typo must not open or close the app
 * unnoticed).
 */
function readAllowedQnumbers(value: unknown): string[] | null {
  const entries = Array.isArray(value)
    ? (value as readonly unknown[])
    : typeof value === 'string'
      ? value.split(/[\s,]+/).filter((entry) => entry !== '')
      : null;
  if (entries === null) return null;
  const qnumbers: string[] = [];
  for (const entry of entries) {
    const qnumber = normalizeQnumber(entry);
    if (qnumber === null) return null;
    qnumbers.push(qnumber);
  }
  return qnumbers;
}

/** Whether a document sets a field: a missing field and a `null` both mean "not set". */
const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null;

/**
 * Reads a `/config.json` document. Everything in it is untrusted: a field that is not set (missing, `null`, or an empty
 * `jiraBaseUrl`, which leaves the Backlog without Jira links) takes its default, and so does one that is invalid, with a note in
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
  const actor = readLine(document['actor']);
  if (isSet(document['actor']) && actor === null) {
    problems.push(
      'actor must be 1 to 200 characters without control characters'
    );
  }
  const jiraBaseUrl =
    document['jiraBaseUrl'] === ''
      ? null
      : readBaseUrl(document['jiraBaseUrl'], 'any');
  if (
    isSet(document['jiraBaseUrl']) &&
    document['jiraBaseUrl'] !== '' &&
    jiraBaseUrl === null
  ) {
    problems.push(
      'jiraBaseUrl must be an http(s) URL without credentials, query or fragment'
    );
  }

  // An invalid list allows nobody rather than everybody: the app fails closed, as the API does.
  let allowedQnumbers: readonly string[] | undefined;
  if (isSet(document['allowedQnumbers'])) {
    const read = readAllowedQnumbers(document['allowedQnumbers']);
    allowedQnumbers = read ?? [];
    if (read === null)
      problems.push(
        'allowedQnumbers must be qnumbers (q then letters or digits), as an array or separated by commas (an invalid list allows nobody)'
      );
  }

  return {
    config: {
      apiBase: apiBase ?? DEFAULT_APP_CONFIG.apiBase,
      actor: actor ?? DEFAULT_APP_CONFIG.actor,
      ...(jiraBaseUrl !== null ? { jiraBaseUrl } : {}),
      ...(allowedQnumbers !== undefined ? { allowedQnumbers } : {}),
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

/** The `/config.json` document `main.ts` already read before start-up; `undefined` when there was none to read. */
export interface PreloadedAppConfig {
  readonly document: unknown;
}

/** Provided by `main.ts`, which reads `/config.json` for the sign-in, so that start-up does not fetch it twice. */
export const PRELOADED_APP_CONFIG = new InjectionToken<PreloadedAppConfig>(
  'PRELOADED_APP_CONFIG'
);

/** App initializer: reads `/config.json` before the app opens, so that nothing runs on defaults by accident. */
export async function initAppConfig(): Promise<void> {
  const store = inject(AppConfigStore);
  const preloaded = inject(PRELOADED_APP_CONFIG, { optional: true });
  const { config, problems } =
    preloaded === null
      ? await loadAppConfig(inject(HttpClient))
      : preloaded.document === undefined
        ? { config: DEFAULT_APP_CONFIG, problems: [] }
        : parseAppConfig(preloaded.document);
  for (const problem of problems)
    console.warn(`config.json: ${problem}; using the default`);
  store.set(config);
}
