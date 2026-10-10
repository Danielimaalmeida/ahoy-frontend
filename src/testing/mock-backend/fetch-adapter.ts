/**
 * A `fetch` that answers the API's URLs from a {@link MockAhoyServer} and hands every other URL to a real `fetch`. It
 * serves `GET /events/stream` too (a `ReadableStream` body, broken when the request is aborted), so the event stream
 * client of lane 2B runs on it unchanged. Used by the browser in the `mock` configuration and by specs.
 */
import type { MockRequest, MockResponse } from './http';
import type { MockAhoyServer } from './server';

/** How a mock `fetch` behaves. */
export interface MockFetchOptions {
  /** The API base the app calls (`/api/v1`). */
  readonly base?: string;
  /** What answers URLs outside the API (`/config.json`, assets); by default they fail as a network error. */
  readonly fallback?: typeof fetch;
  /** The actor sent as `X-Ahoy-Actor` when the request has none (what the dev proxy does for `AHOY_AUTH=dev`). */
  readonly actor?: () => string | null;
  /** The origin relative URLs are read against. */
  readonly origin?: string;
  /** Runs before each API request (the browser reads the `localStorage` switches here). */
  readonly beforeEach?: () => void;
}

/** A `fetch` served by the mock. */
export function createMockFetch(
  server: MockAhoyServer,
  options: MockFetchOptions = {}
): typeof fetch {
  const base = (options.base ?? '/api/v1').replace(/\/+$/, '');
  const origin =
    options.origin ?? globalThis.location?.origin ?? 'http://localhost';
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      origin
    );
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) {
      if (options.fallback) return options.fallback(input, init);
      throw new TypeError(`mock fetch: no fallback for ${url.pathname}`);
    }
    const request = input instanceof Request ? input : new Request(url, init);
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    options.beforeEach?.();
    await wait(server, server.switches.latencyMs, signal);
    const mockRequest = await toMockRequest(
      request,
      url,
      base,
      options.actor?.() ?? null
    );
    throwIfAborted(signal);
    return toResponse(server.handle(mockRequest), signal);
  };
}

/** Reads a `Request` into the mock's shape. */
export async function toMockRequest(
  request: Request,
  url: URL,
  base: string,
  actor: string | null
): Promise<MockRequest> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  if (actor !== null && headers['x-ahoy-actor'] === undefined)
    headers['x-ahoy-actor'] = actor;
  const text =
    request.method === 'GET' || request.method === 'HEAD'
      ? ''
      : await request.text();
  let body: unknown = undefined;
  let bodyIsInvalidJson = false;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
      bodyIsInvalidJson = true;
    }
  }
  return {
    method: request.method,
    path: url.pathname.slice(base.length) || '/',
    query: url.searchParams,
    headers,
    body,
    ...(bodyIsInvalidJson ? { bodyIsInvalidJson } : {}),
  };
}

/** Turns a mock answer into a `Response`. An aborted request breaks a stream body, as a real `fetch` does. */
export function toResponse(
  response: MockResponse,
  signal: AbortSignal | null = null
): Response {
  const init = { status: response.status, headers: response.headers };
  switch (response.kind) {
    case 'json':
      return new Response(JSON.stringify(response.body), init);
    case 'text':
      return new Response(response.body, init);
    case 'empty':
      return new Response(null, init);
    case 'stream': {
      const { stream } = response;
      if (signal) {
        if (signal.aborted) stream.abort(abortError());
        else
          signal.addEventListener('abort', () => stream.abort(abortError()), {
            once: true,
          });
      }
      return new Response(stream.body, init);
    }
  }
}

/** Waits `ms` on the server's clock; an abort rejects at once. */
function wait(
  server: MockAhoyServer,
  ms: number,
  signal: AbortSignal | null
): Promise<void> {
  throwIfAborted(signal);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cancel = server.clock.schedule(ms, () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
    const onAbort = (): void => {
      cancel();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException('The request was aborted', 'AbortError');
}
