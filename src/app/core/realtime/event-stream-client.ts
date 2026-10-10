import { signal } from '@angular/core';
import { isEvent } from '@core/api/guards';
import type { AhoyEvent } from '@core/api/types';
import type { AuthStrategy } from '@core/auth/auth-strategy';
import type { Clock, Timer } from './clock';
import { isEventId } from './event-id';
import { parseSseStream, type SseMessage } from './sse';

/** Where the live stream stands. `offline` is also the state of a stream that was never started or was stopped. */
export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** The timing of reconnection (plan, lane 2B). */
export const RECONNECT = {
  /** The first delay. */
  initialMs: 1_000,
  /** The longest delay. */
  maxMs: 30_000,
  /** A connection that stays up this long resets the back-off and forgets earlier failures. */
  stableMs: 30_000,
  /** This many failures... */
  degradedFailures: 3,
  /** ...within this window make the stream `degraded`, which starts the polling fallback. */
  degradedWindowMs: 60_000,
} as const;

/**
 * The delay before reconnection attempt `attempt` (0 for the first): doubling from 1 s, at most 30 s, spread by ±20 %
 * (`random()` is in `[0, 1)`) so that many tabs do not come back at the same instant.
 */
export function reconnectDelay(attempt: number, random: () => number): number {
  const exponential = RECONNECT.initialMs * 2 ** Math.min(attempt, 16);
  return Math.min(
    RECONNECT.maxMs,
    Math.round(exponential * (0.8 + 0.4 * random()))
  );
}

/** What the client needs; all of it is injected so that tests run on fakes. */
export interface EventStreamDeps {
  readonly fetch: typeof fetch;
  readonly auth: AuthStrategy;
  /** The API base, such as `/api/v1`, without a trailing slash. */
  readonly base: string;
  readonly clock: Clock;
  readonly random: () => number;
  /** Receives each event that passed `isEvent`, in the order of the stream. Unknown types are passed on too. */
  readonly onEvent: (event: AhoyEvent) => void;
  /** Called after `status` or `degraded` changed. */
  readonly onChange?: () => void;
}

/** Which events to ask for. */
export interface EventStreamQuery {
  /** Only this story's events. */
  readonly story?: string;
  /** Start after this event id (used for the first connection only; reconnections send `Last-Event-ID`). */
  readonly after?: string;
}

/**
 * `GET /events/stream` read with `fetch` and {@link parseSseStream}.
 *
 * - Sends `Accept: text/event-stream`, the `AuthStrategy` headers, and `Last-Event-ID` when it reconnects.
 * - A 4xx answer (`401`, `403`...) is terminal: `offline`, and no retry, so a refused client does not hammer the API.
 * - A 5xx answer, a network error, an answer that is not an event stream and a stream that ends all reconnect, after
 *   {@link reconnectDelay}. A connection that stays up {@link RECONNECT.stableMs} resets the back-off.
 * - Three failures within 60 s make it `degraded` (the polling fallback runs); being live again clears that.
 * - Each `data:` is parsed as JSON and must pass `isEvent`; anything else is skipped.
 *
 * It uses no zone and keeps no subscription: {@link stop} aborts the request and cancels every timer.
 */
export class EventStreamClient {
  private readonly statusSignal = signal<StreamStatus>('offline');
  private readonly degradedSignal = signal(false);
  private readonly lastEventIdSignal = signal<string | null>(null);
  private readonly refusedSignal = signal<number | null>(null);

  /** `connecting`, `live`, `reconnecting` or `offline`. */
  readonly status = this.statusSignal.asReadonly();
  /** Whether the stream has failed too often lately: the cue for the polling fallback. */
  readonly degraded = this.degradedSignal.asReadonly();
  /** The id of the last event received: the stream resumes from it. */
  readonly lastEventId = this.lastEventIdSignal.asReadonly();
  /** The HTTP status that ended the stream for good (a 4xx), or null. */
  readonly refusedWith = this.refusedSignal.asReadonly();

  /** Bumped by `start` and `stop`: work begun under an older generation drops its result. */
  private generation = 0;
  private controller: AbortController | null = null;
  private retryTimer: Timer | null = null;
  private stableTimer: Timer | null = null;
  private attempt = 0;
  private failures: number[] = [];

