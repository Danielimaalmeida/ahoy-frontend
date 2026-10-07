/**
 * `GET /events/stream` of the mock: Server-Sent Events as a `ReadableStream`, framed like the real API
 * (`apps/api/src/server.ts`): `: connected` first, then `id:`, `event:` and one `data:` line per event, ids increasing,
 * every event after `Last-Event-ID` (or `after`) replayed before new ones, and `: keepalive` when the stream was idle.
 */
import type { AhoyEvent } from "@core/api/types";
import type { Cancel, MockClock } from "./clock";
import type { MockStream } from "./http";
import { eventDto } from "./voyage";

/** How long a stream may stay silent before it gets a `: keepalive` (the real API's default). */
export const KEEPALIVE_MS = 15_000;

interface Subscriber {
  readonly story: string | null;
  /** The id the stream has reached: only later events are sent. */
  after: number;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
  lastWrite: number;
  open: boolean;
}

/** The text of one SSE message for an event. */
export function sseFrame(event: AhoyEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** The open event streams of one mock server. */
export class StreamHub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly encoder = new TextEncoder();
  private readonly clock: MockClock;
  private readonly keepaliveMs: number;
  private keepaliveTimer: Cancel | null = null;

  constructor(clock: MockClock, keepaliveMs = KEEPALIVE_MS) {
    this.clock = clock;
    this.keepaliveMs = keepaliveMs;
  }

  /** How many streams are open. */
  get open(): number {
    return this.subscribers.size;
  }

  /**
   * Opens a stream that first replays `history` (the events after `after`, already filtered), then follows
   * {@link publish} with every later event.
   */
  connect(story: string | null, after: number, history: readonly AhoyEvent[]): MockStream {
    let subscriber: Subscriber | null = null;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        subscriber = { story, after, controller, lastWrite: this.clock.now(), open: true };
        this.subscribers.add(subscriber);
        this.write(subscriber, ": connected\n\n");
        for (const event of history) this.send(subscriber, event);
        this.armKeepalive();
      },
      cancel: () => {
        if (subscriber) this.remove(subscriber);
      },
    });
    return {
      body,
      abort: (reason?: unknown) => {
        if (subscriber) this.fail(subscriber, reason);
      },
    };
  }

  /** Sends a new event to every open stream that wants it. */
  publish(event: AhoyEvent): void {
    for (const subscriber of [...this.subscribers])
      if (subscriber.story === null || subscriber.story === event.storyKey) this.send(subscriber, event);
  }

  /** Breaks every open stream, as a dropped connection would; clients reconnect with `Last-Event-ID`. */
  dropAll(reason: unknown = new TypeError("the mock dropped the event stream")): number {
    const count = this.subscribers.size;
    for (const subscriber of [...this.subscribers]) this.fail(subscriber, reason);
    return count;
  }

  /** Ends every open stream normally (the server is closing). */
  closeAll(): void {
    for (const subscriber of [...this.subscribers]) {
      this.remove(subscriber);
      try {
        subscriber.controller.close();
      } catch {
        // Already closed or errored by its reader.
      }
    }
  }

  private send(subscriber: Subscriber, event: AhoyEvent): void {
    const id = Number(event.id);
    if (id <= subscriber.after) return;
    subscriber.after = id;
    this.write(subscriber, sseFrame(eventDto(event)));
  }

  private write(subscriber: Subscriber, text: string): void {
    if (!subscriber.open) return;
    try {
      subscriber.controller.enqueue(this.encoder.encode(text));
      subscriber.lastWrite = this.clock.now();
    } catch {
      this.remove(subscriber);
    }
  }

  private fail(subscriber: Subscriber, reason: unknown): void {
    if (!subscriber.open) return;
    this.remove(subscriber);
    try {
      subscriber.controller.error(reason);
    } catch {
      // Already closed.
    }
  }

  private remove(subscriber: Subscriber): void {
    subscriber.open = false;
    this.subscribers.delete(subscriber);
    if (this.subscribers.size === 0) {
      this.keepaliveTimer?.();
      this.keepaliveTimer = null;
    }
  }

  /** Wakes when the stream that wrote longest ago has been silent for `keepaliveMs`, so none waits longer. */
  private armKeepalive(): void {
    if (this.keepaliveTimer !== null || this.subscribers.size === 0) return;
    const lastWrite = Math.min(...[...this.subscribers].map((s) => s.lastWrite));
    this.keepaliveTimer = this.clock.schedule(Math.max(0, lastWrite + this.keepaliveMs - this.clock.now()), () => {
      this.keepaliveTimer = null;
      const now = this.clock.now();
      for (const subscriber of [...this.subscribers])
        if (now - subscriber.lastWrite >= this.keepaliveMs) this.write(subscriber, ": keepalive\n\n");
      this.armKeepalive();
    });
  }
}
