import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { MeetingStoryDraft } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import {
  anyDrafting,
  DRAFT_POLL_MS,
  latestDraftByTopic,
} from '@domain/story-drafts';

/**
 * The user stories drafted from the open meeting's topics (slice 2): read when a meeting opens, read again every few
 * seconds while the agent is writing one, and changed by asking for a draft, discarding one or creating it in Jira.
 * Asking for a draft may spend AIU; creating one writes to Jira. Nothing else here calls outside Ahoy.
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

  /** Asks the agent to draft a story from a topic and the chosen notes (none: all of them), capped at `cap`. */
  async request(
    topicId: string,
    noteIds: readonly string[],
    cap: number | null
  ): Promise<ApiResult<MeetingStoryDraft>> {
    const result = await this.command(() =>
      this.api.requestMeetingStoryDraft(topicId, {
        confirmSpend: true,
        ...(noteIds.length > 0 ? { noteIds: [...noteIds] } : {}),
        ...(cap !== null ? { budgetNanoAiu: cap } : {}),
      })
    );
    if (result.ok) this.put(result.value);
    return result;
  }

  /** Discards a draft not yet in Jira; a draft still being written stops. */
  async discard(id: string): Promise<ApiResult<null>> {
    const result = await this.command(() =>
      this.api.discardMeetingStoryDraft(id)
    );
    if (result.ok) this.drafts.set(this.drafts().filter((d) => d.id !== id));
    return result;
  }

  /** "Write it again": discards the draft and asks for a new one from the same notes, with the server's cap. */
  async rewrite(
    draft: MeetingStoryDraft
  ): Promise<ApiResult<MeetingStoryDraft> | ApiResult<null>> {
    const discarded = await this.discard(draft.id);
    if (!discarded.ok) return discarded;
    return this.request(draft.topicId, draft.noteIds, null);
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
