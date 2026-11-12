import {
  DestroyRef,
  Injectable,
  inject,
  signal,
  untracked,
  type WritableSignal,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { readStoryState } from '@core/api/story-state';
import type { Diagnosis, Story } from '@core/api/types';
import type { ResourceStatus } from '@core/stores/resource';
import type { StoryEventsHandle } from '@core/stores/story-events-feed';
import { StoryStore, type StoryHandle } from '@core/stores/story-store';
import { isAground } from '@domain/status';
import {
  blockedFromOf,
  gateOpen,
  haltOf,
  type RowDetail,
  type RunModel,
} from './needs';

/** What a row must read beyond its story: the questions, the state, the event history, or the runs. */
type Need = 'questions' | 'state' | 'events' | 'runs';

const UNREAD: RowDetail = {
  questions: null,
  state: null,
  gate: null,
  halt: null,
  diagnosis: null,
  blockedFrom: null,
};

/** Whether a read ended, with what it gave or with an error: what it shows will not change until the voyage does. */
function done(status: ResourceStatus | undefined): boolean {
  return status === 'ready' || status === 'error';
}

/** What the row of a voyage needs: the questions of one that asks, the state and events of one that waits, and so on. */
function needsOf(story: Story): readonly Need[] {
  // An aground voyage's events say where it was blocked from, so whether a person can Unblock it.
  if (isAground(story)) return ['events'];
  switch (story.status) {
    case 'awaiting_input':
      return ['questions'];
    case 'awaiting_decision':
      return ['state', 'events'];
    case 'halted':
      return ['events'];
    case 'running':
      return ['runs'];
    default:
      return [];
  }
}

interface Held {
  readonly handle: StoryHandle;
  readonly feed: WritableSignal<StoryEventsHandle | null>;
  /** What this hold has asked to read. A hold cannot stop watching, so a row that needs less gets a new one. */
  readonly needs: Set<Need>;
}

/**
 * Holds open the voyages whose row needs more than its story, and only those (G7, G10, G11): "What's needed" is read for
 * the voyages on screen and for no others. The stores keep what it reads up to date from the stream. A halted voyage on
 * screen also has its diagnosis read (`getStoryDiagnosis`), again whenever its version moves. Provide it in the page that
 * uses it: it lets go of every voyage when the page goes.
 */
@Injectable()
export class RowDetails {
  private readonly stories = inject(StoryStore);
  private readonly api = inject(ApiClient);
  private readonly held = signal<ReadonlyMap<string, Held>>(new Map());
  private readonly diagnoses = signal<ReadonlyMap<string, Diagnosis>>(
    new Map()
  );
  /** The version of each halted voyage on screen whose diagnosis was last asked for. */
  private readonly asked = new Map<string, number>();
  /** The version of each halted voyage on screen whose diagnosis read ended, read or not. */
  private readonly diagnosed = signal<ReadonlyMap<string, number>>(new Map());
  private disposed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      for (const held of this.held().values()) held.handle.release();
    });
  }

  /** Makes the voyages held the ones of `shown` that need something: opens the new, lets go of the rest. */
  sync(shown: readonly Story[]): void {
    untracked(() => {
      const wanted = new Map<string, readonly Need[]>();
      for (const story of shown) {
        const needs = needsOf(story);
        if (needs.length > 0) wanted.set(story.key, needs);
      }
      const current = this.held();
      const next = new Map(current);
      for (const [key, held] of current) {
        if (wanted.has(key)) continue;
        held.handle.release();
        next.delete(key);
      }
      for (const [key, needs] of wanted) {
        let held = next.get(key);
        // The stores let go of a resource only when the last hold on the voyage does. So a voyage that stops needing
        // something it read (its questions, once answered) gets a new hold, opened before the old one is let go: the
        // stream stays open and what was read stays in the store.
        if (
          held !== undefined &&
          [...held.needs].some((need) => !needs.includes(need))
        ) {
          const old = held;
          held = this.open(key);
          next.set(key, held);
          for (const need of needs) this.read(held, need);
          old.handle.release();
          continue;
        }
        held ??= this.open(key);
        next.set(key, held);
        for (const need of needs) this.read(held, need);
      }
      if (
        next.size !== current.size ||
        [...next].some(([key, held]) => current.get(key) !== held)
      )
        this.held.set(next);
      this.syncDiagnoses(shown);
    });
  }

  /**
   * What a row has read of its voyage so far; reactive. The events count only once the whole history is read: it is read
   * oldest first, so a part of it names a gate or a halt that is over.
   */
  detail(key: string): RowDetail {
    const held = this.held().get(key);
    if (held === undefined) return UNREAD;
    const feed = held.feed();
    const events = feed !== null && done(feed.status()) ? feed.events() : null;
    const state = held.handle.state.value();
    return {
      questions: held.handle.questions.value() ?? null,
      state: state === undefined ? null : readStoryState(state.state),
      gate: events === null ? null : gateOpen(events),
      halt: events === null ? null : haltOf(events),
      diagnosis: this.diagnoses().get(key) ?? null,
      blockedFrom: events === null ? null : blockedFromOf(events),
    };
  }

  /**
   * Whether everything the row of a voyage shows was read, or could not be (its questions, state, events, runs and, when
   * halted, its diagnosis): until then the row would change under the person's eyes, and an aground voyage could not say
   * whether it can be unblocked. `true` for a voyage that needs nothing beyond its story; reactive.
   */
  settled(story: Story): boolean {
    const needs = needsOf(story);
    if (needs.length === 0) return true;
    const held = this.held().get(story.key);
    if (held === undefined) return false;
    const read = needs.every((need) =>
      need === 'events'
        ? done(held.feed()?.status())
        : done(held.handle[need].status())
    );
    return (
      read &&
      (story.status !== 'halted' ||
        this.diagnosed().get(story.key) === story.version)
    );
  }

  /** The run a voyage at sea is on, once its runs are read; reactive. */
  runOf(story: Story): RunModel | null {
    const runs = this.held().get(story.key)?.handle.runs.value();
    return runs?.find((run) => run.id === story.currentRunId) ?? null;
  }

  /** Reads the diagnosis of each halted voyage on screen whose version moved, and forgets the others. */
  private syncDiagnoses(shown: readonly Story[]): void {
    const halted = new Map(
      shown
        .filter((story) => story.status === 'halted')
        .map((story) => [story.key, story.version] as const)
    );
    for (const key of [...this.asked.keys()])
      if (!halted.has(key)) this.asked.delete(key);
    const answered = [...this.diagnosed()].filter(([key]) => halted.has(key));
    if (answered.length !== this.diagnosed().size)
      this.diagnosed.set(new Map(answered));
    const kept = [...this.diagnoses()].filter(([key]) => halted.has(key));
    if (kept.length !== this.diagnoses().size)
      this.diagnoses.set(new Map(kept));
    for (const [key, version] of halted) {
      if (this.asked.get(key) === version) continue;
      this.asked.set(key, version);
      void this.readDiagnosis(key, version);
    }
  }

  /**
   * One read; an answer for a version no longer on screen, or after the page went, is dropped. A failure shows nothing.
   */
  private async readDiagnosis(key: string, version: number): Promise<void> {
    const result = await this.api.getStoryDiagnosis(key);
    if (this.disposed || this.asked.get(key) !== version) return;
    if (result.ok)
      this.diagnoses.update((map) => new Map(map).set(key, result.value));
    this.diagnosed.update((map) => new Map(map).set(key, version));
  }

  private open(key: string): Held {
    return {
      handle: this.stories.for(key),
      feed: signal(null),
      needs: new Set(),
    };
  }

  private read(held: Held, need: Need): void {
    if (held.needs.has(need)) return;
    held.needs.add(need);
    if (need === 'events') held.feed.set(held.handle.events());
    else held.handle.watch(need);
  }
}
