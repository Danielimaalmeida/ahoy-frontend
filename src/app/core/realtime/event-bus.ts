import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import { Observable, Subject, filter } from "rxjs";
import { API_BASE, trimBase } from "@core/api/api-base";
import { ApiClient } from "@core/api/api-client";
import type { AhoyEvent } from "@core/api/types";
import { AUTH_STRATEGY } from "@core/auth/auth-strategy";
import { CLOCK, RANDOM } from "./clock";
import { compareEventIds } from "./event-id";
import { EventStreamClient, type StreamStatus } from "./event-stream-client";
import { FETCH } from "./fetch";
import { PollingFallback } from "./polling";

/** How many stories the bus remembers the last delivered event of (for de-duplication); the oldest go first. */
export const MAX_TRACKED_STORIES = 1_000;

/**
 * The one live connection of the app (F6): a single `GET /events/stream` for every story, shared by everything that
 * subscribes. It opens with the first subscriber and closes with the last.
 *
 * Events reach subscribers once each and in order per story, whether they came from the stream or from the polling
 * fallback that runs while the stream is `degraded`. The top bar reads {@link status} for its Live indicator.
 */
@Injectable({ providedIn: "root" })
export class EventBus {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);
  private readonly subject = new Subject<AhoyEvent>();
  private readonly resyncSubject = new Subject<void>();
  private readonly subscribersSignal = signal(0);
  /** The id of the last event delivered per story. */
  private readonly lastByStory = new Map<string, string>();

  private readonly client = new EventStreamClient({
    fetch: inject(FETCH),
    auth: inject(AUTH_STRATEGY),
    base: trimBase(inject(API_BASE)),
    clock: this.clock,
    random: inject(RANDOM),
    onEvent: (event) => this.deliver(event),
    onChange: () => this.syncPolling(),
  });

  private readonly polling = new PollingFallback({
    api: this.api,
    clock: this.clock,
    deliver: (event) => this.deliver(event),
    cursor: (key) => this.lastByStory.get(key) ?? null,
    refreshStories: () => this.resyncSubject.next(),
  });

  /** The state of the live connection: `offline` while nobody subscribes. */
  readonly status = computed<StreamStatus>(() => this.client.status());
  /** Whether the stream is failing and the polling fallback runs instead. */
  readonly degraded = computed(() => this.client.degraded());
  /** The id of the last event the stream sent. */
  readonly lastEventId = computed(() => this.client.lastEventId());
  /** The HTTP status that refused the stream for good (`401`...), or null. */
  readonly refusedWith = computed(() => this.client.refusedWith());
  /** How many subscriptions hold the connection open. */
  readonly subscribers = this.subscribersSignal.asReadonly();

  /**
   * Fires every 10 s while the stream is degraded: whoever keeps the story list reads it again (the list cannot be
   * rebuilt from events of stories nobody has open). Subscribing to it does not open the connection.
   */
  readonly resync: Observable<void> = this.resyncSubject.asObservable();

  private readonly events$ = new Observable<AhoyEvent>((subscriber) => {
    const inner = this.subject.subscribe(subscriber);
    this.attach();
    return () => {
      inner.unsubscribe();
      this.detach();
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.polling.stop();
      this.client.stop();
      this.subject.complete();
      this.resyncSubject.complete();
    });
  }

  /** Every event of every story. Subscribing opens the connection; the last unsubscription closes it. */
  events(): Observable<AhoyEvent> {
    return this.events$;
  }

  /** The events of one story. Subscribing holds the connection open like {@link events}. */
  eventsFor(storyKey: string): Observable<AhoyEvent> {
    return this.events$.pipe(filter((event) => event.storyKey === storyKey));
  }

  /**
   * Marks a story as open on screen: while the stream is degraded, its events are polled every 3 s. Call the returned
   * function when the screen closes.
   */
  watchStory(storyKey: string): () => void {
    return this.polling.watch(storyKey);
  }

  /** Whether the polling fallback is running. */
  get pollingActive(): boolean {
    return this.polling.active;
  }

  private attach(): void {
    this.subscribersSignal.update((n) => n + 1);
    if (this.subscribersSignal() === 1) this.client.start();
    this.syncPolling();
  }

  private detach(): void {
    this.subscribersSignal.update((n) => Math.max(0, n - 1));
    if (this.subscribersSignal() === 0) this.client.stop();
    this.syncPolling();
  }

  private syncPolling(): void {
    if (this.subscribersSignal() > 0 && this.client.degraded()) this.polling.start();
    else this.polling.stop();
  }

  /** Passes an event on unless that story already had it or a later one. */
  private deliver(event: AhoyEvent): void {
    const last = this.lastByStory.get(event.storyKey);
    if (last !== undefined && compareEventIds(event.id, last) <= 0) return;
    this.lastByStory.delete(event.storyKey);
    this.lastByStory.set(event.storyKey, event.id);
    if (this.lastByStory.size > MAX_TRACKED_STORIES) {
      const oldest = this.lastByStory.keys().next();
      if (oldest.done !== true) this.lastByStory.delete(oldest.value);
    }
    this.subject.next(event);
  }
}
