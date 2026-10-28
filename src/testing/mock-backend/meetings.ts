/**
 * The mock's meetings with stakeholders (`/meetings`, `/meeting-topics`, `/meeting-notes`, `/meeting-series`), as
 * `packages/core/src/service/meetings.ts` of `ahoy-hosted` keeps the real ones: a meeting is planned, then in progress,
 * then ended (read-only), or ended straight from planned, or cancelled while planned; stakeholders are names or e-mails;
 * topics are raised by us or by a stakeholder, planned before the start or raised during it; ending or cancelling a
 * meeting carries the chosen open topics, notes and all, to the series' next meeting. A topic's story draft is
 * written by a simulated agent a moment after it is asked for, and "created" in a pretend Jira (design §5, slice 2); a
 * grill's simulated agent first asks two questions, then writes the story from the answers (slice 3). A note is a
 * decision, an action (with an owner, a due day and a done mark that changes after the meeting ended) or a question,
 * and the notes of one kind are listed across a series. 0 AIU, no Jira. Fictional data.
 */
import type {
  AddMeetingTopicRequest,
  CreateMeetingRequest,
  CreateMeetingSeriesRequest,
  EndMeetingResult,
  GrillAnswer,
  GrillQuestion,
  Meeting,
  ListMeetingNotesQuery,
  MeetingNote,
  MeetingNoteAnswerResult,
  MeetingNoteInContext,
  MeetingNoteRequest,
  MeetingSeries,
  MeetingStatus,
  MeetingStoryDraft,
  MeetingStoryAnswersRequest,
  MeetingStoryDraftRequest,
  MeetingSummary,
  MeetingTopic,
  MoveMeetingTopicResult,
  StoryTemplate,
  UpdateMeetingRequest,
  UpdateMeetingSeriesRequest,
  UpdateMeetingTopicRequest,
} from '@core/api/types';
import {
  isClosed,
  MAX_IMAGES_PER_NOTE,
  MAX_NOTE_IMAGE_BYTES,
  normalizeStakeholders,
  noteKindFields,
  sniffImageType,
  stakeholderName,
  type NoteImageType,
} from '@domain/meetings';
import { iso, type Cancel, type MockClock } from './clock';
import { MockProblem } from './http';
import type { Writable } from './voyage';

const KNOWN_NAMES: ReadonlyMap<string, string> = new Map([
  ['alex@example.com', 'Alex Example'],
  ['dev@example.com', 'Dev Example'],
]);

const DAY_MS = 86_400_000;
const HALF_HOUR_MS = 1_800_000;

type SeriesRecord = Writable<MeetingSeries>;
type MeetingRecord = Writable<
  Omit<MeetingSummary, 'topicCount' | 'openTopicCount' | 'seriesName'>
>;
type TopicRecord = Writable<
  Omit<MeetingTopic, 'notes' | 'carriedFrom' | 'movedTo'>
> & {
  carriedFromTopicId: string | null;
  movedToTopicId: string | null;
};
type NoteRecord = Writable<MeetingNote>;
type DraftRecord = Writable<MeetingStoryDraft> & {
  discarded: boolean;
  /** Stops the simulated agent of a draft still being written. */
  cancel: Cancel | null;
};

/** How long the simulated agent takes to write a story. */
export const MOCK_DRAFT_MS = 1_500;
/** The cap a draft gets when the request names none (5 AIU), as the server's `meeting_story` configuration. */
const DEFAULT_DRAFT_BUDGET = 5_000_000_000;

const notFound = (what: string, id: string) =>
  new MockProblem('not_found', `${what} ${id} does not exist`);
const invalid = (message: string) => new MockProblem('invalid_state', message);
const refused = (path: string, message: string) =>
  new MockProblem('validation_failed', message, {
    errors: [{ path, message }],
  });

/** The meetings of a mock world. */
export class MeetingDesk {
  private readonly series = new Map<string, SeriesRecord>();
  private readonly meetings = new Map<string, MeetingRecord>();
  private readonly topics = new Map<string, TopicRecord>();
  private readonly notes = new Map<string, NoteRecord>();
  /** The bytes of each note image, by image id; a carried-over copy shares its original's bytes. */
  private readonly imageBytes = new Map<
    string,
    { readonly bytes: Uint8Array; readonly mediaType: NoteImageType }
  >();
  private readonly drafts = new Map<string, DraftRecord>();
  private nextId = 1;
  private nextIssue = 123;
  /** When set, the pretend Jira refuses every issue with this message (a spec's switch). */
  jiraRefuses: string | null = null;

  constructor(private readonly clock: MockClock) {}

  /** A new UUID, in order, so a mock world is the same every time. */
  private id(): string {
    return `00000000-0000-4000-8000-${(this.nextId++).toString(16).padStart(12, '0')}`;
  }

  /** What the real API knows about a person after their first request: a name, or `null` for anyone unknown. */
  private nameOf(actor: string): string | null {
    return KNOWN_NAMES.get(actor) ?? null;
  }

  private now(): string {
    return iso(this.clock.now());
  }

