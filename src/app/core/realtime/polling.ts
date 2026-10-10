import type { ApiClient } from '@core/api/api-client';
import type { AhoyEvent } from '@core/api/types';
import type { Clock, Timer } from './clock';

/** The cadence of the polling fallback (plan, lane 2B). */
export const POLLING = {
  /** `listStoryEvents` of each open voyage. */
  eventsMs: 3_000,
  /** `listStories`, through the stories store. */
  storiesMs: 10_000,
  /** Events asked for per call. */
  pageLimit: 500,
  /** Pages read per story per round, so one round never runs away. */
  maxPages: 10,
} as const;

/** What the fallback needs. */
export interface PollingDeps {
  readonly api: Pick<ApiClient, 'listStoryEvents'>;
  readonly clock: Clock;
  /** Hands an event over as if the stream had sent it. */
  readonly deliver: (event: AhoyEvent) => void;
  /** The last event id already delivered for a story, or null: polling resumes after it. */
  readonly cursor: (storyKey: string) => string | null;
  /** Asks for the story list to be read again (every {@link POLLING.storiesMs}). */
  readonly refreshStories: () => void;
}

/**
 * What runs while the stream is `degraded`: every 3 s, `listStoryEvents?after=` for each open voyage, whose events go out
 * as stream events would; every 10 s, a request to read the story list again. Rounds never overlap, a failed call is
 * simply tried again on the next round, and {@link stop} cancels everything.
 */
export class PollingFallback {
  private readonly watched = new Map<string, number>();
  private running = false;
  private generation = 0;
  private eventsTimer: Timer | null = null;
  private storiesTimer: Timer | null = null;

  constructor(private readonly deps: PollingDeps) {}

  /** Whether it is polling. */
  get active(): boolean {
    return this.running;
  }

  /** The stories being polled for events. */
  get stories(): readonly string[] {
    return [...this.watched.keys()];
  }

  /** Adds a story to the event polling until the returned function is called. */
  watch(storyKey: string): () => void {
    this.watched.set(storyKey, (this.watched.get(storyKey) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.watched.get(storyKey) ?? 1) - 1;
      if (count > 0) this.watched.set(storyKey, count);
      else this.watched.delete(storyKey);
    };
  }

  /** Starts polling. Does nothing when it already is. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    this.scheduleEvents(generation);
    this.scheduleStories(generation);
  }

  /** Stops polling and cancels the timers. A round in flight finishes, but its events are dropped. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    this.eventsTimer?.cancel();
    this.storiesTimer?.cancel();
    this.eventsTimer = null;
    this.storiesTimer = null;
  }

  private scheduleEvents(generation: number): void {
    this.eventsTimer = this.deps.clock.schedule(
      POLLING.eventsMs,
      () => void this.pollEvents(generation)
    );
  }

  private scheduleStories(generation: number): void {
    this.storiesTimer = this.deps.clock.schedule(POLLING.storiesMs, () => {
      if (generation !== this.generation) return;
      this.deps.refreshStories();
      this.scheduleStories(generation);
    });
  }

  private async pollEvents(generation: number): Promise<void> {
    for (const key of this.stories) {
      for (let page = 0; page < POLLING.maxPages; page++) {
        const after = this.deps.cursor(key);
        const result = await this.deps.api.listStoryEvents(key, {
          ...(after !== null ? { after } : {}),
          limit: POLLING.pageLimit,
        });
        if (generation !== this.generation) return;
        if (!result.ok) break;
        for (const event of result.value.items) this.deps.deliver(event);
        if (result.value.items.length < POLLING.pageLimit) break;
      }
    }
    if (generation === this.generation) this.scheduleEvents(generation);
  }
}
