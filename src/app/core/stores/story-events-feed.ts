import { DestroyRef, Injectable, computed, inject, signal, type Signal } from "@angular/core";
import type { Subscription } from "rxjs";
import { ApiClient } from "@core/api/api-client";
import type { ApiError } from "@core/api/api-error";
import type { AhoyEvent } from "@core/api/types";
import { compareEventIds } from "@core/realtime/event-id";
import { EventBus } from "@core/realtime/event-bus";
import { RUN_PROGRESS } from "@core/realtime/event-types";
import { readStoryEvents } from "./event-pages";
import { LeaseMap, releaseOnDestroy, type Disposable } from "./leases";
import type { ResourceStatus } from "./resource";
import { RunProgressBuffer } from "./run-progress-buffer";

/** Events kept per story (without `run.progress`); the oldest go first and `truncated` turns true. */
export const MAX_FEED_EVENTS = 2_000;

/** One story's event history, as a screen holds it. */
export interface StoryEventsHandle {
  readonly key: string;
  /** `loading` until the history is read, then `ready`, or `error` (what was read is kept). */
  readonly status: Signal<ResourceStatus>;
  readonly error: Signal<ApiError | null>;
  /** Every event but `run.progress`, oldest first. */
  readonly events: Signal<readonly AhoyEvent[]>;
  /** The same, newest first: the ship's log (G8: the API only gives them oldest first). */
  readonly newestFirst: Signal<readonly AhoyEvent[]>;
  /** Whether old events were let go to stay within {@link MAX_FEED_EVENTS}. */
  readonly truncated: Signal<boolean>;
  /** Reads what is new since the last read. */
  refresh(): Promise<void>;
  /** Lets go of the feed; the last holder's release stops it. */
  release(): void;
}

/** Merges events into a list in id order, once each, keeping at most {@link MAX_FEED_EVENTS}. */
function merge(
  current: readonly AhoyEvent[],
  incoming: readonly AhoyEvent[],
): { events: readonly AhoyEvent[]; dropped: boolean } {
  const fresh = incoming.filter((event) => event.type !== RUN_PROGRESS);
  if (fresh.length === 0) return { events: current, dropped: false };
  const last = current.at(-1);
  let events: AhoyEvent[];
  if (last !== undefined && fresh.every((event, i) => compareEventIds(event.id, (fresh[i - 1] ?? last).id) > 0)) {
    events = [...current, ...fresh];
  } else {
    const ids = new Set(current.map((event) => event.id));
    events = [...current];
    for (const event of fresh) {
      if (ids.has(event.id)) continue;
      ids.add(event.id);
      events.push(event);
    }
    events.sort((a, b) => compareEventIds(a.id, b.id));
  }
  const excess = events.length - MAX_FEED_EVENTS;
  return excess > 0 ? { events: events.slice(excess), dropped: true } : { events, dropped: false };
}

class FeedEntry implements Disposable {
  readonly status = signal<ResourceStatus>("idle");
  readonly error = signal<ApiError | null>(null);
  readonly events = signal<readonly AhoyEvent[]>([]);
  readonly newestFirst = computed(() => [...this.events()].reverse());
  readonly truncated = signal(false);

  private cursor: string | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private disposed = false;
  private readonly subscription: Subscription;
  private readonly unwatch: () => void;

  constructor(
    readonly key: string,
    private readonly api: ApiClient,
    bus: EventBus,
    private readonly progress: RunProgressBuffer,
  ) {
    // Follow the stream before reading the history, so nothing falls between the two; duplicates merge away.
    this.subscription = bus.eventsFor(key).subscribe((event) => this.add([event]));
    this.unwatch = bus.watchStory(key);
  }

  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.inFlight !== null) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.read().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  dispose(): void {
    this.disposed = true;
    this.subscription.unsubscribe();
    this.unwatch();
  }

  private async read(): Promise<void> {
    do {
      this.again = false;
      if (this.status() !== "ready") this.status.set("loading");
      const result = await readStoryEvents(
        this.api,
        this.key,
        this.cursor,
        (events) => this.add(events),
        () => this.disposed,
      );
      if (this.disposed) return;
      if (result.ok) {
        this.cursor = result.value;
        this.error.set(null);
        this.status.set("ready");
      } else {
        this.error.set(result.error);
        this.status.set("error");
      }
    } while (this.again);
  }

  private add(events: readonly AhoyEvent[]): void {
    if (this.disposed) return;
    this.progress.ingestAll(events);
    const merged = merge(this.events(), events);
    if (merged.events !== this.events()) this.events.set(merged.events);
    if (merged.dropped) this.truncated.set(true);
  }
}

/**
 * The event history of a story for the ship's log (G8): read from the start, 500 at a time, then kept up to date by the
 * stream. `run.progress` events are not kept here; they go to the {@link RunProgressBuffer}, so reading the history also
 * fills in the steps of runs that ended.
 */
@Injectable({ providedIn: "root" })
export class StoryEventsFeed {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(EventBus);
  private readonly progress = inject(RunProgressBuffer);
  private readonly feeds = new LeaseMap<string, FeedEntry>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.feeds.clear());
  }

  /**
   * Holds a story's feed: the first holder starts it (reads the history, follows the stream). Let go with `release`, or
   * pass `destroyRef` to let go when it is destroyed.
   */
  for(key: string, destroyRef?: DestroyRef): StoryEventsHandle {
    let created = false;
    const { entry, release } = this.feeds.acquire(key, () => {
      created = true;
      return new FeedEntry(key, this.api, this.bus, this.progress);
    });
    if (created) void entry.refresh();
    return {
      key,
      status: entry.status.asReadonly(),
      error: entry.error.asReadonly(),
      events: entry.events.asReadonly(),
      newestFirst: entry.newestFirst,
      truncated: entry.truncated.asReadonly(),
      refresh: () => entry.refresh(),
      release: releaseOnDestroy(release, destroyRef),
    };
  }
}
