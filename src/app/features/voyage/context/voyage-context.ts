import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { isNotFound, type ApiError } from '@core/api/api-error';
import { readStoryState, type StoryStateView } from '@core/api/story-state';
import type { ApiResult } from '@core/api/api-error';
import type { AhoyEvent, ModelPlan, Run, Story } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import {
  CommandRunner,
  type CommandOutcome,
} from '@core/commands/command-runner';
import type { StoryEventsHandle } from '@core/stores/story-events-feed';
import {
  StoryStore,
  type StoryHandle,
  type StoryResourceName,
} from '@core/stores/story-store';
import { remainingNano } from '@domain/aiu';
import { isStoryKey } from '@domain/identifiers';
import {
  blockedAt,
  lastHalt,
  openGateKey,
  revisingGateKey,
  type HaltRecord,
} from './voyage-events';

/** Where the voyage page stands: the story is being read, is there, does not exist, or could not be read. */
export type VoyageStatus = 'loading' | 'ready' | 'error' | 'notFound';

/** The numbers on the section tabs; null until the list is read. */
export interface VoyageCounts {
  readonly questions: number | null;
  readonly runs: number | null;
  readonly gates: number | null;
}

/** The resources the voyage page keeps fresh while it is open (the tabs watch more through {@link VoyageContext.handle}). */
export const CONTEXT_RESOURCES: readonly StoryResourceName[] = [
  'story',
  'state',
  'runs',
  'questions',
  'gates',
  'models',
];

/** The open voyage and its event history, held together. */
interface Held {
  readonly handle: StoryHandle;
  readonly events: StoryEventsHandle;
}

/**
 * Everything the voyage page and its tabs know about the voyage at `/voyages/:key` (plan, lane 4A). The shell provides
 * one per page and calls {@link open} with the key; the tabs inject it and never call the `ApiClient` for the story.
 *
 * It holds the voyage in the `StoryStore` (kept fresh by the event stream) and its event history, and derives what the
 * `Story` does not carry: the open gate (G11), the revision round and ceiling (G10), the phase a blocked voyage stopped in
 * (G12) and the last halt (G7). Every command goes through {@link commands}, with the version the user saw.
 */
@Injectable()
export class VoyageContext {
  private readonly store = inject(StoryStore);
  private readonly api = inject(ApiClient);
  private readonly user = inject(CurrentUser);
  private readonly held = signal<Held | null>(null);
  /** The key last given to {@link open}, valid or not. */
  private readonly opened = signal<string | null>(null);

  /** The voyage's commands, one at a time, with `expectedVersion` = {@link version} (plan §5.5). */
  readonly commands = new CommandRunner({
    version: () => this.version(),
    refresh: () => this.refresh(),
  });

  /** The Jira key of the open voyage; null before {@link open}. */
  readonly key = computed(() => this.held()?.handle.key ?? null);

  /** The story as last read or as the last command answered it; null until it is read. */
  readonly story = computed<Story | null>(
    () => this.held()?.handle.story.value() ?? null
  );

  /** The version the user sees, sent back as `expectedVersion`. */
  readonly version = computed(() => this.story()?.version ?? null);

  /** Why the story could not be read, while the page has no story to show. */
  readonly error = computed<ApiError | null>(() => {
    const held = this.held();
    return held !== null && held.handle.story.value() === undefined
      ? held.handle.story.error()
      : null;
  });

  /**
   * `loading`, `ready` (a story is there, even if a refresh failed since), `notFound` (404, or a key that is not a Jira
   * key, which is never sent) or `error`.
   */
  readonly status = computed<VoyageStatus>(() => {
    if (this.story() !== null) return 'ready';
    if (this.opened() !== null && this.held() === null) return 'notFound';
    const error = this.error();
    if (error === null) return 'loading';
    return isNotFound(error) ? 'notFound' : 'error';
  });

  /** What the UI reads of the state document; null until it is read. */
  readonly state = computed<StoryStateView | null>(() => {
    const doc = this.held()?.handle.state.value();
    return doc === undefined ? null : readStoryState(doc.state);
  });

  /** The model plan; null until it is read. */
  readonly models = computed<ModelPlan | null>(
    () => this.held()?.handle.models.value() ?? null
  );

  /** What is left of the budget (`cap − spent`, never below zero), in nano-AIU: what a resume may spend. */
  readonly remainingNanoAiu = computed(() => {
    const story = this.story();
    return story === null
      ? 0
      : remainingNano(story.budgetNanoAiu, story.spentNanoAiu);
  });

  /** The voyage's runs, as the API lists them; empty until read. */
  readonly runs = computed<readonly Run[]>(
    () => this.held()?.handle.runs.value() ?? []
  );

