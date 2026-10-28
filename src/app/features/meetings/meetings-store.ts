import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  EndMeetingResult,
  JiraIssueType,
  Meeting,
  MeetingNote,
  MeetingNoteInContext,
  MeetingSeries,
  MeetingSummary,
  MeetingTopic,
  RaisedBy,
} from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import {
  dateInputValue,
  defaultMeeting,
  groupMeetings,
  isClosed,
  LIVE_POLL_MS,
  moveInOrder,
  type NoteKind,
} from '@domain/meetings';

/** What a note is beyond its text: a decision, an action with an optional owner and due day, or a question. */
export interface NoteExtras {
  readonly kind: NoteKind;
  readonly owner?: string;
  readonly dueOn?: string;
}

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
 * its topics; the list is read again after a command that changes counts or statuses. A meeting in progress is read
 * again every few seconds, so the notes others take show up without a refresh, and the open actions of its series are
 * kept beside it. 0 AIU.
 */
@Injectable()
export class MeetingsStore {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);
  /** Counts loads of the open meeting, so an answer to an older one is dropped. */
  private generation = 0;
  private timer: Timer | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopLive();
      for (const url of this.imageUrls().values()) URL.revokeObjectURL(url);
    });
  }

  /** The object URL of each note image read so far, by image id. An image never changes, so one read is enough. */
  readonly imageUrls = signal<ReadonlyMap<string, string>>(new Map());
  /** The images being read or that could not be read, so each is asked for once. */
  private readonly imageReads = new Set<string>();

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
  /** The actions still to do of the open meeting's series (of the meeting alone when it is a one-off). */
  readonly openActions = signal<readonly MeetingNoteInContext[]>([]);
  /** Why the open actions could not be read; the meeting still shows. */
  readonly actionsError = signal<ApiError | null>(null);

  /** The left column: running now, planned (soonest first), ended or cancelled (latest first). */
  readonly groups = computed(() => groupMeetings(this.meetings()));
  /** Whether the open meeting takes changes (it has not ended and was not cancelled). */
  readonly editable = computed(() => {
    const m = this.meeting();
    return m !== null && !isClosed(m.status);
  });

  /** The open meeting's series, with its Jira target; null for a one-off meeting or before the series are read. */
  readonly openSeries = computed(() => {
    const seriesId = this.meeting()?.seriesId ?? null;
    return seriesId === null
      ? null
      : (this.series().find((s) => s.id === seriesId) ?? null);
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
      this.stopLive();
      this.openError.set(null);
      this.meeting.set(null);
      this.openActions.set([]);
      return;
    }
    await this.open(target);
  }

  /** Opens one meeting on the right, with the open actions of its series. */
  async open(id: string): Promise<void> {
    const generation = ++this.generation;
    this.stopLive();
    const result = await this.api.getMeeting(id);
    if (generation !== this.generation) return;
    if (!result.ok) {
      this.openError.set(result.error);
      this.meeting.set(null);
      this.openActions.set([]);
      return;
    }
    this.openError.set(null);
    this.meeting.set(result.value);
    await this.loadActions();
    this.keepLive();
  }

  /** Today in the browser's time zone (`YYYY-MM-DD`), to say which actions are overdue. */
  today(): string {
    return dateInputValue(this.clock.now());
  }

  /** Reads the open actions of the open meeting's series, or of the meeting alone when it is a one-off. */
  async loadActions(): Promise<void> {
    const meeting = this.meeting();
    if (meeting === null) return;
    const generation = this.generation;
    const result = await this.api.listMeetingNotes({
      kind: 'action',
      status: 'open',
      ...(meeting.seriesId !== null
        ? { seriesId: meeting.seriesId }
        : { meetingId: meeting.id }),
    });
    if (generation !== this.generation) return;
    if (!result.ok) {
      this.actionsError.set(result.error);
      return;
    }
    this.actionsError.set(null);
    this.openActions.set(result.value.items);
  }

  /** Reads the open meeting again in a few seconds while it is in progress, and so on until it ends or closes. */
  private keepLive(): void {
    this.stopLive();
    const meeting = this.meeting();
    if (meeting === null || meeting.status !== 'in_progress') return;
    const generation = this.generation;
    this.timer = this.clock.schedule(LIVE_POLL_MS, () => {
      this.timer = null;
      if (generation === this.generation) void this.tick(meeting.id);
    });
  }

  private stopLive(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  /**
   * One live read: the meeting as others left it, unless a command of this page is in flight or changed the meeting
   * meanwhile (its own answer is newer), then the open actions.
   */
  private async tick(id: string): Promise<void> {
    const generation = this.generation;
    const before = this.meeting();
    if (!this.busy()) {
      const result = await this.api.getMeeting(id);
      if (generation !== this.generation) return;
      if (
        result.ok &&
        !this.busy() &&
        this.meeting() === before &&
        JSON.stringify(result.value) !== JSON.stringify(before)
      )
        this.meeting.set(result.value);
      await this.loadActions();
      if (generation !== this.generation) return;
    }
    this.keepLive();
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

  /**
   * Sets where the series' drafted stories are created in Jira (a null project turns creating off) and keeps the new
   * series in the list. The dialog shows the outcome itself, so the page's command error is left alone.
   */
  async setSeriesTarget(
    seriesId: string,
    projectKey: string | null,
    issueType: JiraIssueType
  ): Promise<ApiResult<MeetingSeries>> {
    this.busy.set(true);
    const result = await this.api.updateMeetingSeries(seriesId, {
      jiraProjectKey: projectKey,
      ...(projectKey !== null ? { jiraIssueType: issueType } : {}),
    });
    this.busy.set(false);
    if (result.ok)
      this.series.set(
        this.series().map((s) => (s.id === seriesId ? result.value : s))
      );
    return result;
  }

  /** Starts the open meeting: topics added from now on were raised in it. */
  async start(): Promise<void> {
    const id = this.meeting()?.id;
    if (id === undefined) return;
    const started = await this.run(() => this.api.startMeeting(id));
    if (started === null) return;
    this.meeting.set(started);
    this.keepLive();
    await this.refreshList();
  }

  /**
   * Ends (marks done) the open meeting, planned or in progress, carrying `carryOver` to the next one. Answers the ended
   * meeting and the meeting that took the topics (null when none went), or null when the API refused (the reason is in
   * `commandError`).
   */
  end(carryOver: readonly string[]): Promise<EndMeetingResult | null> {
    return this.close('end', carryOver);
  }

  /** Cancels the open meeting, which is planned, carrying `carryOver` to the next one; answers as `end` does. */
  cancel(carryOver: readonly string[]): Promise<EndMeetingResult | null> {
    return this.close('cancel', carryOver);
  }

  private async close(
    how: 'end' | 'cancel',
    carryOver: readonly string[]
  ): Promise<EndMeetingResult | null> {
    const id = this.meeting()?.id;
    if (id === undefined) return null;
    const body = { carryOver: [...carryOver] };
    const ended = await this.run(() =>
      how === 'end'
        ? this.api.endMeeting(id, body)
        : this.api.cancelMeeting(id, body)
    );
    if (ended === null) return null;
    this.meeting.set(ended.meeting);
    this.stopLive();
    await this.refreshList();
    await this.loadActions();
    return ended;
  }

  /** Adds a topic at the end of the open meeting; `stakeholder` (a name or an e-mail) only for a topic raised by them. */
  async addTopic(
    title: string,
    raisedBy: RaisedBy,
    stakeholder: string | null
  ): Promise<boolean> {
    const id = this.meeting()?.id;
    if (id === undefined) return false;
    const added = await this.run(() =>
      this.api.addMeetingTopic(id, {
        title: title.trim(),
        raisedBy,
        ...(raisedBy === 'them' && stakeholder !== null && stakeholder !== ''
          ? { raisedByStakeholder: stakeholder }
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
    if (!(await this.runEmpty(() => this.api.deleteMeetingTopic(topicId))))
      return;
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

  /**
   * Adds a note under a topic: a plain note, or a decision, an action (with its owner and due day) or a question, then
   * its images. Answers whether the note was added; an image refused after that shows in `commandError`.
   */
  async addNote(
    topicId: string,
    text: string,
    extras?: NoteExtras,
    images: readonly Blob[] = []
  ): Promise<boolean> {
    const owner = extras?.owner?.trim() ?? '';
    const note = await this.run(() =>
      this.api.addMeetingNote(topicId, {
        text: text.trim(),
        ...(extras !== undefined && extras.kind !== 'note'
          ? { kind: extras.kind }
          : {}),
        ...(extras?.kind === 'action' && owner !== '' ? { owner } : {}),
        ...(extras?.kind === 'action' && extras.dueOn
          ? { dueOn: extras.dueOn }
          : {}),
      })
    );
    if (note === null) return false;
    this.patchTopic(topicId, (t) => ({ ...t, notes: [...t.notes, note] }));
    if (note.kind === 'action') await this.loadActions();
    if (images.length > 0) await this.addNoteImages(note.id, images);
    return true;
  }

  /**
   * Adds images to a note, one after the other, each putting the note in place as the API answers it. Stops at the
   * first refusal (its reason is in `commandError`) and answers whether all were added.
   */
  async addNoteImages(
    noteId: string,
    images: readonly Blob[]
  ): Promise<boolean> {
    for (const image of images) {
      const note = await this.run(() =>
        this.api.addMeetingNoteImage(noteId, image)
      );
      if (note === null) return false;
      this.replaceNote(note);
    }
    return true;
  }

  /** Removes an image from a note. */
  async deleteNoteImage(noteId: string, imageId: string): Promise<boolean> {
    if (!(await this.runEmpty(() => this.api.deleteMeetingNoteImage(imageId))))
      return false;
    this.patchNote(noteId, (n) => ({
      ...n,
      images: n.images.filter((i) => i.id !== imageId),
    }));
    return true;
  }

  /** Reads an image's bytes once, for `imageUrls`; a failure leaves it out (the page shows a placeholder). */
  async loadImage(imageId: string): Promise<void> {
    if (this.imageReads.has(imageId)) return;
    this.imageReads.add(imageId);
    const result = await this.api.getMeetingNoteImage(imageId);
    if (!result.ok) return;
    const urls = new Map(this.imageUrls());
    urls.set(imageId, URL.createObjectURL(result.value));
    this.imageUrls.set(urls);
  }

  /**
   * Marks an action done or not done again, wherever it shows: under its topic in the open meeting and among the open
   * actions. Allowed after the meeting ended.
   */
  async setDone(noteId: string, done: boolean): Promise<boolean> {
    const note = await this.run(() =>
      this.api.setMeetingNoteDone(noteId, { done })
    );
    if (note === null) return false;
    this.replaceNote(note);
    this.openActions.set(
      done
        ? this.openActions().filter((a) => a.note.id !== noteId)
        : this.openActions().map((a) =>
            a.note.id === noteId ? { ...a, note } : a
          )
    );
    if (!done) await this.loadActions();
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
    if (!(await this.runEmpty(() => this.api.deleteMeetingNote(noteId))))
      return;
    this.patchTopic(topicId, (t) => ({
      ...t,
      notes: t.notes.filter((n) => n.id !== noteId),
    }));
    this.openActions.set(
      this.openActions().filter((a) => a.note.id !== noteId)
    );
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

  /** Like `run` for a command with no body in its answer: whether it worked. */
  private async runEmpty(
    command: () => Promise<ApiResult<null>>
  ): Promise<boolean> {
    this.busy.set(true);
    this.commandError.set(null);
    const result = await command();
    this.busy.set(false);
    if (!result.ok) this.commandError.set(result.error);
    return result.ok;
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

  /** Puts a changed note in place under its topic, when its topic is in the open meeting. */
  private replaceNote(note: MeetingNote): void {
    this.patchTopic(note.topicId, (t) => ({
      ...t,
      notes: t.notes.map((n) => (n.id === note.id ? note : n)),
    }));
  }

  /** Changes one note of the open meeting, wherever it is. */
  private patchNote(
    noteId: string,
    change: (note: MeetingNote) => MeetingNote
  ): void {
    const meeting = this.meeting();
    const topic = meeting?.topics.find((t) =>
      t.notes.some((n) => n.id === noteId)
    );
    if (topic === undefined) return;
    this.patchTopic(topic.id, (t) => ({
      ...t,
      notes: t.notes.map((n) => (n.id === noteId ? change(n) : n)),
    }));
  }
}
