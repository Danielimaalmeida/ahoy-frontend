import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { MeetingStoryDraft, MeetingStoryMode } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import {
  anyDrafting,
  DRAFT_POLL_MS,
  latestDraftByTopic,
  type GrillAnswerBody,
  type GrillPick,
} from '@domain/story-drafts';

/**
 * The user stories drafted from the open meeting's topics (slices 2 and 3): read when a meeting opens, read again every
 * few seconds while the agent is writing one, and changed by asking for a draft, answering a grill's questions,
 * discarding one or creating it in Jira. Asking for a draft and answering may spend AIU; creating one writes to Jira.
 * Nothing else here calls outside Ahoy.
 */
@Injectable()
export class StoryDraftsStore {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);
  /** Counts loads, so an answer for a meeting no longer open is dropped. */
  private generation = 0;
  private meetingId: string | null = null;
  private timer: Timer | null = null;

  /** The open meeting's drafts that were not discarded, newest first. */
  readonly drafts = signal<readonly MeetingStoryDraft[]>([]);
  /** The draft each topic shows, by topic id. */
  readonly byTopic = computed(() => latestDraftByTopic(this.drafts()));
  /** Why the drafts could not be read; the topics still show. */
  readonly loadError = signal<ApiError | null>(null);
  /** Whether a draft command is in flight. */
  readonly busy = signal(false);
  /** The answers picked so far for each grill not yet sent, by draft id, so closing the dialog loses nothing. */
  private readonly picks = new Map<string, ReadonlyMap<string, GrillPick>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  /** Reads the drafts of `meetingId` (none for no meeting), and keeps reading while one is being written. */
  async load(meetingId: string | null): Promise<void> {
    this.stopPolling();
    const generation = ++this.generation;
    this.meetingId = meetingId;
    if (meetingId === null) {
      this.drafts.set([]);
      this.loadError.set(null);
      return;
    }
    await this.read(generation, meetingId);
  }

  /** Reads the open meeting's drafts again, for example after its series' Jira target changed. */
  reload(): Promise<void> {
    return this.load(this.meetingId);
  }

  /**
   * Asks the agent to draft a story from a topic and the chosen notes (none: all of them), capped at `cap`; a `grill`
   * asks the person questions first.
   */
  async request(
    topicId: string,
    noteIds: readonly string[],
    cap: number | null,
    mode: MeetingStoryMode = 'draft'
  ): Promise<ApiResult<MeetingStoryDraft>> {
    const result = await this.command(() =>
      this.api.requestMeetingStoryDraft(topicId, {
        confirmSpend: true,
        ...(noteIds.length > 0 ? { noteIds: [...noteIds] } : {}),
        ...(mode === 'grill' ? { mode } : {}),
        ...(cap !== null ? { budgetNanoAiu: cap } : {}),
      })
    );
    if (result.ok) this.put(result.value);
    return result;
  }

  /** Sends a grill's answers, once; the agent then writes the story, capped at `cap` (the server's cap when null). */
  async answer(
    id: string,
    answers: readonly GrillAnswerBody[],
    cap: number | null
  ): Promise<ApiResult<MeetingStoryDraft>> {
    const result = await this.command(() =>
      this.api.answerMeetingStoryQuestions(id, {
        confirmSpend: true,
        answers: answers.map((a) => ({ ...a })),
        ...(cap !== null ? { budgetNanoAiu: cap } : {}),
      })
    );
    if (result.ok) {
      this.picks.delete(id);
      this.put(result.value);
    }
    return result;
  }

  /** The answers picked so far for a grill not yet sent; empty when none were. */
  picksOf(id: string): ReadonlyMap<string, GrillPick> {
    return this.picks.get(id) ?? new Map();
  }

  /** Keeps the answers picked so far for a grill, until they are sent or the draft is discarded. */
  keepPicks(id: string, picks: ReadonlyMap<string, GrillPick>): void {
    this.picks.set(id, picks);
  }

  /** Discards a draft not yet in Jira; a draft still being written stops. */
  async discard(id: string): Promise<ApiResult<null>> {
    const result = await this.command(() =>
      this.api.discardMeetingStoryDraft(id)
    );
    if (result.ok) {
      this.picks.delete(id);
      this.drafts.set(this.drafts().filter((d) => d.id !== id));
    }
    return result;
  }

  /**
   * "Write it again" (or "Grill me on it" with `mode: grill`): discards the draft and asks for a new one from the same
   * notes, with the server's cap; the same way it was asked for when no mode is given.
   */
  async rewrite(
    draft: MeetingStoryDraft,
    mode: MeetingStoryMode = draft.mode
  ): Promise<ApiResult<MeetingStoryDraft> | ApiResult<null>> {
    const discarded = await this.discard(draft.id);
    if (!discarded.ok) return discarded;
    return this.request(draft.topicId, draft.noteIds, null, mode);
  }

  /** Creates a ready draft's story in Jira, in its series' project. A second call creates nothing new. */
  async createIssue(id: string): Promise<ApiResult<MeetingStoryDraft>> {
    const result = await this.command(() =>
      this.api.createMeetingStoryIssue(id)
    );
    if (result.ok) this.put(result.value);
    return result;
  }

  private async read(generation: number, meetingId: string): Promise<void> {
    const result = await this.api.listMeetingStoryDrafts(meetingId);
    if (generation !== this.generation) return;
    if (!result.ok) {
      this.loadError.set(result.error);
    } else {
      this.loadError.set(null);
      this.drafts.set(result.value.items);
    }
    this.poll();
  }

  /** Reads again in a few seconds while a draft is being written. */
  private poll(): void {
    this.stopPolling();
    const meetingId = this.meetingId;
    if (meetingId === null || !anyDrafting(this.drafts())) return;
    const generation = this.generation;
    this.timer = this.clock.schedule(DRAFT_POLL_MS, () => {
      this.timer = null;
      if (generation === this.generation) void this.read(generation, meetingId);
    });
  }

  private stopPolling(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  /** Adds or replaces one draft (newest first), and polls when it is being written. */
  private put(draft: MeetingStoryDraft): void {
    if (draft.meetingId !== this.meetingId) return;
    const others = this.drafts().filter((d) => d.id !== draft.id);
    this.drafts.set(
      [draft, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
    this.poll();
  }

  private async command<T>(
    send: () => Promise<ApiResult<T>>
  ): Promise<ApiResult<T>> {
    this.busy.set(true);
    try {
      return await send();
    } finally {
      this.busy.set(false);
    }
  }
}
