/**
 * Readers for the plain values of `/config.json`: total functions that turn an untrusted value into a clean one, or
 * null when it is unusable. Shared by the app configuration and the sign-in settings.
 */

const CONTROL = /\p{Cc}/u;

/** Whether a document value is a JSON object: not null and not an array. */
export function isConfigRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A one-line text of 1 to 200 characters without control characters, trimmed, or null. */
export function readLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 200 && !CONTROL.test(trimmed)
    ? trimmed
    : null;
}

/** Which plain-http URLs a reader accepts: any, or only those on this machine (`localhost`, `127.0.0.1`). */
export type HttpAllowed = 'any' | 'local';

/** A parsed http(s) URL without credentials, query or fragment, or null; plain http only as `http` allows. */
function readPlainUrl(value: unknown, http: HttpAllowed): URL | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const scheme =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && (http === 'any' || local));
  const plain =
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '';
  return scheme && plain ? url : null;
}

/** A base URL (http(s), no credentials, query or fragment) without its trailing slashes, or null. */
export function readBaseUrl(value: unknown, http: HttpAllowed): string | null {
  const url = readPlainUrl(value, http);
  return url === null
    ? null
    : `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * An exact URL (http(s), no credentials, query or fragment), kept as written apart from surrounding spaces, or null.
 * For redirect URIs, which the identity provider compares character for character with the ones it has registered.
 */
export function readExactUrl(value: unknown, http: HttpAllowed): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return readPlainUrl(trimmed, http) === null ? null : trimmed;
}
