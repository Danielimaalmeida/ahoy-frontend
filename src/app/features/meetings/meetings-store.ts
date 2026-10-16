import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  EndMeetingResult,
  Meeting,
  MeetingSeries,
  MeetingSummary,
  MeetingTopic,
  RaisedBy,
} from '@core/api/types';
import { defaultMeeting, groupMeetings, moveInOrder } from '@domain/meetings';

/** What the page asks for when it plans a meeting: in a series (title optional) or a one-off (title required). */
export interface NewMeeting {
  readonly seriesId: string | null;
  readonly title: string;
  readonly startsAt: string;
  /** The stakeholders of a one-off meeting; a series' meeting takes the series'. */
  readonly stakeholders?: readonly string[];
}

/** What the page asks for when it starts a series: its name, stakeholders and how many days apart its meetings are. */
export interface NewSeries {
  readonly name: string;
  readonly stakeholders: readonly string[];
  readonly cadenceDays: number | null;
}

/**
 * The state of the Meetings page: every meeting (for the left column), the series, the meeting open on the right, and
 * the outcome of the last command. Every command answers with what changed, which replaces the open meeting or one of
 * its topics; the list is read again after a command that changes counts or statuses. 0 AIU.
 */
@Injectable()
export class MeetingsStore {
  private readonly api = inject(ApiClient);
  /** Counts loads of the open meeting, so an answer to an older one is dropped. */
  private generation = 0;

  /** Every meeting, latest start first, once read. */
  readonly meetings = signal<readonly MeetingSummary[]>([]);
  /** Every meeting series, by name. */
  readonly series = signal<readonly MeetingSeries[]>([]);
  /** The meeting open on the right, with its topics and notes. */
  readonly meeting = signal<Meeting | null>(null);
  /** Why the list could not be read. */
  readonly loadError = signal<ApiError | null>(null);
  /** Why the meeting asked for could not be read. */
  readonly openError = signal<ApiError | null>(null);
  /** Why the last command was refused; cleared by the next one. */
  readonly commandError = signal<ApiError | null>(null);
  /** Whether the list is being read for the first time. */
  readonly loading = signal(false);
  /** Whether a command is in flight; the page disables its controls meanwhile. */
  readonly busy = signal(false);

  /** The left column: running now, planned (soonest first), ended (latest first). */
  readonly groups = computed(() => groupMeetings(this.meetings()));
  /** Whether the open meeting takes changes (it has not ended). */
  readonly editable = computed(() => {
    const m = this.meeting();
    return m !== null && m.status !== 'ended';
  });

  /** Whether the list has been read once (successfully), so the page knows which meeting to open by default. */
  readonly loaded = signal(false);

  /** Reads the meetings and the series for the left column. */
  async load(): Promise<void> {
    this.loading.set(true);
    const [meetings, series] = await Promise.all([
      this.api.listMeetings(),
      this.api.listMeetingSeries(),
    ]);
    this.loading.set(false);
    if (!meetings.ok) {
      this.loadError.set(meetings.error);
      return;
    }
    this.loadError.set(null);
    this.meetings.set(meetings.value.items);
    if (series.ok) this.series.set(series.value.items);
    this.loaded.set(true);
  }

  /** Opens `id`, or without one the meeting the page opens by default (none when there is no meeting yet). */
  async show(id: string | undefined): Promise<void> {
    const target = id ?? defaultMeeting(this.meetings())?.id;
    if (target === undefined) {
      this.generation++;
      this.openError.set(null);
      this.meeting.set(null);
      return;
    }
    await this.open(target);
  }

  /** Opens one meeting on the right. */
  async open(id: string): Promise<void> {
    const generation = ++this.generation;
    const result = await this.api.getMeeting(id);
    if (generation !== this.generation) return;
    if (!result.ok) {
      this.openError.set(result.error);
      this.meeting.set(null);
      return;
    }
    this.openError.set(null);
    this.meeting.set(result.value);
  }

  /** Plans a meeting and opens it. Answers the new meeting's id, or null when it was refused. */
  async create(request: NewMeeting): Promise<string | null> {
    const title = request.title.trim();
    const created = await this.run(() =>
      this.api.createMeeting({
        startsAt: request.startsAt,
        ...(request.seriesId !== null ? { seriesId: request.seriesId } : {}),
        ...(title !== '' ? { title } : {}),
        ...(request.stakeholders !== undefined &&
        request.stakeholders.length > 0
          ? { stakeholders: [...request.stakeholders] }
          : {}),
      })
    );
    if (created === null) return null;
    this.meeting.set(created);
    await this.refreshList();
    return created.id;
  }

  /** Starts a series and adds it to the list. Answers the new series, or null when it was refused. */
  async createSeries(request: NewSeries): Promise<MeetingSeries | null> {
    const created = await this.run(() =>
      this.api.createMeetingSeries({
        name: request.name.trim(),
        stakeholders: [...request.stakeholders],
        ...(request.cadenceDays !== null
          ? { cadenceDays: request.cadenceDays }
          : {}),
      })
    );
    if (created === null) return null;
    this.series.set(
      [...this.series(), created].sort((a, b) => a.name.localeCompare(b.name))
    );
    return created;
  }

  /** Starts the open meeting: topics added from now on were raised in it. */
  async start(): Promise<void> {
    const id = this.meeting()?.id;
    if (id === undefined) return;
    const started = await this.run(() => this.api.startMeeting(id));
    if (started === null) return;
    this.meeting.set(started);
    await this.refreshList();
  }

