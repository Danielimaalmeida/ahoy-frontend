import { DestroyRef, Injectable, inject } from "@angular/core";
import type { Subscription } from "rxjs";
import { ApiClient } from "@core/api/api-client";
import type {
  AhoyEvent,
  ArtifactList,
  GateRecord,
  ModelPlan,
  Question,
  Run,
  Story,
  StoryStateDocument,
} from "@core/api/types";
import { CLOCK, type Clock, type Timer } from "@core/realtime/clock";
import { EventBus } from "@core/realtime/event-bus";
import { isKnownEventType, type KnownEventType } from "@core/realtime/event-types";
import { LeaseMap, releaseOnDestroy, type Disposable } from "./leases";
import { StoreResource, newestVersion } from "./resource";
import { StoriesStore } from "./stories-store";
import { StoryEventsFeed, type StoryEventsHandle } from "./story-events-feed";

/** The resources of a voyage that are read with one GET each. The event history is {@link StoryHandle.events}. */
export const STORY_RESOURCES = ["story", "state", "runs", "questions", "gates", "models", "artifacts"] as const;
export type StoryResourceName = (typeof STORY_RESOURCES)[number];

/** How long events are gathered before the resources they touch are read again (F5). */
export const RESOURCE_REFRESH_DEBOUNCE_MS = 300;

/**
 * Which resources each known event makes stale (F5: refetch, never patch). `run.progress` touches none: it goes to the
 * `RunProgressBuffer`. Types this version does not know touch none either, as the contract asks.
 */
export const STALE_AFTER: Readonly<Record<KnownEventType, readonly StoryResourceName[]>> = {
  "story.started": ["story", "state", "models"],
  "story.halted": ["story", "state", "runs"],
  "story.resumed": ["story", "state"],
  "story.budget_changed": ["story"],
  "story.models_changed": ["story", "models"],
  "story.phase_changed": ["story", "state"],
  "story.awaiting_input": ["story", "questions"],
  "story.awaiting_decision": ["story", "state", "gates"],
  "story.unblocked": ["story", "state"],
  "story.routed": ["story", "state"],
  "run.queued": ["story", "runs"],
  "run.dispatched": ["story", "runs"],
  "run.finished": ["story", "runs"],
  "gate.evaluated": ["story", "runs", "gates"],
  "question.asked": ["story", "questions"],
  "question.answered": ["story", "questions"],
  "decision.recorded": ["story", "state", "gates"],
  "consensus.resolved": ["story", "state", "gates"],
  "work_package.decided": ["story", "state"],
  "work.reopened": ["story", "state"],
  "artifacts.updated": ["state", "artifacts"],
  "implementation.reported": ["state"],
  "review.reported": ["state", "gates"],
  "run.progress": [],
};

/** What every resource offers, whatever its value. */
interface AnyResource {
  readonly status: StoreResource<unknown>["status"];
  refresh(): Promise<void>;
  dispose(): void;
}

/** One open voyage, as a screen holds it. */
export interface StoryHandle {
  readonly key: string;
  readonly story: StoreResource<Story>;
  readonly state: StoreResource<StoryStateDocument>;
  readonly runs: StoreResource<readonly Run[]>;
  readonly questions: StoreResource<readonly Question[]>;
  readonly gates: StoreResource<readonly GateRecord[]>;
  readonly models: StoreResource<ModelPlan>;
  readonly artifacts: StoreResource<ArtifactList>;
  /**
   * Marks resources as observed by this holder: each is read now if it never was or went stale, and read again (300 ms
   * after the events that touch it) for as long as someone observes it.
   */
  watch(...names: readonly StoryResourceName[]): void;
  /** The story's event history, held with this handle (see `StoryEventsFeed`). Not after `release`. */
  events(): StoryEventsHandle;
  /** Lets go: stops observing, and the last holder's release stops the voyage's subscriptions and timers. */
  release(): void;
}

class StoryEntry implements Disposable {
  readonly story: StoreResource<Story>;
  readonly state: StoreResource<StoryStateDocument>;
  readonly runs: StoreResource<readonly Run[]>;
  readonly questions: StoreResource<readonly Question[]>;
  readonly gates: StoreResource<readonly GateRecord[]>;
  readonly models: StoreResource<ModelPlan>;
  readonly artifacts: StoreResource<ArtifactList>;

  private readonly byName: Readonly<Record<StoryResourceName, AnyResource>>;
  private readonly watchers = new Map<StoryResourceName, number>();
  /** Touched by an event while nobody observed it: read again when someone does. */
  private readonly stale = new Set<StoryResourceName>();
  /** Touched by an event and observed: read again when the debounce ends. */
  private readonly dirty = new Set<StoryResourceName>();
  private timer: Timer | null = null;
  private readonly subscription: Subscription;
  private readonly unwatchStory: () => void;

