import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import type { Subscription } from "rxjs";
import { ApiClient } from "@core/api/api-client";
import { isNotFound, ok, type ApiError, type ApiResult } from "@core/api/api-error";
import type { AhoyEvent, Story, StoryStatus } from "@core/api/types";
import { CLOCK, type Timer } from "@core/realtime/clock";
import { EventBus } from "@core/realtime/event-bus";
import { RUN_PROGRESS, isKnownEventType } from "@core/realtime/event-types";
import { IN_PORT } from "@domain/status";
import { releaseOnDestroy } from "./leases";
import { newestVersion, type ResourceStatus } from "./resource";

/** Stories asked for per page: the API's maximum (G4: the app loads them all and counts on the client). */
export const STORY_PAGE_LIMIT = 500;

/** At most this many pages (50 000 stories), so that a cursor that never ends cannot loop for ever. */
export const MAX_STORY_PAGES = 100;

/** How long events of one story are gathered before its one `getStory` (F5). */
export const STORY_REFRESH_DEBOUNCE_MS = 300;

/** The statuses that wait on a person: the "Needs you" inbox. */
export const NEEDS_YOU: readonly StoryStatus[] = ["awaiting_input", "awaiting_decision", "halted"];

/** The statuses of a voyage at sea: running, or queued to run. */
export const AT_SEA: readonly StoryStatus[] = ["running", "ready"];

/** How many stories there are in each status. */
export type StoryCounts = Readonly<Record<StoryStatus, number>>;

/** Most recently updated first, as `listStories` orders them; the key breaks ties. */
function byUpdatedDesc(a: Story, b: Story): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.key.localeCompare(b.key);
}

/** Longest waiting first; the key breaks ties. */
function byUpdatedAsc(a: Story, b: Story): number {
  return Date.parse(a.updatedAt) - Date.parse(b.updatedAt) || a.key.localeCompare(b.key);
}

/**
 * Every story, for the lists, the counts and the "Needs you" inbox (plan §5.4, G4).
 *
 * {@link loadAll} reads all pages of `listStories`. While someone {@link use}s the store it follows the event bus: any
 * known event of a story (except `run.progress`) gathers for 300 ms and then causes one `getStory` for it, which
 * inserts, updates or (on `404`) removes the story. While the stream is degraded the list is read again every 10 s.
 */
@Injectable({ providedIn: "root" })
export class StoriesStore {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(EventBus);
  private readonly clock = inject(CLOCK);

  private readonly byKey = signal<ReadonlyMap<string, Story>>(new Map());
  private readonly statusSignal = signal<ResourceStatus>("idle");
  private readonly errorSignal = signal<ApiError | null>(null);

  /** `idle` before the first load, `loading` during it, then `ready` or `error` (the list in hand is kept). */
  readonly status = this.statusSignal.asReadonly();
  /** The error of the last load, or null. */
  readonly error = this.errorSignal.asReadonly();

  /** Every story, most recently updated first. */
  readonly stories = computed(() => [...this.byKey().values()].sort(byUpdatedDesc));

  /** How many stories are in each status. */
  readonly counts = computed<StoryCounts>(() => {
    const counts: Record<StoryStatus, number> = {
      ready: 0,
      running: 0,
      awaiting_input: 0,
      awaiting_decision: 0,
      halted: 0,
      terminal: 0,
    };
    for (const story of this.byKey().values()) counts[story.status]++;
    return counts;
  });

  /** The "In port" count: Docked and Aground together (`terminal`). */
  readonly inPort = computed(() => this.counts()[IN_PORT]);

  /** Stories waiting on a person (`awaiting_input`, `awaiting_decision`, `halted`), longest waiting first. */
  readonly needsYou = computed(() =>
    [...this.byKey().values()].filter((s) => NEEDS_YOU.includes(s.status)).sort(byUpdatedAsc),
  );

  /** Stories at sea (`running`, `ready`), most recently updated first. */
  readonly atSea = computed(() => this.stories().filter((s) => AT_SEA.includes(s.status)));