  /** The seeded Finance sync: last week's meeting ended, this week's running since half an hour ago, next week's planned. */
  seed(at: number): void {
    const alex = 'alex@example.com';
    const series = this.createSeries(alex, {
      name: 'Finance sync',
      stakeholders: ['priya@example.com', 'jordan@example.com'],
      cadenceDays: 7,
      jiraProjectKey: 'PROJ',
    });
    const startOf = (days: number) => iso(at - HALF_HOUR_MS + days * DAY_MS);
    const endOf = (days: number) => iso(at + HALF_HOUR_MS + days * DAY_MS);
    const past = this.insertMeeting(
      alex,
      series.id,
      'Finance sync',
      startOf(-7),
      endOf(-7),
      series.stakeholders
    );
    this.addTopic(alex, past.id, {
      title: 'Dashboard exports time out',
      raisedBy: 'us',
    });
    past.status = 'ended';
    past.startedAt = startOf(-7);
    past.endedAt = endOf(-7);
    const now = this.insertMeeting(
      alex,
      series.id,
      'Finance sync',
      startOf(0),
      endOf(0),
      series.stakeholders
    );
    this.insertMeeting(
      alex,
      series.id,
      'Finance sync',
      startOf(7),
      endOf(7),
      series.stakeholders
    );
    const reminders = this.addTopic(alex, now.id, {
      title: 'Overdue invoice reminders',
      raisedBy: 'us',
    });
    this.addTopic(alex, now.id, {
      title: 'Tax ID validation for EU customers',
      raisedBy: 'them',
      raisedByStakeholder: 'jordan@example.com',
    });
    this.addNote(alex, reminders.id, {
      text: 'About 120 reminders a month are sent by hand.',
    });
    now.status = 'in_progress';
    now.startedAt = startOf(0);
    const fees = this.addTopic(alex, now.id, {
      title: 'Late fees for enterprise accounts',
      raisedBy: 'them',
      raisedByStakeholder: 'priya@example.com',
    });
    this.addNote(alex, fees.id, {
      text: '1.5% per month, capped at 10% of the invoice.',
    });
    // Last week's meeting left an action open; added after the rest so the seeded ids stay as they were.
    const exports = this.topicsOf(past.id)[0]!;
    this.insertNote(alex, exports.id, {
      text: 'Profile the export query on the largest account',
      kind: 'action',
      owner: 'Sam',
      dueOn: iso(at - 2 * DAY_MS).slice(0, 10),
    });
    this.insertNote(alex, exports.id, {
      text: 'Exports stay synchronous for now',
      kind: 'decision',
    });
  }

  /** Every meeting, optionally of one status, latest start first. */
  list(status?: MeetingStatus): MeetingSummary[] {
    return [...this.meetings.values()]
      .filter((m) => status === undefined || m.status === status)
      .sort((a, b) =>
        a.startsAt < b.startsAt
          ? 1
          : a.startsAt > b.startsAt
            ? -1
            : a.id < b.id
              ? -1
              : 1
      )
      .map((m) => this.summary(m));
  }

  /** One meeting with its topics and notes, or `404 not_found`. */
  get(id: string): Meeting {
    return this.meetingDto(this.meeting(id));
  }

  create(actor: string, body: CreateMeetingRequest): Meeting {
    const series =
      body.seriesId === undefined ? undefined : this.series.get(body.seriesId);
    if (body.seriesId !== undefined && series === undefined)
      throw notFound('Series', body.seriesId);
    const title = body.title?.trim() || series?.name;
    if (!title)
      throw refused(
        'body/title',
        'title is required for a meeting outside a series'
      );
    this.checkTimes(body.startsAt, body.endsAt ?? null);
    const meeting = this.insertMeeting(
      actor,
      series?.id ?? null,
      title,
      body.startsAt,
      body.endsAt ?? null,
      normalizeStakeholders(body.stakeholders ?? series?.stakeholders ?? [])
    );
    return this.meetingDto(meeting);
  }

  update(actor: string, id: string, body: UpdateMeetingRequest): Meeting {
    const meeting = this.openMeeting(id);
    const startsAt = body.startsAt ?? meeting.startsAt;
    const endsAt = body.endsAt === undefined ? meeting.endsAt : body.endsAt;
    this.checkTimes(startsAt, endsAt);
    if (body.title !== undefined) meeting.title = body.title.trim();
    if (body.stakeholders !== undefined)
      meeting.stakeholders = normalizeStakeholders(body.stakeholders);
    meeting.startsAt = startsAt;
    meeting.endsAt = endsAt;
    this.touch(meeting, actor);
    return this.meetingDto(meeting);
  }

  start(actor: string, id: string): Meeting {
    const meeting = this.meeting(id);
    if (meeting.status !== 'planned')
      throw invalid(
        `Only a planned meeting can start; this one is ${meeting.status}`
      );
    meeting.status = 'in_progress';
    meeting.startedAt = this.now();
    this.touch(meeting, actor);
    return this.meetingDto(meeting);
  }

  /** Ends (marks done) a meeting, planned or in progress, carrying `carryOver` to the next one. */
  end(
    actor: string,
    id: string,
    carryOver: readonly string[]
  ): EndMeetingResult {
    const meeting = this.meeting(id);
    if (isClosed(meeting.status))
      throw invalid(
        `Only a planned meeting or one in progress can end; this one is ${meeting.status}`
      );
    return this.close(actor, meeting, 'ended', carryOver);
  }

  /** Cancels a planned meeting, carrying `carryOver` to the next one. */
  cancel(
    actor: string,
    id: string,
    carryOver: readonly string[]
  ): EndMeetingResult {
    const meeting = this.meeting(id);
    if (meeting.status !== 'planned')
      throw invalid(
        `Only a planned meeting can be cancelled; this one is ${meeting.status}`
      );
    return this.close(actor, meeting, 'cancelled', carryOver);
  }