  constructor(
    readonly key: string,
    api: ApiClient,
    bus: EventBus,
    private readonly clock: Clock,
    stories: StoriesStore,
  ) {
    this.story = new StoreResource(async () => {
      const result = await api.getStory(key);
      // The list shows the same story: keep it in step.
      if (result.ok) stories.upsert(result.value);
      return result;
    }, newestVersion);
    this.state = new StoreResource(() => api.getStoryState(key), newestVersion);
    this.runs = new StoreResource(() => api.listStoryRuns(key));
    this.questions = new StoreResource(() => api.listQuestions(key));
    this.gates = new StoreResource(() => api.listGateRecords(key));
    this.models = new StoreResource(() => api.getStoryModels(key), newestVersion);
    this.artifacts = new StoreResource(() => api.listArtifacts(key));
    this.byName = {
      story: this.story,
      state: this.state,
      runs: this.runs,
      questions: this.questions,
      gates: this.gates,
      models: this.models,
      artifacts: this.artifacts,
    };
    this.subscription = bus.eventsFor(key).subscribe((event) => this.onEvent(event));
    this.unwatchStory = bus.watchStory(key);
  }

  watch(name: StoryResourceName): void {
    const count = (this.watchers.get(name) ?? 0) + 1;
    this.watchers.set(name, count);
    const resource = this.byName[name];
    if (count === 1 && (resource.status() === "idle" || this.stale.has(name))) {
      this.stale.delete(name);
      void resource.refresh();
    }
  }

  unwatch(name: StoryResourceName): void {
    const count = (this.watchers.get(name) ?? 0) - 1;
    if (count > 0) this.watchers.set(name, count);
    else this.watchers.delete(name);
  }

  dispose(): void {
    this.subscription.unsubscribe();
    this.unwatchStory();
    this.timer?.cancel();
    this.timer = null;
    for (const resource of Object.values(this.byName)) resource.dispose();
  }

  private onEvent(event: AhoyEvent): void {
    if (!isKnownEventType(event.type)) return;
    for (const name of STALE_AFTER[event.type]) {
      if (this.watchers.has(name)) this.dirty.add(name);
      else if (this.byName[name].status() !== "idle") this.stale.add(name);
    }
    if (this.dirty.size > 0 && this.timer === null) {
      this.timer = this.clock.schedule(RESOURCE_REFRESH_DEBOUNCE_MS, () => this.flush());
    }
  }

  private flush(): void {
    this.timer = null;
    const names = [...this.dirty];
    this.dirty.clear();
    for (const name of names) {
      if (this.watchers.has(name)) void this.byName[name].refresh();
      else this.stale.add(name);
    }
  }
}

/**
 * The open voyages (plan §5.4): per story, the resources `story`, `state`, `runs`, `questions`, `gates`, `models` and
 * `artifacts`, each `idle | loading | ready | error` with `refresh()`, plus the event history. Only what a screen
 * observes is read and kept fresh: an event touching a resource nobody observes only marks it stale.
 */
@Injectable({ providedIn: "root" })
export class StoryStore {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(EventBus);
  private readonly clock = inject(CLOCK);
  private readonly stories = inject(StoriesStore);
  private readonly feed = inject(StoryEventsFeed);
  private readonly entries = new LeaseMap<string, StoryEntry>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.entries.clear());
  }

  /**
   * Holds a voyage open. `watch` names the resources to observe from the start (more with `handle.watch`). Let go with
   * `release`, or pass `destroyRef` to let go when it is destroyed.
   */
  for(
    key: string,
    options: { readonly watch?: readonly StoryResourceName[]; readonly destroyRef?: DestroyRef } = {},
  ): StoryHandle {
    const { entry, release } = this.entries.acquire(
      key,
      () => new StoryEntry(key, this.api, this.bus, this.clock, this.stories),
    );
    const watched: StoryResourceName[] = [];
    let feed: StoryEventsHandle | null = null;
    let released = false;
    const handle: StoryHandle = {
      key,
      story: entry.story,
      state: entry.state,
      runs: entry.runs,
      questions: entry.questions,
      gates: entry.gates,
      models: entry.models,
      artifacts: entry.artifacts,
      watch: (...names) => {
        if (released) return;
        for (const name of names) {
          watched.push(name);
          entry.watch(name);
        }
      },
      events: () => {
        if (released) throw new Error(`StoryStore: the handle of ${key} was released`);
        return (feed ??= this.feed.for(key));
      },
      release: releaseOnDestroy(() => {
        if (released) return;
        released = true;
        for (const name of watched) entry.unwatch(name);
        feed?.release();
        release();
      }, options.destroyRef),
    };
    handle.watch(...(options.watch ?? []));
    return handle;
  }

  /**
   * Takes the story a command answered with (`202`/`201`): it is the truth, so the open voyage and the list show it at
   * once, unless they already hold a newer version.
   */
  accept(story: Story): void {
    this.entries.get(story.key)?.story.accept(story);
    this.stories.upsert(story);
  }

  /** Takes the model plan `setStoryModels` answered with. */
  acceptModels(plan: ModelPlan): void {
    this.entries.get(plan.storyKey)?.models.accept(plan);
  }
}
