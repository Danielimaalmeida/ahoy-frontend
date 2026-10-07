import { DestroyRef, Injectable, inject, signal, untracked, type WritableSignal } from "@angular/core";
import { readStoryState } from "@core/api/story-state";
import type { Story } from "@core/api/types";
import type { StoryEventsHandle } from "@core/stores/story-events-feed";
import { StoryStore, type StoryHandle } from "@core/stores/story-store";
import { blockedAt, haltOf, rejectionOf, type NoteDetail } from "./notes";

/** What a row must read beyond its story: the questions, the state, or the event history. */
type Need = "questions" | "state" | "events";

const UNREAD: NoteDetail = { questions: null, state: null, halt: null, rejection: null };

/** What the note and the stepper of a voyage need, by status (G7, G12). */
function needsOf(story: Story): readonly Need[] {
  switch (story.status) {
    case "awaiting_input":
      return ["questions"];
    case "awaiting_decision":
      return ["state"];
    case "halted":
      return ["events"];
    case "terminal":
      return story.phase === "blocked" ? ["events"] : [];
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
 * Holds open the voyages whose note or stepper needs more than the story itself, and only those: the questions of one
 * that asks ("2 open questions"), the state of one that waits for a decision ("round 2 of 4"), the events of an anchored
 * or aground one (who stopped it, who rejected, where it stopped). So the list reads these for the rows on screen and
 * for no others. The stores keep what it reads up to date from the stream. Provide it in the page that uses it: it lets
 * go of every voyage when the page goes.
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
        let held = next.get(key);
        // The stores let go of a resource only when the last hold on the voyage does. So a voyage that stops needing
        // something it read (its questions, once answered) gets a new hold, opened before the old one is let go: the
        // stream stays open and what was read stays in the store.
        if (held !== undefined && [...held.needs].some((need) => !needs.includes(need))) {
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
      if (next.size !== current.size || [...next].some(([key, held]) => current.get(key) !== held)) this.held.set(next);
    });
  }

  /** What a row has read of its voyage so far; reactive. */
  detail(key: string): NoteDetail {
    const held = this.held().get(key);
    if (held === undefined) return UNREAD;
    const events = held.feed()?.events() ?? null;
    const state = held.handle.state.value();
    return {
      questions: held.handle.questions.value() ?? null,
      state: state === undefined ? null : readStoryState(state.state),
      halt: events === null ? null : haltOf(events),
      rejection: events === null ? null : rejectionOf(events),
    };
  }

  /** For an aground voyage, the phase it was in (G12); the API only says `blocked`. `null` until its events are read. */
  stoppedAt(story: Story): string | null {
    const events = this.held().get(story.key)?.feed()?.events() ?? null;
    return events === null || story.phase !== "blocked" ? null : blockedAt(events);
  }

  private open(key: string): Held {
    return { handle: this.stories.for(key), feed: signal(null), needs: new Set() };
  }

  private read(held: Held, need: Need): void {
    if (held.needs.has(need)) return;
    held.needs.add(need);
    if (need === "events") held.feed.set(held.handle.events());
    else held.handle.watch(need);
  }
}