  private loading: Promise<ApiResult<readonly Story[]>> | null = null;
  /** Stories set by `upsert` while a load is in flight: the load must not undo them. */
  private touched: Map<string, Story> | null = null;
  private stale = false;
  private users = 0;
  private subscriptions: Subscription[] = [];
  private readonly timers = new Map<string, Timer>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  /** One story by key, if the list has it. Reactive inside a `computed` or a template. */
  find(key: string): Story | undefined {
    return this.byKey().get(key);
  }

  /**
   * Reads every page of `listStories` (`limit=500`) until `nextCursor` is null and replaces the list. A load asked for
   * while one is in flight shares it. On an error the list in hand is kept.
   */
  loadAll(): Promise<ApiResult<readonly Story[]>> {
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  /** Puts a story in the list, or updates it, unless the list has a newer version: e.g. the `202` of a command. */
  upsert(story: Story): void {
    this.touched?.set(story.key, newestVersion(this.touched.get(story.key), story));
    this.byKey.update((map) => {
      const current = map.get(story.key);
      const next = newestVersion(current, story);
      if (next === current) return map;
      return new Map(map).set(story.key, next);
    });
  }

  /**
   * Keeps the list up to date while the caller needs it: loads it if it was never loaded (or went stale) and follows the
   * event bus, which this holds open. Call the returned function, or let `destroyRef` do it, to let go.
   */
  use(destroyRef?: DestroyRef): () => void {
    this.users++;
    if (this.users === 1) this.connect();
    let released = false;
    return releaseOnDestroy(() => {
      if (released) return;
      released = true;
      this.users--;
      if (this.users === 0) this.disconnect();
    }, destroyRef);
  }

  private connect(): void {
    this.subscriptions = [
      this.bus.events().subscribe((event) => this.onEvent(event)),
      this.bus.resync.subscribe(() => void this.loadAll()),
    ];
    if (this.statusSignal() === "idle" || this.stale) void this.loadAll();
  }

  private disconnect(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
    for (const timer of this.timers.values()) timer.cancel();
    this.timers.clear();
    // Nobody follows the events now: the next user reads the list again.
    this.stale = true;
  }

  private onEvent(event: AhoyEvent): void {
    if (event.type === RUN_PROGRESS || !isKnownEventType(event.type)) return;
    const key = event.storyKey;
    if (this.timers.has(key)) return;
    this.timers.set(
      key,
      this.clock.schedule(STORY_REFRESH_DEBOUNCE_MS, () => {
        this.timers.delete(key);
        void this.refreshStory(key);
      }),
    );
  }

  private async refreshStory(key: string): Promise<void> {
    const result = await this.api.getStory(key);
    if (result.ok) {
      this.upsert(result.value);
    } else if (isNotFound(result.error)) {
      this.byKey.update((map) => {
        if (!map.has(key)) return map;
        const next = new Map(map);
        next.delete(key);
        return next;
      });
    }
    // Any other failure keeps the story as it was; the next event or load tries again.
  }

  private async load(): Promise<ApiResult<readonly Story[]>> {
    if (this.statusSignal() !== "ready") this.statusSignal.set("loading");
    this.touched = new Map();
    const fetched = new Map<string, Story>();
    let cursor: string | null = null;
    try {
      for (let page = 0; page < MAX_STORY_PAGES; page++) {
        const result = await this.api.listStories({
          limit: STORY_PAGE_LIMIT,
          ...(cursor !== null ? { cursor } : {}),
        });
        if (!result.ok) {
          this.errorSignal.set(result.error);
          this.statusSignal.set("error");
          return result;
        }
        for (const story of result.value.items) fetched.set(story.key, story);
        cursor = result.value.nextCursor;
        if (cursor === null) break;
      }
      for (const [key, story] of this.touched) fetched.set(key, newestVersion(fetched.get(key), story));
      this.byKey.set(fetched);
      this.stale = false;
      this.errorSignal.set(null);
      this.statusSignal.set("ready");
      return ok(this.stories());
    } finally {
      this.touched = null;
    }
  }
}
