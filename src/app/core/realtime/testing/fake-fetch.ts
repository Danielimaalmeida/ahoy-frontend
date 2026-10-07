/** A body for an event-stream answer that a spec writes to piece by piece. For specs only. */
export class SseBody {
  readonly stream: ReadableStream<Uint8Array>;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private open = true;
  /** Whether the reader cancelled the body (the client let go of it). */
  cancelled = false;

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.cancelled = true;
        this.open = false;
      },
    });
  }

  /** Sends text, encoded as UTF-8. */
  send(text: string): void {
    this.sendBytes(new TextEncoder().encode(text));
  }

  /** Sends raw bytes. */
  sendBytes(bytes: Uint8Array): void {
    if (this.open) this.controller?.enqueue(new Uint8Array(bytes));
  }

  /** Sends one event as the API frames it: `id`, `event` and one `data` line. */
  sendEvent(event: { readonly id: string; readonly type: string }): void {
    this.send(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  /** Ends the body normally (the server closed the stream). */
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.controller?.close();
  }

  /** Breaks the body (the connection dropped). */
  fail(error: unknown = new TypeError("network error")): void {
    if (!this.open) return;
    this.open = false;
    this.controller?.error(error);
  }
}

/** A request the fake saw. */
export interface SeenRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly init: RequestInit;
  readonly signal: AbortSignal | null;
}

/** What the fake answers a request with. */
export type FakeAnswer = Response | Error | ((request: SeenRequest) => Promise<Response>);

/** An event-stream answer around `body`. */
export function sseResponse(body: SseBody, status = 200): Response {
  return new Response(body.stream, { status, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

/** A `problem+json` answer. */
export function problemResponse(status: number, code: string): Response {
  const problem = { type: `urn:ahoy:problem:${code}`, title: code.replaceAll("_", " "), status, code };
  return new Response(JSON.stringify(problem), { status, headers: { "Content-Type": "application/problem+json" } });
}

/**
 * A `fetch` for specs: it records each request and answers with the next queued answer. With nothing queued, a request
 * hangs until it is aborted. Aborting a request also breaks the body of an {@link SseBody} answer, as a real `fetch` does.
 */
export class FakeFetch {
  readonly requests: SeenRequest[] = [];
  private readonly answers: FakeAnswer[] = [];
  private readonly bodies = new Map<Response, SseBody>();

  /** Queues answers, in order. */
  answer(...answers: readonly FakeAnswer[]): void {
    this.answers.push(...answers);
  }

  /** Queues an event-stream answer and gives its body. */
  stream(): SseBody {
    const body = new SseBody();
    const response = sseResponse(body);
    this.bodies.set(response, body);
    this.answers.push(response);
    return body;
  }

  /** The last request. */
  get last(): SeenRequest | undefined {
    return this.requests.at(-1);
  }

  readonly fetch: typeof fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const signal = init.signal ?? null;
    const request: SeenRequest = {
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      init,
      signal,
    };
    this.requests.push(request);
    const aborted = () => new DOMException("The operation was aborted.", "AbortError");
    if (signal?.aborted === true) return Promise.reject(aborted());
    const next = this.answers.shift();
    if (next === undefined) {
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(aborted())));
    }
    if (next instanceof Error) return Promise.reject(next);
    if (typeof next === "function") return next(request);
    const body = this.bodies.get(next);
    if (body !== undefined) signal?.addEventListener("abort", () => body.fail(aborted()));
    return Promise.resolve(next);
  };
}
