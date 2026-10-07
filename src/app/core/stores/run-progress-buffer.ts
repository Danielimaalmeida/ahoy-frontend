import { DestroyRef, Injectable, computed, inject, signal, type Signal } from "@angular/core";
import { ApiClient } from "@core/api/api-client";
import { ok, type ApiResult } from "@core/api/api-error";
import {
  parseRunProgress,
  type RunProgressMessage,
  type RunProgressSpend,
  type RunProgressTool,
} from "@core/api/run-progress";
import type { AhoyEvent } from "@core/api/types";
import { compareEventIds } from "@core/realtime/event-id";
import { EventBus } from "@core/realtime/event-bus";
import { RUN_PROGRESS } from "@core/realtime/event-types";
import { readStoryEvents } from "./event-pages";
import { releaseOnDestroy } from "./leases";

/** Progress events kept per run: the API itself writes at most 1000 per run. The oldest go first. */
export const MAX_PROGRESS_EVENTS_PER_RUN = 1_000;

/** Runs kept at once; the one touched least recently goes first. */
export const MAX_PROGRESS_RUNS = 50;

/** A step of a run: a tool call or a message, with the time to show. */
export interface ProgressStep {
  readonly kind: "step";
  readonly step: RunProgressTool | RunProgressMessage;
  /** The step's own `at`, or the event's `createdAt` when the worker gave none. */
  readonly at: string;
  /** The id of the event that carried it. */
  readonly eventId: string;
}

/** A gap row: steps the API left out (or that this buffer no longer holds). Never zero. */
export interface ProgressGap {
  readonly kind: "gap";
  readonly count: number;
}

/** One row of the live steps. */
export type ProgressEntry = ProgressStep | ProgressGap;

/** What the live steps of one run show. */
export interface RunProgressView {
  readonly runId: string;
  /** Steps in order, each line once, with a gap row before each batch in which `omitted` rose. */
  readonly entries: readonly ProgressEntry[];
  /** The latest `spend`, or null before the first one. */
  readonly spend: RunProgressSpend | null;
  /** Steps left out by the API so far (from the latest `spend`). */
  readonly omitted: number;
  /** Steps shown. */
  readonly steps: number;
}

interface StoredEvent {
  readonly id: string;
  readonly createdAt: string;
  readonly progress: RunProgressTool | RunProgressMessage | RunProgressSpend;
}

/** What one run holds: its progress events in id order, and what trimming them took away. */
class RunRecord {
  readonly events: StoredEvent[] = [];
  /** Step events dropped by the retention limit. */
  droppedSteps = 0;
  /** `omitted` of the last `spend` dropped by the retention limit: later batches count from it. */
  droppedOmitted = 0;
  readonly version = signal(0);
  readonly view: Signal<RunProgressView>;

  constructor(readonly runId: string) {
    this.view = computed(() => {
      this.version();
      return deriveView(this);
    });
  }

  /** Adds an event in id order; an id already held is ignored. Returns whether it was added. */
  insert(event: StoredEvent): boolean {
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const order = compareEventIds(this.events[mid]?.id ?? event.id, event.id);
      if (order === 0) return false;
      if (order < 0) low = mid + 1;
      else high = mid;
    }
    this.events.splice(low, 0, event);
    for (let excess = this.events.length - MAX_PROGRESS_EVENTS_PER_RUN; excess > 0; excess--) {
      const dropped = this.events.shift();
      if (dropped?.progress.kind === "spend") this.droppedOmitted = dropped.progress.omitted;
      else if (dropped !== undefined) this.droppedSteps++;
    }
    return true;
  }
}

/**
 * Turns a run's events into rows. Steps between two `spend` events form a batch; when `omitted` rose from one `spend` to
 * the next, a gap of the difference goes before that batch (plan, lane 5A). Steps after the last `spend` are shown
 * without a gap until their `spend` arrives. A step whose `line` was already shown is skipped.
 */