  constructor(
    private readonly deps: EventStreamDeps,
    private readonly query: EventStreamQuery = {}
  ) {}

  /** Opens the stream. Does nothing when it is already open or opening. */
  start(): void {
    if (this.statusSignal() !== 'offline') return;
    this.generation++;
    this.attempt = 0;
    this.failures = [];
    this.refusedSignal.set(null);
    this.set('connecting', false);
    void this.connect(this.generation);
  }

  /** Closes the stream: aborts the request, cancels the timers, and leaves it `offline`. It can be started again. */
  stop(): void {
    this.generation++;
    this.clearTimers();
    this.controller?.abort();
    this.controller = null;
    this.set('offline', false);
  }

  private url(): string {
    const params = new URLSearchParams();
    if (this.query.story !== undefined) params.set('story', this.query.story);
    // Once the stream has seen an event, `Last-Event-ID` says where to resume; `after` is only for the first time.
    if (this.lastEventIdSignal() === null && this.query.after !== undefined)
      params.set('after', this.query.after);
    const search = params.toString();
    return `${this.deps.base}/events/stream${search === '' ? '' : `?${search}`}`;
  }

  private async connect(generation: number): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const current = () => generation === this.generation;
    try {
      const auth = await this.deps.auth.headers();
      if (!current()) return;
      const headers: Record<string, string> = {
        ...auth,
        Accept: 'text/event-stream',
      };
      const lastEventId = this.lastEventIdSignal();
      if (lastEventId !== null) headers['Last-Event-ID'] = lastEventId;
      const response = await this.deps.fetch(this.url(), {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!current()) return;
      if (response.status >= 400 && response.status < 500) {
        await discard(response);
        this.refuse(response.status);
        return;
      }
      if (!response.ok || response.body === null || !isEventStream(response)) {
        await discard(response);
        if (current()) this.fail(generation);
        return;
      }
      this.opened(generation);
      for await (const message of parseSseStream(response.body)) {
        if (!current()) return;
        this.receive(message);
      }
    } catch {
      // A network error, an aborted request, or an AuthStrategy that failed: all of them are a failed connection.
    }
    if (current()) this.fail(generation);
  }

  private opened(generation: number): void {
    this.set('live', false);
    this.stableTimer = this.deps.clock.schedule(RECONNECT.stableMs, () => {
      if (generation !== this.generation) return;
      this.attempt = 0;
      this.failures = [];
    });
  }

  private receive(message: SseMessage): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.data);
    } catch {
      parsed = undefined;
    }
    const id = isEventId(message.lastEventId)
      ? message.lastEventId
      : isEvent(parsed)
        ? parsed.id
        : null;
    if (id !== null) this.lastEventIdSignal.set(id);
    if (isEvent(parsed)) this.deps.onEvent(parsed);
  }

  private fail(generation: number): void {
    this.clearTimers();
    this.controller = null;
    const now = this.deps.clock.now().getTime();
    this.failures = [
      ...this.failures.filter((t) => now - t < RECONNECT.degradedWindowMs),
      now,
    ];
    const degraded =
      this.degradedSignal() ||
      this.failures.length >= RECONNECT.degradedFailures;
    this.set('reconnecting', degraded);
    const delay = reconnectDelay(this.attempt++, this.deps.random);
    this.retryTimer = this.deps.clock.schedule(delay, () => {
      if (generation === this.generation) void this.connect(generation);
    });
  }

  private refuse(status: number): void {
    this.generation++;
    this.clearTimers();
    this.controller = null;
    this.refusedSignal.set(status);
    this.set('offline', false);
  }

  private clearTimers(): void {
    this.retryTimer?.cancel();
    this.retryTimer = null;
    this.stableTimer?.cancel();
    this.stableTimer = null;
  }

  private set(status: StreamStatus, degraded: boolean): void {
    const changed =
      this.statusSignal() !== status || this.degradedSignal() !== degraded;
    this.statusSignal.set(status);
    this.degradedSignal.set(degraded);
    if (changed) this.deps.onChange?.();
  }
}

/** Whether an answer is an event stream; a dev server's HTML page with a 200 is not. */
function isEventStream(response: Response): boolean {
  const type = response.headers.get('Content-Type') ?? '';
  return type.toLowerCase().startsWith('text/event-stream');
}

/** Lets go of a body that will not be read. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