  private close(
    actor: string,
    meeting: MeetingRecord,
    status: 'ended' | 'cancelled',
    carryOver: readonly string[]
  ): EndMeetingResult {
    const id = meeting.id;
    if (new Set(carryOver).size !== carryOver.length)
      throw refused('body/carryOver', 'carryOver names a topic twice');
    const open = new Set(
      this.topicsOf(id)
        .filter((t) => t.status === 'open')
        .map((t) => t.id)
    );
    const bad = carryOver.filter((t) => !open.has(t));
    if (bad.length > 0)
      throw refused(
        'body/carryOver',
        `carryOver names topics that are not open topics of this meeting: ${bad.join(', ')}`
      );
    let next: MeetingRecord | null = null;
    if (carryOver.length > 0) {
      next = this.nextMeetingOf(meeting, actor);
      for (const topic of this.topicsOf(id))
        if (carryOver.includes(topic.id)) this.carry(topic, next, actor);
    }
    meeting.status = status;
    meeting.endedAt = this.now();
    this.touch(meeting, actor);
    return {
      meeting: this.meetingDto(meeting),
      nextMeeting: next === null ? null : this.meetingDto(next),
    };
  }

  addTopic(
    actor: string,
    meetingId: string,
    body: AddMeetingTopicRequest
  ): MeetingTopic {
    const meeting = this.openMeeting(meetingId);
    const stakeholder = stakeholderName(body.raisedByStakeholder ?? '') || null;
    if (body.raisedBy === 'us' && stakeholder !== null)
      throw refused(
        'body/raisedByStakeholder',
        'raisedByStakeholder is only for a topic raised by them'
      );
    const at = this.now();
    const topic: TopicRecord = {
      id: this.id(),
      meetingId,
      title: body.title.trim(),
      raisedBy: body.raisedBy,
      raisedByStakeholder: stakeholder,
      origin: meeting.status === 'planned' ? 'planned' : 'in_meeting',
      status: 'open',
      position: this.topicsOf(meetingId).length,
      carriedFromTopicId: null,
      movedToTopicId: null,
      createdBy: actor,
      createdByName: this.nameOf(actor),
      createdAt: at,
      updatedBy: actor,
      updatedByName: this.nameOf(actor),
      updatedAt: at,
    };
    this.topics.set(topic.id, topic);
    return this.topicDto(topic);
  }

  updateTopic(
    actor: string,
    id: string,
    body: UpdateMeetingTopicRequest
  ): MeetingTopic {
    const topic = this.changeableTopic(id);
    const raisedBy = body.raisedBy ?? topic.raisedBy;
    const wanted =
      body.raisedByStakeholder !== undefined
        ? body.raisedByStakeholder
        : body.raisedBy === 'us'
          ? null
          : topic.raisedByStakeholder;
    const stakeholder = stakeholderName(wanted ?? '') || null;
    if (raisedBy === 'us' && stakeholder !== null)
      throw refused(
        'body/raisedByStakeholder',
        'raisedByStakeholder is only for a topic raised by them'
      );
    if (body.title !== undefined) topic.title = body.title.trim();
    topic.raisedBy = raisedBy;
    topic.raisedByStakeholder = stakeholder;
    topic.updatedBy = actor;
    topic.updatedByName = this.nameOf(actor);
    topic.updatedAt = this.now();
    return this.topicDto(topic);
  }

  deleteTopic(id: string): void {
    this.changeableTopic(id);
    for (const note of [...this.notes.values()])
      if (note.topicId === id) this.notes.delete(note.id);
    for (const draft of [...this.drafts.values()])
      if (draft.topicId === id) {
        draft.cancel?.();
        this.drafts.delete(draft.id);
      }
    for (const other of this.topics.values()) {
      if (other.movedToTopicId === id) other.movedToTopicId = null;
      if (other.carriedFromTopicId === id) other.carriedFromTopicId = null;
    }
    this.topics.delete(id);
  }

  order(
    actor: string,
    meetingId: string,
    topicIds: readonly string[]
  ): Meeting {
    const meeting = this.openMeeting(meetingId);
    const current = this.topicsOf(meetingId).map((t) => t.id);
    if (new Set(topicIds).size !== topicIds.length)
      throw refused('body/topicIds', 'topicIds names a topic twice');
    const unknown = topicIds.filter((t) => !current.includes(t));
    if (unknown.length > 0)
      throw refused(
        'body/topicIds',
        `topicIds names topics this meeting does not have: ${unknown.join(', ')}`
      );
    const missing = current.filter((t) => !topicIds.includes(t));
    if (missing.length > 0)
      throw refused(
        'body/topicIds',
        `topicIds leaves out topics of this meeting: ${missing.join(', ')}`
      );
    topicIds.forEach((topicId, position) => {
      const topic = this.topics.get(topicId);
      if (topic !== undefined && topic.position !== position) {
        topic.position = position;
        topic.updatedBy = actor;
        topic.updatedByName = this.nameOf(actor);
        topic.updatedAt = this.now();
      }
    });
    return this.meetingDto(meeting);
  }

  move(actor: string, id: string): MoveMeetingTopicResult {
    const topic = this.changeableTopic(id);
    const next = this.nextMeetingOf(this.meeting(topic.meetingId), actor);
    const copy = this.carry(topic, next, actor);
    return { topic: this.topicDto(topic), movedTo: this.topicDto(copy) };
  }

  addNote(
    actor: string,
    topicId: string,
    body: MeetingNoteRequest
  ): MeetingNote {
    this.changeableTopic(topicId);
    return { ...this.insertNote(actor, topicId, body) };
  }