function deriveView(record: RunRecord): RunProgressView {
  const entries: ProgressEntry[] = [];
  if (record.droppedSteps > 0) entries.push({ kind: "gap", count: record.droppedSteps });
  const seenLines = new Set<number>();
  let batch: ProgressStep[] = [];
  let previousOmitted = record.droppedOmitted;
  let spend: RunProgressSpend | null = null;
  let steps = 0;
  for (const event of record.events) {
    const progress = event.progress;
    if (progress.kind === "spend") {
      const omittedNow = progress.omitted - previousOmitted;
      if (omittedNow > 0) entries.push({ kind: "gap", count: omittedNow });
      entries.push(...batch);
      batch = [];
      previousOmitted = Math.max(previousOmitted, progress.omitted);
      spend = progress;
    } else if (!seenLines.has(progress.line)) {
      seenLines.add(progress.line);
      batch.push({ kind: "step", step: progress, at: progress.at ?? event.createdAt, eventId: event.id });
      steps++;
    }
  }
  entries.push(...batch);
  return { runId: record.runId, entries, spend, omitted: spend?.omitted ?? 0, steps };
}

/**
 * The live steps of runs, from `run.progress` events (plan §5.4: they never cause a refetch). Fed by the event bus while a
 * screen holds {@link follow} for the story, by {@link hydrate} for runs that already ended, and by `StoryEventsFeed`
 * when it reads a story's history. Bounded: 1000 events per run and 50 runs.
 */
@Injectable({ providedIn: "root" })
export class RunProgressBuffer {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(EventBus);
  private readonly runs = new Map<string, RunRecord>();
  private readonly hydrations = new Map<string, Promise<ApiResult<void>>>();
  private readonly follows = new Map<string, { holders: number; stop: () => void }>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const follow of this.follows.values()) follow.stop();
      this.follows.clear();
    });
  }

  /** The live steps of a run. Reactive; empty until events for it arrive. */
  run(runId: string): Signal<RunProgressView> {
    return this.record(runId).view;
  }

  /** Takes a `run.progress` event; any other event, or a payload that cannot be read, is ignored. */
  ingest(event: AhoyEvent): void {
    if (event.type !== RUN_PROGRESS) return;
    const progress = parseRunProgress(event.payload);
    if (progress === null) return;
    const record = this.record(progress.runId);
    if (record.insert({ id: event.id, createdAt: event.createdAt, progress })) record.version.update((v) => v + 1);
  }

  /** Takes several events at once. */
  ingestAll(events: readonly AhoyEvent[]): void {
    for (const event of events) this.ingest(event);
  }

  /**
   * Follows a story's live `run.progress` events from the bus (holding the connection open) until the returned function
   * is called, or `destroyRef` is destroyed.
   */
  follow(storyKey: string, destroyRef?: DestroyRef): () => void {
    let follow = this.follows.get(storyKey);
    if (follow === undefined) {
      const subscription = this.bus.eventsFor(storyKey).subscribe((event) => this.ingest(event));
      follow = { holders: 0, stop: () => subscription.unsubscribe() };
      this.follows.set(storyKey, follow);
    }
    follow.holders++;
    const held = follow;
    let released = false;
    return releaseOnDestroy(() => {
      if (released) return;
      released = true;
      held.holders--;
      if (held.holders === 0 && this.follows.get(storyKey) === held) {
        this.follows.delete(storyKey);
        held.stop();
      }
    }, destroyRef);
  }

  /**
   * Reads a story's whole event history (G8: from the start, 500 at a time) and keeps its `run.progress`, so that runs
   * that ended show their steps. Asking again while a read is in flight shares it; reading twice is harmless, since
   * events are kept once by id.
   */
  hydrate(storyKey: string): Promise<ApiResult<void>> {
    let hydration = this.hydrations.get(storyKey);
    if (hydration === undefined) {
      hydration = readStoryEvents(this.api, storyKey, null, (events) => this.ingestAll(events))
        .then((result) => (result.ok ? ok(undefined) : result))
        .finally(() => this.hydrations.delete(storyKey));
      this.hydrations.set(storyKey, hydration);
    }
    return hydration;
  }

  private record(runId: string): RunRecord {
    let record = this.runs.get(runId);
    if (record === undefined) {
      record = new RunRecord(runId);
    } else {
      this.runs.delete(runId);
    }
    this.runs.set(runId, record);
    if (this.runs.size > MAX_PROGRESS_RUNS) {
      const oldest = this.runs.keys().next();
      if (oldest.done !== true) this.runs.delete(oldest.value);
    }
    return record;
  }
}
