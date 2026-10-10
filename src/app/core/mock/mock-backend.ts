import type {
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import {
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
} from '@angular/common/http';
import { InjectionToken, inject, type Provider } from '@angular/core';
import { API_BASE, trimBase } from '@core/api/api-base';
import { CurrentUser } from '@core/auth/current-user';
import { FETCH } from '@core/realtime/fetch';
import { createMockFetch } from '@testing/mock-backend/fetch-adapter';
import type { MockRequest, MockResponse } from '@testing/mock-backend/http';
import {
  MockAhoyServer,
  type MockServerOptions,
} from '@testing/mock-backend/server';
import contract from '@testing/fixtures/openapi.json';
import { Observable } from 'rxjs';

/**
 * Dev-only providers of the mock backend (lane 2D): the `mock` configuration (`npm run start:mock`) and specs use them;
 * the production build never reaches this file.
 */

/** The mock server the providers below answer from. */
export const MOCK_SERVER = new InjectionToken<MockAhoyServer>('MOCK_SERVER');

/** A mock server on the vendored contract (`src/testing/fixtures/openapi.json`, the parsed `openapi/ahoy-v1.yaml`). */
export function createMockServer(
  options: Omit<MockServerOptions, 'contract'> = {}
): MockAhoyServer {
  return new MockAhoyServer({ ...options, contract });
}

/**
 * `MOCK_SERVER` and a `FETCH` that serves the API (and `/events/stream`) from it, sending the current user as
 * `X-Ahoy-Actor`, as the dev proxy does. Pair it with `withInterceptors([mockBackendInterceptor])` for `HttpClient`.
 */
export function provideMockBackend(server: MockAhoyServer): Provider[] {
  return [
    { provide: MOCK_SERVER, useValue: server },
    {
      provide: FETCH,
      useFactory: () => {
        const user = inject(CurrentUser);
        return createMockFetch(server, {
          base: trimBase(inject(API_BASE)),
          actor: () => user.id(),
          fallback: (input, init) => globalThis.fetch(input, init),
        });
      },
    },
  ];
}

/**
 * Answers `HttpClient` requests under `API_BASE` from `MOCK_SERVER`, as the wire would: `problem+json` errors become
 * `HttpErrorResponse`s with the problem as `error`, a 304 too (as Angular's fetch backend does), and every JSON body is
 * a fresh copy. Waits `switches.latencyMs` on the server's clock. Other URLs go on to the next handler.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const server = inject(MOCK_SERVER, { optional: true });
  if (server === null) return next(req);
  const base = trimBase(inject(API_BASE));
  const url = new URL(req.urlWithParams, 'http://mock.invalid');
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
    return next(req);
  const user = inject(CurrentUser);

  const headers: Record<string, string> = {};
  for (const name of req.headers.keys())
    headers[name.toLowerCase()] = req.headers.getAll(name)?.join(', ') ?? '';
  headers['x-ahoy-actor'] ??= user.id();
  const request: MockRequest = {
    method: req.method,
    path: url.pathname.slice(base.length) || '/',
    query: url.searchParams,
    headers,
    // Through the wire and back: the mock never holds the caller's object, and the caller never holds the mock's.
    body:
      req.body === null || req.body === undefined
        ? undefined
        : JSON.parse(JSON.stringify(req.body)),
  };

  return new Observable<HttpEvent<unknown>>((subscriber) => {
    const answer = (): void => {
      const event = toHttpEvent(server.handle(request), req);
      if (event instanceof HttpErrorResponse) subscriber.error(event);
      else {
        subscriber.next(event);
        subscriber.complete();
      }
    };
    const latency = server.switches.latencyMs;
    if (latency <= 0) {
      answer();
      return undefined;
    }
    return server.clock.schedule(latency, answer);
  });
};

/** A mock answer as `HttpClient` hands it over. */
function toHttpEvent(
  response: MockResponse,
  req: HttpRequest<unknown>
): HttpResponse<unknown> | HttpErrorResponse {
  const headers = new HttpHeaders({ ...response.headers });
  const init = {
    status: response.status,
    statusText: '',
    headers,
    url: req.urlWithParams,
  };
  let body: unknown = null;
  if (response.kind === 'json')
    body =
      req.responseType === 'text'
        ? JSON.stringify(response.body)
        : response.body;
  else if (response.kind === 'text') body = response.body;
  else if (response.kind === 'stream') {
    response.stream.abort(new Error('HttpClient cannot read an event stream'));
    return new HttpErrorResponse({
      ...init,
      status: 0,
      error: 'HttpClient cannot read an event stream; use FETCH',
    });
  }
  if (response.status >= 200 && response.status < 300)
    return new HttpResponse({ ...init, body });
  return new HttpErrorResponse({ ...init, error: body });
}