  /** Adds a note with no check of its topic (the seeds add some to an ended meeting). */
  private insertNote(
    actor: string,
    topicId: string,
    body: MeetingNoteRequest
  ): NoteRecord {
    const fields = this.kindFields(
      { kind: 'note', owner: null, dueOn: null },
      body
    );
    const at = this.now();
    const note: NoteRecord = {
      id: this.id(),
      topicId,
      text: body.text.trim(),
      ...fields,
      doneAt: null,
      doneBy: null,
      doneByName: null,
      answerTo: null,
      images: [],
      createdBy: actor,
      createdByName: this.nameOf(actor),
      createdAt: at,
      updatedBy: actor,
      updatedByName: this.nameOf(actor),
      updatedAt: at,
    };
    this.notes.set(note.id, note);
    return note;
  }

  updateNote(actor: string, id: string, body: MeetingNoteRequest): MeetingNote {
    const note = this.changeableNote(id);
    const fields = this.kindFields(note, body);
    if (note.answerTo !== null && fields.kind !== 'note')
      throw refused('body/kind', 'An answer stays a plain note');
    if (
      note.kind === 'question' &&
      fields.kind !== 'question' &&
      this.answersOf(id).length > 0
    )
      throw invalid(
        `Question ${id} has answers; remove them before it becomes a ${fields.kind}`
      );
    const kindChanged = fields.kind !== note.kind;
    note.text = body.text.trim();
    Object.assign(note, fields);
    if (kindChanged) {
      note.doneAt = null;
      note.doneBy = null;
      note.doneByName = null;
    }
    note.updatedBy = actor;
    note.updatedByName = this.nameOf(actor);
    note.updatedAt = this.now();
    return { ...note };
  }

  /**
   * Marks an action done or a question answered, or open again; also after its meeting ended, but not under a topic
   * that moved on.
   */
  setNoteDone(actor: string, id: string, done: boolean): MeetingNote {
    const note = this.unmovedNote(id);
    if (note.kind !== 'action' && note.kind !== 'question')
      throw invalid(
        `Note ${id} is a ${note.kind}; only an action is done and only a question answered`
      );
    this.markDone(note, actor, done);
    return { ...note };
  }

  /**
   * Answers a question with a plain note under its topic, marking it answered when it was open; also after its meeting
   * ended, but not under a topic that moved on.
   */
  answer(
    actor: string,
    questionId: string,
    text: string
  ): MeetingNoteAnswerResult {
    const question = this.unmovedNote(questionId);
    if (question.kind !== 'question')
      throw invalid(
        `Note ${questionId} is a ${question.kind}; only a question takes answers`
      );
    const answer = this.insertNote(actor, question.topicId, { text });
    answer.answerTo = questionId;
    if (question.doneAt === null) this.markDone(question, actor, true);
    return { question: { ...question }, answer: { ...answer } };
  }

  private unmovedNote(id: string): NoteRecord {
    const note = this.notes.get(id);
    if (note === undefined) throw notFound('Note', id);
    if (this.topics.get(note.topicId)?.status === 'moved')
      throw invalid(`The topic of note ${id} was moved to the next meeting`);
    return note;
  }

  private markDone(note: NoteRecord, actor: string, done: boolean): void {
    note.doneAt = done ? this.now() : null;
    note.doneBy = done ? actor : null;
    note.doneByName = done ? this.nameOf(actor) : null;
  }

  private answersOf(questionId: string): NoteRecord[] {
    return [...this.notes.values()].filter((n) => n.answerTo === questionId);
  }

  /** The notes of one kind across meetings, latest meeting first; a moved topic's notes are left to its copy. */
  listNotes(query: ListMeetingNotesQuery): MeetingNoteInContext[] {
    if (
      query.status !== undefined &&
      query.kind !== 'action' &&
      query.kind !== 'question'
    )
      throw refused(
        'query.status',
        'status is only for notes of kind action or question'
      );
    const rows: MeetingNoteInContext[] = [];
    for (const meeting of this.list()) {
      if (query.seriesId !== undefined && meeting.seriesId !== query.seriesId)
        continue;
      if (query.meetingId !== undefined && meeting.id !== query.meetingId)
        continue;
      for (const topic of this.topicsOf(meeting.id)) {
        if (topic.status === 'moved') continue;
        for (const note of this.topicDto(topic).notes) {
          if (note.kind !== query.kind) continue;
          if (
            query.status !== undefined &&
            (note.doneAt === null) !== (query.status === 'open')
          )
            continue;
          rows.push({
            note,
            topicTitle: topic.title,
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            meetingStartsAt: meeting.startsAt,
            seriesId: meeting.seriesId,
          });
        }
      }
    }
    return rows.slice(0, 500);
  }

  private kindFields(
    current: Pick<NoteRecord, 'kind' | 'owner' | 'dueOn'>,
    body: MeetingNoteRequest
  ) {
    const fields = noteKindFields(current, body);
    if (typeof fields === 'string')
      throw refused(body.owner ? 'body/owner' : 'body/dueOn', fields);
    return fields;
  }