  /**
   * Ends the open meeting, carrying `carryOver` to the next one. Answers the ended meeting and the meeting that took
   * the topics (null when none went), or null when the API refused (the reason is in `commandError`).
   */
  async end(carryOver: readonly string[]): Promise<EndMeetingResult | null> {
    const id = this.meeting()?.id;
    if (id === undefined) return null;
    const ended = await this.run(() =>
      this.api.endMeeting(id, { carryOver: [...carryOver] })
    );
    if (ended === null) return null;
    this.meeting.set(ended.meeting);
    await this.refreshList();
    return ended;
  }

  /** Adds a topic at the end of the open meeting; `email` only for a topic raised by them. */
  async addTopic(
    title: string,
    raisedBy: RaisedBy,
    email: string | null
  ): Promise<boolean> {
    const id = this.meeting()?.id;
    if (id === undefined) return false;
    const added = await this.run(() =>
      this.api.addMeetingTopic(id, {
        title: title.trim(),
        raisedBy,
        ...(raisedBy === 'them' && email !== null && email !== ''
          ? { raisedByEmail: email }
          : {}),
      })
    );
    if (added === null) return false;
    this.patchMeeting((m) => ({ ...m, topics: [...m.topics, added] }));
    await this.refreshList();
    return true;
  }

  /** Renames a topic. */
  async renameTopic(topicId: string, title: string): Promise<boolean> {
    const updated = await this.run(() =>
      this.api.updateMeetingTopic(topicId, { title: title.trim() })
    );
    if (updated === null) return false;
    this.replaceTopic(updated);
    return true;
  }

  /** Removes a topic and its notes. */
  async deleteTopic(topicId: string): Promise<void> {
    const done = await this.run(() => this.api.deleteMeetingTopic(topicId));
    if (done === null) return;
    this.patchMeeting((m) => ({
      ...m,
      topics: m.topics.filter((t) => t.id !== topicId),
    }));
    await this.refreshList();
  }

  /** Moves a topic one place up (-1) or down (+1). */
  async reorder(topicId: string, by: -1 | 1): Promise<void> {
    const meeting = this.meeting();
    if (meeting === null) return;
    const ids = meeting.topics.map((t) => t.id);
    const next = moveInOrder(ids, topicId, by);
    if (next.every((id, i) => id === ids[i])) return;
    const ordered = await this.run(() =>
      this.api.setMeetingTopicOrder(meeting.id, { topicIds: next })
    );
    if (ordered !== null) this.meeting.set(ordered);
  }

  /** Moves a topic, with its notes, to the series' next meeting now. */
  async moveToNext(topicId: string): Promise<void> {
    const moved = await this.run(() => this.api.moveMeetingTopic(topicId));
    if (moved === null) return;
    this.replaceTopic(moved.topic);
    await this.refreshList();
  }

  /** Adds a note under a topic. */
  async addNote(topicId: string, text: string): Promise<boolean> {
    const note = await this.run(() =>
      this.api.addMeetingNote(topicId, { text: text.trim() })
    );
    if (note === null) return false;
    this.patchTopic(topicId, (t) => ({ ...t, notes: [...t.notes, note] }));
    return true;
  }

  /** Rewrites a note. */
  async editNote(
    topicId: string,
    noteId: string,
    text: string
  ): Promise<boolean> {
    const note = await this.run(() =>
      this.api.updateMeetingNote(noteId, { text: text.trim() })
    );
    if (note === null) return false;
    this.patchTopic(topicId, (t) => ({
      ...t,
      notes: t.notes.map((n) => (n.id === noteId ? note : n)),
    }));
    return true;
  }

  /** Removes a note. */
  async deleteNote(topicId: string, noteId: string): Promise<void> {
    const done = await this.run(() => this.api.deleteMeetingNote(noteId));
    if (done === null) return;
    this.patchTopic(topicId, (t) => ({
      ...t,
      notes: t.notes.filter((n) => n.id !== noteId),
    }));
  }

  /** Clears the last command's error, when the person dismisses it. */
  dismissError(): void {
    this.commandError.set(null);
  }

  /** Reads the list again, for the counts and statuses of the left column. A failure keeps the old list. */
  private async refreshList(): Promise<void> {
    const result = await this.api.listMeetings();
    if (result.ok) this.meetings.set(result.value.items);
  }

  /** Runs one command: busy while it runs, its error kept for the page, its value or null when refused. */
  private async run<T>(
    command: () => Promise<ApiResult<T>>
  ): Promise<T | null> {
    this.busy.set(true);
    this.commandError.set(null);
    const result = await command();
    this.busy.set(false);
    if (!result.ok) {
      this.commandError.set(result.error);
      return null;
    }
    return result.value;
  }

  private patchMeeting(change: (meeting: Meeting) => Meeting): void {
    const meeting = this.meeting();
    if (meeting !== null) this.meeting.set(change(meeting));
  }

  private patchTopic(
    topicId: string,
    change: (topic: MeetingTopic) => MeetingTopic
  ): void {
    this.patchMeeting((m) => ({
      ...m,
      topics: m.topics.map((t) => (t.id === topicId ? change(t) : t)),
    }));
  }

  private replaceTopic(topic: MeetingTopic): void {
    this.patchTopic(topic.id, () => topic);
  }
}