  /** The event history without `run.progress`, oldest first. */
  readonly events = computed<readonly AhoyEvent[]>(
    () => this.held()?.events.events() ?? []
  );

  /** The key of the human gate the voyage waits on (G11), only while it is `awaiting_decision`. */
  readonly gateKey = computed(() => {
    const story = this.story();
    return story?.status === 'awaiting_decision'
      ? openGateKey(this.events(), story.phase)
      : null;
  });

  /** How many send-backs a gate takes (G10); 4 unless the state says otherwise. */
  readonly revisionCeiling = computed(
    () => this.state()?.revisionCeiling ?? null
  );

  /**
   * The revision round (G10): one more than the send-backs of the open gate, or of the gate whose rounds the voyage is
   * in (sent back to planning). "2 of 4" after one send-back. Null when the state is not read or no gate applies.
   */
  readonly revisionRound = computed(() => {
    const state = this.state();
    const phase = this.story()?.phase ?? '';
    const gate = this.gateKey() ?? revisingGateKey(this.events(), phase);
    if (state === null || gate === null) return null;
    return (state.revisions.get(gate) ?? 0) + 1;
  });

  /** Whether the user owns the voyage (and is billed for it). */
  readonly isOwner = computed(() => {
    const story = this.story();
    return story !== null && this.user.is(story.owner);
  });

  /** For a blocked voyage, the phase it was in when it ran aground (G12); null otherwise. */
  readonly stoppedAt = computed(() =>
    this.story()?.phase === 'blocked' ? blockedAt(this.events()) : null
  );

  /** The last `story.halted` of the voyage (G7), whatever its status now. */
  readonly lastHalt = computed<HaltRecord | null>(() =>
    lastHalt(this.events())
  );

  /** The counts on the Questions, Runs and Gates tabs. */
  readonly counts = computed<VoyageCounts>(() => {
    const handle = this.held()?.handle;
    return {
      questions: handle?.questions.value()?.length ?? null,
      runs: handle?.runs.value()?.length ?? null,
      gates: handle?.gates.value()?.length ?? null,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  /** The `StoryStore` handle of the open voyage, for a tab that needs a resource the context does not expose. */
  handle(): StoryHandle | null {
    return this.held()?.handle ?? null;
  }

  /**
   * Opens the voyage `key`, letting go of the one open before. Opening the same key again does nothing. A route param is
   * untrusted: a key that is not a Jira key (`PROJ-123`) is not sent, and the page says the voyage doesn't exist.
   */
  open(key: string): void {
    if (this.opened() === key) return;
    this.close();
    this.opened.set(key);
    if (!isStoryKey(key)) return;
    const handle = this.store.for(key, { watch: CONTEXT_RESOURCES });
    this.held.set({ handle, events: handle.events() });
  }

  /** Reads the voyage again: the story, what the context watches and the event history. */
  async refresh(): Promise<void> {
    const held = this.held();
    if (held === null) return;
    const { handle, events } = held;
    await Promise.all([
      ...CONTEXT_RESOURCES.map((name) => handle[name].refresh()),
      events.refresh(),
    ]);
  }

  /** Drops anchor: `stopStory` with the reason. The `202` story goes to the store. */
  stop(reason: string): Promise<CommandOutcome<Story>> {
    return this.storyCommand((key, expectedVersion) =>
      this.api.stopStory(key, { expectedVersion, reason })
    );
  }

  /** Weighs anchor: `resumeStory`, with the reason only when there is one. */
  resume(reason: string): Promise<CommandOutcome<Story>> {
    return this.storyCommand((key, expectedVersion) =>
      this.api.resumeStory(key, {
        expectedVersion,
        ...(reason !== '' ? { reason } : {}),
      })
    );
  }

  /** Sets the total cap: `setStoryBudget` with the new cap in nano-AIU and the reason. */
  setBudget(
    budgetNanoAiu: number,
    reason: string
  ): Promise<CommandOutcome<Story>> {
    return this.storyCommand((key, expectedVersion) =>
      this.api.setStoryBudget(key, { expectedVersion, budgetNanoAiu, reason })
    );
  }

  /**
   * Runs a command of the open voyage that answers with the story, which then becomes the truth for the page and the
   * lists. Skipped while no voyage is open.
   */
  private storyCommand(
    send: (key: string, expectedVersion: number) => Promise<ApiResult<Story>>
  ): Promise<CommandOutcome<Story>> {
    const key = this.key();
    if (key === null) return Promise.resolve({ kind: 'skipped' });
    return this.commands.run((expectedVersion) => send(key, expectedVersion), {
      onOk: (story) => this.store.accept(story),
    });
  }

  private close(): void {
    this.opened.set(null);
    const held = this.held();
    if (held === null) return;
    held.handle.release();
    this.held.set(null);
  }
}