  /**
   * Adds an image to a note that can still change; its format comes from its bytes, as the API reads it. At most
   * {@link MAX_IMAGES_PER_NOTE} per note and {@link MAX_NOTE_IMAGE_BYTES} each.
   */
  addNoteImage(actor: string, noteId: string, bytes: Uint8Array): MeetingNote {
    const note = this.changeableNote(noteId);
    const mediaType = sniffImageType(bytes);
    if (bytes.length > MAX_NOTE_IMAGE_BYTES)
      throw refused('body', `must be at most ${MAX_NOTE_IMAGE_BYTES} bytes`);
    if (mediaType === null)
      throw refused('body', 'The file is not a PNG, JPEG, WebP or GIF image');
    if (note.images.length >= MAX_IMAGES_PER_NOTE)
      throw invalid(`Note ${noteId} already has ${MAX_IMAGES_PER_NOTE} images`);
    const id = this.id();
    this.imageBytes.set(id, { bytes: bytes.slice(), mediaType });
    note.images = [
      ...note.images,
      {
        id,
        mediaType,
        sizeBytes: bytes.length,
        createdBy: actor,
        createdAt: this.now(),
      },
    ];
    return { ...note };
  }

  /** The bytes and format of a note's image. */
  noteImage(id: string): {
    readonly bytes: Uint8Array;
    readonly mediaType: NoteImageType;
  } {
    const image = this.imageBytes.get(id);
    if (image === undefined) throw notFound('Image', id);
    return image;
  }

  /** Removes an image from a note that can still change. */
  deleteNoteImage(id: string): void {
    const note = [...this.notes.values()].find((n) =>
      n.images.some((i) => i.id === id)
    );
    if (note === undefined) throw notFound('Image', id);
    this.changeableNote(note.id);
    note.images = note.images.filter((i) => i.id !== id);
    this.imageBytes.delete(id);
  }

  /** Removes a note, and a question's answers with it. */
  deleteNote(id: string): void {
    this.changeableNote(id);
    this.notes.delete(id);
    for (const answer of this.answersOf(id)) this.notes.delete(answer.id);
  }

  listSeries(): MeetingSeries[] {
    return [...this.series.values()]
      .sort(
        (a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
          (a.id < b.id ? -1 : 1)
      )
      .map((s) => ({ ...s, stakeholders: [...s.stakeholders] }));
  }

  createSeries(actor: string, body: CreateMeetingSeriesRequest): MeetingSeries {
    const series: SeriesRecord = {
      id: this.id(),
      name: body.name.trim(),
      stakeholders: normalizeStakeholders(body.stakeholders ?? []),
      cadenceDays: body.cadenceDays ?? null,
      jiraProjectKey: body.jiraProjectKey ?? null,
      jiraIssueType: body.jiraIssueType ?? 'Story',
      createdBy: actor,
      createdByName: this.nameOf(actor),
      createdAt: this.now(),
    };
    this.series.set(series.id, series);
    return { ...series, stakeholders: [...series.stakeholders] };
  }

  /** Sets where the series' stories are created in Jira; a null project turns creating off. */
  updateSeries(id: string, body: UpdateMeetingSeriesRequest): MeetingSeries {
    const series = this.series.get(id);
    if (series === undefined) throw notFound('Series', id);
    series.jiraProjectKey = body.jiraProjectKey;
    series.jiraIssueType = body.jiraIssueType ?? 'Story';
    return { ...series, stakeholders: [...series.stakeholders] };
  }

  /** Asks the simulated agent for a story from the topic and the chosen notes (all of them when none are chosen). */
  requestDraft(
    actor: string,
    topicId: string,
    body: MeetingStoryDraftRequest
  ): MeetingStoryDraft {
    const topic = this.topics.get(topicId);
    if (topic === undefined) throw notFound('Topic', topicId);
    if (topic.status === 'moved')
      throw invalid(
        `Topic ${topicId} was moved to the next meeting; draft its story there`
      );
    const noteIds = [...new Set(body.noteIds ?? [])];
    const notes = [...this.notes.values()].filter((n) => n.topicId === topicId);
    const unknown = noteIds.find((id) => !notes.some((n) => n.id === id));
    if (unknown !== undefined)
      throw refused(
        'body/noteIds',
        `Note ${unknown} is not a note of topic ${topicId}`
      );
    if (
      [...this.drafts.values()].some(
        (d) => d.topicId === topicId && !d.discarded && d.jiraKey === null
      )
    )
      throw invalid(
        `Topic ${topicId} already has a story draft; create it in Jira or discard it first`
      );
    const mode = body.mode ?? 'draft';
    const draft: DraftRecord = {
      id: this.id(),
      topicId,
      meetingId: topic.meetingId,
      topicTitle: topic.title,
      noteIds,
      mode,
      status: 'drafting',
      story: null,
      failure: null,
      questions: null,
      answers: null,
      spentNanoAiu: 0,
      target: this.targetOf(topic.meetingId),
      jiraKey: null,
      jiraUrl: null,
      jiraCreatedBy: null,
      jiraCreatedAt: null,
      run: {
        status: 'running',
        budgetNanoAiu: body.budgetNanoAiu ?? DEFAULT_DRAFT_BUDGET,
        nanoAiu: 0,
        cancelRequested: false,
      },
      createdBy: actor,
      createdAt: this.now(),
      discarded: false,
      cancel: null,
    };
    const chosen = noteIds.length
      ? notes.filter((n) => noteIds.includes(n.id))
      : notes;
    draft.cancel = this.clock.schedule(MOCK_DRAFT_MS, () => {
      draft.cancel = null;
      draft.run = { ...draft.run!, status: 'succeeded' };
      if (mode === 'grill') {
        draft.status = 'asking';
        draft.questions = simulatedQuestions(topic.title);
        return;
      }
      draft.status = 'ready';
      draft.story = simulatedStory(
        topic.title,
        chosen.map((n) => n.text)
      );
    });
    this.drafts.set(draft.id, draft);
    return this.draftDto(draft);
  }

  /** Keeps a grill's answers, once, and has the simulated agent write the story from them a moment later. */
  answerQuestions(
    id: string,
    body: MeetingStoryAnswersRequest
  ): MeetingStoryDraft {
    const draft = this.draft(id);
    if (draft.mode !== 'grill')
      throw invalid(
        `Story draft ${id} was written without questions; it takes no answers`
      );
    if (draft.status !== 'asking' || draft.questions === null)
      throw invalid(
        `Story draft ${id} is ${draft.status}; only a grill waiting for answers takes them`
      );
    const answers = grillAnswers(draft.questions, body.answers);
    const notes = [...this.notes.values()].filter(
      (n) =>
        n.topicId === draft.topicId &&
        (draft.noteIds.length === 0 || draft.noteIds.includes(n.id))
    );
    draft.answers = answers;
    draft.status = 'drafting';
    draft.run = {
      status: 'running',
      budgetNanoAiu: body.budgetNanoAiu ?? DEFAULT_DRAFT_BUDGET,
      nanoAiu: 0,
      cancelRequested: false,
    };
    draft.cancel = this.clock.schedule(MOCK_DRAFT_MS, () => {
      draft.cancel = null;
      draft.status = 'ready';
      const story = simulatedStory(
        draft.topicTitle,
        notes.map((n) => n.text)
      );
      draft.story = {
        ...story,
        acceptanceCriteria: [
          ...story.acceptanceCriteria,
          ...answers.flatMap((a) =>
            a.answer === null ? [] : [`As answered: ${a.answer}`.slice(0, 1000)]
          ),
        ].slice(0, 20),
        openQuestions: [
          ...story.openQuestions,
          ...answers.flatMap((a) => (a.answer === null ? [a.question] : [])),
        ].slice(0, 20),
      };
      draft.run = { ...draft.run!, status: 'succeeded' };
    });
    return this.draftDto(draft);
  }

  /** A spec's switch: the simulated agent's reply was not a story. */
  failDraft(id: string, failure: string): void {
    const draft = this.draft(id);
    draft.cancel?.();
    draft.cancel = null;
    draft.status = 'failed';
    draft.failure = failure;
    draft.run = { ...draft.run!, status: 'failed' };
  }

  getDraft(id: string): MeetingStoryDraft {
    return this.draftDto(this.draft(id));
  }

  /** The meeting's drafts that were not discarded, newest first. */
  listDrafts(meetingId: string): MeetingStoryDraft[] {
    this.meeting(meetingId);
    return [...this.drafts.values()]
      .filter((d) => d.meetingId === meetingId && !d.discarded)
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id < b.id
            ? 1
            : -1
          : a.createdAt < b.createdAt
            ? 1
            : -1
      )
      .map((d) => this.draftDto(d));
  }

