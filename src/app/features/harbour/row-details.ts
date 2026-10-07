import { DestroyRef, Injectable, inject, signal, untracked, type WritableSignal } from "@angular/core";
import { readStoryState } from "@core/api/story-state";
import type { Run, Story } from "@core/api/types";
import type { StoryEventsHandle } from "@core/stores/story-events-feed";
import { StoryStore, type StoryHandle, type StoryResourceName } from "@core/stores/story-store";
import { gateOpen, haltOf, type RowDetail } from "./needs";

/** What a row must read beyond its story: the questions, the state, the event history, or the runs. */
type Need = "questions" | "state" | "events" | "runs";

const UNREAD: RowDetail = { questions: null, state: null, gate: null, halt: null };

/** What the row of a voyage needs: the questions of one that asks, the state and events of one that waits, and so on. */
function needsOf(story: Story): readonly Need[] {
  switch (story.status) {
    case "awaiting_input":
      return ["questions"];
    case "awaiting_decision":
      return ["state", "events"];
    case "halted":
      return ["events"];
    case "running":
      return ["runs"];
    default:
      return [];
  }
}

interface Held {
  readonly handle: StoryHandle;
  readonly feed: WritableSignal<StoryEventsHandle | null>;
  readonly watching: Set<StoryResourceName>;
}

/**
 * Holds open the voyages whose row needs more than its story, and only those (G7, G10, G11): "What's needed" is read for
 * the voyages on screen and for no others. The stores keep what it reads up to date from the stream. Provide it in the
 * page that uses it: it lets go of every voyage when the page goes.
 */
@Injectable()
export class RowDetails {
  private readonly stories = inject(StoryStore);
  private readonly held = signal<ReadonlyMap<string, Held>>(new Map());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
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
        const held = next.get(key) ?? { handle: this.stories.for(key), feed: signal(null), watching: new Set() };
        next.set(key, held);
        for (const need of needs) this.read(held, need);
      }
      if (next.size !== current.size || [...next.keys()].some((key) => !current.has(key))) this.held.set(next);
    });
  }

  /** What a row has read of its voyage so far; reactive. */
  detail(key: string): RowDetail {
    const held = this.held().get(key);
    if (held === undefined) return UNREAD;
    const events = held.feed()?.events() ?? null;
    const state = held.handle.state.value();
    return {
      questions: held.handle.questions.value() ?? null,
      state: state === undefined ? null : readStoryState(state.state),
      gate: events === null ? null : gateOpen(events),
      halt: events === null ? null : haltOf(events),
    };
  }

  /** The run a voyage at sea is on, once its runs are read; reactive. */
  runOf(story: Story): Pick<Run, "model" | "reasoningEffort"> | null {
    const runs = this.held().get(story.key)?.handle.runs.value();
    return runs?.find((run) => run.id === story.currentRunId) ?? null;
  }

  private read(held: Held, need: Need): void {
    if (need === "events") {
      if (held.feed() === null) held.feed.set(held.handle.events());
    } else if (!held.watching.has(need)) {
      held.watching.add(need);
      held.handle.watch(need);
    }
  }
}
