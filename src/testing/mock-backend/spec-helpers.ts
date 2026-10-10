/**
 * Helpers for the specs of the mock backend: a server on a {@link ManualClock} at a fixed instant (so every id, time and
 * hash is the same on every run), and a one-line way to call it.
 */
import contract from '@testing/fixtures/openapi.json';
import { ManualClock } from './clock';
import { isRecord, type MockRequest, type MockResponse } from './http';
import { MockAhoyServer, type MockServerOptions } from './server';
import type { SimulationTiming } from './simulator';

/** The instant the seeded history leads up to in specs: Tuesday 6 October 2026, 10:10 UTC (the wireframes' day). */
export const SEED_AT = '2026-10-06T10:10:00.000Z';

/** One second per simulated step, so a spec can count. */
export const SPEC_TIMING: SimulationTiming = {
  stepMs: 1_000,
  dispatchMs: 1_000,
  tickMs: 1_000,
  cancelMs: 500,
};

/** The actor specs act as. */
export const ACTOR = 'alex@example.com';

/** A mock server and its clock. */
export interface TestServer {
  readonly server: MockAhoyServer;
  readonly clock: ManualClock;
}

/** A seeded server on a manual clock at {@link SEED_AT}. */
export function testServer(
  options: Partial<Omit<MockServerOptions, 'contract' | 'clock'>> = {}
): TestServer {
  const clock = new ManualClock(SEED_AT);
  const server = new MockAhoyServer({
    contract,
    clock,
    timing: SPEC_TIMING,
    ...options,
  });
  return { server, clock };
}

/** What a call gave: the status, the headers and the body (JSON or text). */
export interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly response: MockResponse;
}

/** Calls the server like `curl` would, as {@link ACTOR} unless `headers` say otherwise. `target` may hold a query. */
export function call(
  server: MockAhoyServer,
  method: string,
  target: string,
  body?: unknown,
  headers: Readonly<Record<string, string>> = {}
): Answer {
  const url = new URL(target, 'http://mock.test');
  const request: MockRequest = {
    method,
    path: url.pathname,
    query: url.searchParams,
    headers: { 'x-ahoy-actor': ACTOR, ...lower(headers) },
    body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)),
  };
  const response = server.handle(request);
  const answerBody =
    response.kind === 'json' || response.kind === 'text' ? response.body : null;
  return {
    status: response.status,
    headers: response.headers,
    body: answerBody,
    response,
  };
}

/** A field of a JSON answer, for specs (throws when the body is not an object). */
export function field(answer: Answer, name: string): unknown {
  if (!isRecord(answer.body))
    throw new Error(`the answer (${answer.status}) is not an object`);
  return answer.body[name];
}

/** The `code` of a problem answer. */
export function problemCode(answer: Answer): unknown {
  return isRecord(answer.body) ? answer.body['code'] : undefined;
}

function lower(
  headers: Readonly<Record<string, string>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
}

/** Lets pending promise callbacks run: a few turns of the real event loop, with no delay. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++)
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

/** Reads a stream body as it arrives, so a spec can look at what came so far. */
export class StreamTap {
  text = '';
  done = false;
  error: unknown = null;
  private readonly decoder = new TextDecoder();

  constructor(body: ReadableStream<Uint8Array>) {
    void this.pump(body.getReader());
  }

  /** The `id:` of every message so far. */
  get ids(): string[] {
    return [...this.text.matchAll(/^id: (\d+)$/gm)].map((m) => m[1] ?? '');
  }

  /** The `event:` of every message so far. */
  get types(): string[] {
    return [...this.text.matchAll(/^event: (.+)$/gm)].map((m) => m[1] ?? '');
  }

  private async pump(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<void> {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          this.done = true;
          return;
        }
        this.text += this.decoder.decode(value, { stream: true });
      }
    } catch (error: unknown) {
      this.error = error;
    }
  }
}