  /** Discards a draft not yet created in Jira; a draft still being written stops. */
  discardDraft(id: string): void {
    const draft = this.draft(id);
    if (draft.jiraKey !== null)
      throw invalid(
        `Story draft ${id} was created in Jira as ${draft.jiraKey}`
      );
    if (draft.cancel !== null) {
      draft.cancel();
      draft.cancel = null;
      draft.run = { ...draft.run!, status: 'cancelled', cancelRequested: true };
    }
    draft.discarded = true;
  }

  /** "Creates" a ready draft's story in the pretend Jira, once; a second call answers the same issue. */
  createIssue(actor: string, id: string): MeetingStoryDraft {
    const draft = this.draft(id);
    if (draft.jiraKey !== null) return this.draftDto(draft);
    if (draft.status !== 'ready')
      throw invalid(
        `Story draft ${id} is ${draft.status}; only a ready draft can be created in Jira`
      );
    const meeting = this.meeting(draft.meetingId);
    const series =
      meeting.seriesId === null ? undefined : this.series.get(meeting.seriesId);
    if (series === undefined)
      throw invalid(
        "A one-off meeting has no Jira project; only a series' meetings create stories"
      );
    if (series.jiraProjectKey === null)
      throw invalid(`Series ${series.name} has no Jira project; set it first`);
    if (this.jiraRefuses !== null)
      throw new MockProblem('unavailable', this.jiraRefuses);
    const key = `${series.jiraProjectKey}-${this.nextIssue++}`;
    draft.status = 'created';
    draft.jiraKey = key;
    draft.jiraUrl = `https://jira.example.com/browse/${key}`;
    draft.jiraCreatedBy = actor;
    draft.jiraCreatedAt = this.now();
    return this.draftDto(draft);
  }

  private draft(id: string): DraftRecord {
    const draft = this.drafts.get(id);
    if (draft === undefined || draft.discarded)
      throw notFound('Story draft', id);
    return draft;
  }

  /** Where Create in Jira puts a meeting's stories: its series' project, if it has one. */
  private targetOf(meetingId: string): MeetingStoryDraft['target'] {
    const seriesId = this.meeting(meetingId).seriesId;
    const series = seriesId === null ? undefined : this.series.get(seriesId);
    return {
      projectKey: series?.jiraProjectKey ?? null,
      issueType: series === undefined ? null : series.jiraIssueType,
    };
  }

  private draftDto(draft: DraftRecord): MeetingStoryDraft {
    const dto: Partial<DraftRecord> = { ...draft };
    delete dto.discarded;
    delete dto.cancel;
    // The target follows the series, as the API reads it on every answer.
    return {
      ...(dto as Writable<MeetingStoryDraft>),
      target: this.targetOf(draft.meetingId),
    };
  }

