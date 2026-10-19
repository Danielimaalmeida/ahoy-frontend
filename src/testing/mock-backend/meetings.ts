/**
 * The mock's meetings with stakeholders (`/meetings`, `/meeting-topics`, `/meeting-notes`, `/meeting-series`), as
 * `packages/core/src/service/meetings.ts` of `ahoy-hosted` keeps the real ones: a meeting is planned, then in progress,
 * then ended (read-only); topics are raised by us or by a stakeholder, planned before the start or raised during it;
 * ending a meeting carries the chosen open topics, notes and all, to the series' next meeting. A topic's story draft is
 * written by a simulated agent a moment after it is asked for, and "created" in a pretend Jira (design §5, slice 2); a
 * grill's simulated agent first asks two questions, then writes the story from the answers (slice 3). 0 AIU, no Jira.
 * Fictional data.
 */
import type {
  AddMeetingTopicRequest,
  CreateMeetingRequest,
  CreateMeetingSeriesRequest,
  EndMeetingResult,
  GrillAnswer,
  GrillQuestion,
  Meeting,
  MeetingNote,
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
import { iso, type Cancel, type MockClock } from './clock';
import { MockProblem } from './http';
import type { Writable } from './voyage';

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

/** Trims, lower-cases and keeps each e-mail once, in the order given. */
function normalized(emails: readonly string[]): string[] {
  return [
    ...new Set(
      emails.map((e) => e.trim().toLowerCase()).filter((e) => e !== '')
    ),
  ];
}

/** The meetings of a mock world. */
export class MeetingDesk {
  private readonly series = new Map<string, SeriesRecord>();
  private readonly meetings = new Map<string, MeetingRecord>();
  private readonly topics = new Map<string, TopicRecord>();
  private readonly notes = new Map<string, NoteRecord>();
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
      raisedByEmail: 'jordan@example.com',
    });
    this.addNote(alex, reminders.id, {
      text: 'About 120 reminders a month are sent by hand.',
    });
    now.status = 'in_progress';
    now.startedAt = startOf(0);
    const fees = this.addTopic(alex, now.id, {
      title: 'Late fees for enterprise accounts',
      raisedBy: 'them',
      raisedByEmail: 'priya@example.com',
    });
    this.addNote(alex, fees.id, {
      text: '1.5% per month, capped at 10% of the invoice.',
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
      normalized(body.stakeholders ?? series?.stakeholders ?? [])
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
      meeting.stakeholders = normalized(body.stakeholders);
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

  end(
    actor: string,
    id: string,
    carryOver: readonly string[]
  ): EndMeetingResult {
    const meeting = this.meeting(id);
    if (meeting.status !== 'in_progress')
      throw invalid(
        `Only a meeting in progress can end; this one is ${meeting.status}`
      );
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
    meeting.status = 'ended';
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
    const email = body.raisedByEmail?.trim().toLowerCase() || null;
    if (body.raisedBy === 'us' && email !== null)
      throw refused(
        'body/raisedByEmail',
        'raisedByEmail is only for a topic raised by them'
      );
    const at = this.now();
    const topic: TopicRecord = {
      id: this.id(),
      meetingId,
      title: body.title.trim(),
      raisedBy: body.raisedBy,
      raisedByEmail: email,
      origin: meeting.status === 'planned' ? 'planned' : 'in_meeting',
      status: 'open',
      position: this.topicsOf(meetingId).length,
      carriedFromTopicId: null,
      movedToTopicId: null,
      createdBy: actor,
      createdAt: at,
      updatedBy: actor,
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
      body.raisedByEmail !== undefined
        ? body.raisedByEmail
        : body.raisedBy === 'us'
          ? null
          : topic.raisedByEmail;
    const email = wanted?.trim().toLowerCase() || null;
    if (raisedBy === 'us' && email !== null)
      throw refused(
        'body/raisedByEmail',
        'raisedByEmail is only for a topic raised by them'
      );
    if (body.title !== undefined) topic.title = body.title.trim();
    topic.raisedBy = raisedBy;
    topic.raisedByEmail = email;
    topic.updatedBy = actor;
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
    body: { readonly text: string }
  ): MeetingNote {
    this.changeableTopic(topicId);
    const at = this.now();
    const note: NoteRecord = {
      id: this.id(),
      topicId,
      text: body.text.trim(),
      createdBy: actor,
      createdAt: at,
      updatedBy: actor,
      updatedAt: at,
    };
    this.notes.set(note.id, note);
    return { ...note };
  }

  updateNote(
    actor: string,
    id: string,
    body: { readonly text: string }
  ): MeetingNote {
    const note = this.changeableNote(id);
    note.text = body.text.trim();
    note.updatedBy = actor;
    note.updatedAt = this.now();
    return { ...note };
  }

  deleteNote(id: string): void {
    this.changeableNote(id);
    this.notes.delete(id);
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
      stakeholders: normalized(body.stakeholders ?? []),
      cadenceDays: body.cadenceDays ?? null,
      jiraProjectKey: body.jiraProjectKey ?? null,
      jiraIssueType: body.jiraIssueType ?? 'Story',
      createdBy: actor,
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
      createdAt: at,
      updatedBy: actor,
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
    meeting.updatedAt = this.now();
  }

  private meeting(id: string): MeetingRecord {
    const meeting = this.meetings.get(id);
    if (meeting === undefined) throw notFound('Meeting', id);
    return meeting;
  }

  private openMeeting(id: string): MeetingRecord {
    const meeting = this.meeting(id);
    if (meeting.status === 'ended')
      throw invalid(`Meeting ${id} has ended; it is read-only`);
    return meeting;
  }

  private changeableTopic(id: string): TopicRecord {
    const topic = this.topics.get(id);
    if (topic === undefined) throw notFound('Topic', id);
    if (this.meeting(topic.meetingId).status === 'ended')
      throw invalid(`The meeting of topic ${id} has ended; it is read-only`);
    if (topic.status === 'moved')
      throw invalid(
        `Topic ${id} was moved to the next meeting; change it there`
      );
    return topic;
  }

  private changeableNote(id: string): NoteRecord {
    const note = this.notes.get(id);
    if (note === undefined) throw notFound('Note', id);
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
      createdAt: at,
      updatedBy: actor,
      updatedAt: at,
    };
    this.topics.set(copy.id, copy);
    for (const note of [...this.notes.values()].filter(
      (n) => n.topicId === topic.id
    )) {
      const noteId = this.id();
      this.notes.set(noteId, { ...note, id: noteId, topicId: copy.id });
    }
    topic.status = 'moved';
    topic.movedToTopicId = copy.id;
    topic.updatedBy = actor;
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
    outOfScope: [],
    openQuestions: ['A simulated draft: no model was called.'],
  };
}