  private insertMeeting(
    actor: string,
    seriesId: string | null,
    title: string,
    startsAt: string,
    endsAt: string | null,
    stakeholders: readonly string[]
  ): MeetingRecord {
    const at = this.now();
    const meeting: MeetingRecord = {
      id: this.id(),
      seriesId,
      title,
      startsAt,
      endsAt,
      stakeholders: [...stakeholders],
      status: 'planned',
      startedAt: null,
      endedAt: null,
      createdBy: actor,
      createdByName: this.nameOf(actor),
      createdAt: at,
      updatedBy: actor,
      updatedByName: this.nameOf(actor),
      updatedAt: at,
    };
    this.meetings.set(meeting.id, meeting);
    return meeting;
  }

  private checkTimes(startsAt: string, endsAt: string | null): void {
    if (endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt))
      throw refused('body/endsAt', 'endsAt must be after startsAt');
  }

  private touch(meeting: MeetingRecord, actor: string): void {
    meeting.updatedBy = actor;
    meeting.updatedByName = this.nameOf(actor);
    meeting.updatedAt = this.now();
  }

  private meeting(id: string): MeetingRecord {
    const meeting = this.meetings.get(id);
    if (meeting === undefined) throw notFound('Meeting', id);
    return meeting;
  }

  private openMeeting(id: string): MeetingRecord {
    const meeting = this.meeting(id);
    if (isClosed(meeting.status))
      throw invalid(`Meeting ${id} is ${meeting.status}; it is read-only`);
    return meeting;
  }

  private changeableTopic(id: string): TopicRecord {
    const topic = this.topics.get(id);
    if (topic === undefined) throw notFound('Topic', id);
    const status = this.meeting(topic.meetingId).status;
    if (isClosed(status))
      throw invalid(`The meeting of topic ${id} is ${status}; it is read-only`);
    if (topic.status === 'moved')
      throw invalid(
        `Topic ${id} was moved to the next meeting; change it there`
      );
    return topic;
  }

  /** A note that can change: its topic can, or it is an answer, which can change after its meeting closed. */
  private changeableNote(id: string): NoteRecord {
    const note = this.notes.get(id);
    if (note === undefined) throw notFound('Note', id);
    if (note.answerTo !== null) return this.unmovedNote(id);
    this.changeableTopic(note.topicId);
    return note;
  }

  private topicsOf(meetingId: string): TopicRecord[] {
    return [...this.topics.values()]
      .filter((t) => t.meetingId === meetingId)
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
  }

  /** The series' first planned meeting after this one; else a new one a cadence on; else `409 invalid_state`. */
  private nextMeetingOf(meeting: MeetingRecord, actor: string): MeetingRecord {
    if (meeting.seriesId === null)
      throw invalid('A one-off meeting has no next meeting to move topics to');
    const next = [...this.meetings.values()]
      .filter(
        (m) =>
          m.seriesId === meeting.seriesId &&
          m.status === 'planned' &&
          m.id !== meeting.id &&
          m.startsAt > meeting.startsAt
      )
      .sort((a, b) =>
        a.startsAt < b.startsAt
          ? -1
          : a.startsAt > b.startsAt
            ? 1
            : a.id < b.id
              ? -1
              : 1
      )[0];
    if (next !== undefined) return next;
    const series = this.series.get(meeting.seriesId);
    if (series === undefined || series.cadenceDays === null)
      throw invalid(
        `Series ${series?.name ?? meeting.seriesId} has no planned meeting after this one; plan it first`
      );
    const step = series.cadenceDays * DAY_MS;
    const start = Date.parse(meeting.startsAt);
    const after = Math.max(start, this.clock.now());
    const at = start + (Math.floor((after - start) / step) + 1) * step;
    const length =
      meeting.endsAt === null ? null : Date.parse(meeting.endsAt) - start;
    return this.insertMeeting(
      actor,
      meeting.seriesId,
      meeting.title,
      iso(at),
      length === null ? null : iso(at + length),
      meeting.stakeholders
    );
  }

  /** Copies a topic and its notes to the end of `next` and marks the original moved; returns the copy. */
  private carry(
    topic: TopicRecord,
    next: MeetingRecord,
    actor: string
  ): TopicRecord {
    const at = this.now();
    const copy: TopicRecord = {
      ...topic,
      id: this.id(),
      meetingId: next.id,
      origin: 'planned',
      status: 'open',
      position: this.topicsOf(next.id).length,
      carriedFromTopicId: topic.id,
      movedToTopicId: null,
      createdBy: actor,
      createdByName: this.nameOf(actor),
      createdAt: at,
      updatedBy: actor,
      updatedByName: this.nameOf(actor),
      updatedAt: at,
    };
    this.topics.set(copy.id, copy);
    const notes = [...this.notes.values()].filter(
      (n) => n.topicId === topic.id
    );
    const copyIds = new Map(notes.map((n) => [n.id, this.id()]));
    for (const note of notes) {
      const noteId = copyIds.get(note.id)!;
      const images = note.images.map((image) => {
        const imageId = this.id();
        this.imageBytes.set(imageId, this.noteImage(image.id));
        return { ...image, id: imageId };
      });
      this.notes.set(noteId, {
        ...note,
        id: noteId,
        topicId: copy.id,
        answerTo:
          note.answerTo === null ? null : (copyIds.get(note.answerTo) ?? null),
        images,
      });
    }
    topic.status = 'moved';
    topic.movedToTopicId = copy.id;
    topic.updatedBy = actor;
    topic.updatedByName = this.nameOf(actor);
    topic.updatedAt = at;
    return copy;
  }

  private summary(meeting: MeetingRecord): MeetingSummary {
    const topics = this.topicsOf(meeting.id);
    return {
      ...meeting,
      stakeholders: [...meeting.stakeholders],
      seriesName:
        meeting.seriesId === null
          ? null
          : (this.series.get(meeting.seriesId)?.name ?? null),
      topicCount: topics.length,
      openTopicCount: topics.filter((t) => t.status === 'open').length,
    };
  }

  private meetingDto(meeting: MeetingRecord): Meeting {
    return {
      ...this.summary(meeting),
      topics: this.topicsOf(meeting.id).map((t) => this.topicDto(t)),
    };
  }

  private link(topicId: string | null): MeetingTopic['carriedFrom'] {
    const topic = topicId === null ? undefined : this.topics.get(topicId);
    const meeting =
      topic === undefined ? undefined : this.meetings.get(topic.meetingId);
    return topic === undefined || meeting === undefined
      ? null
      : {
          topicId: topic.id,
          meetingId: meeting.id,
          meetingStartsAt: meeting.startsAt,
        };
  }

  private topicDto(topic: TopicRecord): MeetingTopic {
    const { carriedFromTopicId, movedToTopicId, ...fields } = topic;
    return {
      ...fields,
      carriedFrom: this.link(carriedFromTopicId),
      movedTo: this.link(movedToTopicId),
      notes: [...this.notes.values()]
        .filter((n) => n.topicId === topic.id)
        .sort((a, b) =>
          a.createdAt < b.createdAt
            ? -1
            : a.createdAt > b.createdAt
              ? 1
              : a.id < b.id
                ? -1
                : 1
        )
        .map((n) => ({ ...n })),
    };
  }
}

/** What the simulated agent writes: the topic as the title, one criterion per chosen note, and a word that it is simulated. */
/** The simulated agent's questions about a topic: two, each with its first option recommended. */
function simulatedQuestions(title: string): GrillQuestion[] {
  const cut = (text: string) =>
    text.length > 200 ? `${text.slice(0, 199)}…` : text;
  return [
    {
      id: 'Q1',
      text: `Who is "${cut(title)}" for, first?`,
      options: [
        {
          label: 'The finance team',
          detail: 'The story is written for finance users.',
          recommended: true,
        },
        {
          label: 'Every user',
          detail: 'The story is written for everyone who signs in.',
          recommended: false,
        },
      ],
    },
    {
      id: 'Q2',
      text: 'A simulated question: no model was called. Keep it in the story?',
      options: [
        {
          label: 'Yes',
          detail: 'The story keeps it as an open question.',
          recommended: true,
        },
        { label: 'No', detail: 'The story leaves it out.', recommended: false },
      ],
    },
  ];
}

/** A grill's answers checked against its questions, in their order, as the API keeps them; open where none was given. */
function grillAnswers(
  questions: readonly GrillQuestion[],
  given: MeetingStoryAnswersRequest['answers']
): GrillAnswer[] {
  const seen = new Set<string>();
  for (const [i, answer] of given.entries()) {
    if (!questions.some((q) => q.id === answer.questionId))
      throw refused(
        `body/answers/${i}/questionId`,
        `${answer.questionId} is not a question of this draft`
      );
    if (seen.has(answer.questionId))
      throw refused(
        `body/answers/${i}/questionId`,
        `${answer.questionId} is answered twice`
      );
    seen.add(answer.questionId);
  }
  return questions.map((q) => {
    const i = given.findIndex((a) => a.questionId === q.id);
    const answer = given[i];
    const path = `body/answers/${i}`;
    if (answer === undefined || answer.choice === 'open') {
      if (
        answer !== undefined &&
        (answer.option !== undefined || answer.text !== undefined)
      )
        throw refused(
          path,
          `${q.id} is left open, so it takes no option or text`
        );
      return {
        questionId: q.id,
        question: q.text,
        choice: 'open',
        answer: null,
      };
    }
    if (answer.choice === 'option') {
      const option =
        answer.option === undefined ? undefined : q.options[answer.option];
      if (option === undefined || answer.text !== undefined)
        throw refused(
          `${path}/option`,
          `${q.id} offers options 0 to ${q.options.length - 1}, and an option takes no text`
        );
      return {
        questionId: q.id,
        question: q.text,
        choice: 'option',
        answer: `${option.label} — ${option.detail}`,
      };
    }
    const own = answer.text?.trim() ?? '';
    if (own === '' || answer.option !== undefined)
      throw refused(
        `${path}/text`,
        `${q.id} answered in the person's own words needs the words, and no option`
      );
    return { questionId: q.id, question: q.text, choice: 'own', answer: own };
  });
}

function simulatedStory(
  title: string,
  notes: readonly string[]
): StoryTemplate {
  const cut = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return {
    title: cut(title, 255),
    role: 'someone at the meeting',
    want: cut(`what the meeting agreed on "${title}"`, 1000),
    soThat: 'the team builds what the stakeholders asked for',
    acceptanceCriteria: notes.length
      ? notes
          .slice(0, 20)
          .map((note) => cut(`It follows this note: ${note}`, 1000))
      : [cut(`It does what "${title}" asks.`, 1000)],
    context: null,
    implementedFeature: null,
    outOfScope: [],
    dependencies: [],
    testNotes: [],
    openQuestions: ['A simulated draft: no model was called.'],
  };
}
