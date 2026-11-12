import type {
  ConfluencePageList,
  EndMeetingResult,
  Meeting,
  MeetingList,
  MeetingNote,
  MeetingNoteAnswerResult,
  MeetingNoteList,
  MeetingSeries,
  MeetingStoryDraft,
  MeetingStoryDraftList,
  MeetingTopic,
  MoveMeetingTopicResult,
} from '@core/api/types';
import { MOCK_DRAFT_MS } from './meetings';
import { call, testServer } from './spec-helpers';

describe('the mock meetings', () => {
  function seeded() {
    const { server } = testServer();
    const list = call(server, 'GET', '/meetings').body as MeetingList;
    const running = list.items.find((m) => m.status === 'in_progress')!;
    return { server, list, running };
  }

  it('seeds a Finance sync that ended last week, one running now and one planned for next week', () => {
    const { list } = seeded();
    expect(list.items.map((m) => m.status)).toEqual([
      'planned',
      'in_progress',
      'ended',
    ]);
    expect(list.items.every((m) => m.seriesName === 'Finance sync')).toBe(true);
  });

  it('marks a topic added before the start planned and one added while the meeting runs raised in it', () => {
    const { server, list, running } = seeded();
    const planned = list.items.find((m) => m.status === 'planned')!;
    const before = call(server, 'POST', `/meetings/${planned.id}/topics`, {
      title: 'Supplier prices',
      raisedBy: 'us',
    });
    expect(before.status).toBe(201);
    expect((before.body as MeetingTopic).origin).toBe('planned');
    const during = call(server, 'POST', `/meetings/${running.id}/topics`, {
      title: 'Refund approvals',
      raisedBy: 'them',
      raisedByStakeholder: 'Priya@Example.com',
    }).body as MeetingTopic;
    expect([during.origin, during.raisedByStakeholder]).toEqual([
      'in_meeting',
      'priya@example.com',
    ]);
    const refused = call(server, 'POST', `/meetings/${running.id}/topics`, {
      title: 'x',
      raisedBy: 'us',
      raisedByStakeholder: 'priya@example.com',
    });
    expect(refused.status).toBe(400);
  });

  it('ends a meeting by carrying the chosen topics, notes and all, to the next meeting, and keeps the rest', () => {
    const { server, running } = seeded();
    const meeting = call(server, 'GET', `/meetings/${running.id}`)
      .body as Meeting;
    const noted = meeting.topics.find((t) => t.notes.length > 0)!;
    const ended = call(server, 'POST', `/meetings/${running.id}/end`, {
      carryOver: [noted.id],
    });
    expect(ended.status).toBe(200);
    const result = ended.body as EndMeetingResult;
    expect(result.meeting.status).toBe('ended');
    const copy = result.nextMeeting!.topics.find(
      (t) => t.carriedFrom?.topicId === noted.id
    )!;
    expect(copy.notes.map((n) => n.text)).toEqual(
      noted.notes.map((n) => n.text)
    );
    expect(
      result.meeting.topics.find((t) => t.id === noted.id)?.movedTo?.topicId
    ).toBe(copy.id);
    const late = call(server, 'POST', `/meeting-topics/${noted.id}/notes`, {
      text: 'late',
    });
    expect(late.status).toBe(409);
  });

  it('marks a planned meeting done without starting it', () => {
    const { server, list } = seeded();
    const planned = list.items.find((m) => m.status === 'planned')!;
    const done = call(server, 'POST', `/meetings/${planned.id}/end`, {
      carryOver: [],
    });
    expect(done.status).toBe(200);
    const result = done.body as EndMeetingResult;
    expect([
      result.meeting.status,
      result.meeting.startedAt,
      result.nextMeeting,
    ]).toEqual(['ended', null, null]);
    expect(result.meeting.endedAt).not.toBeNull();
    expect(
      call(server, 'POST', `/meetings/${planned.id}/end`, { carryOver: [] })
        .status
    ).toBe(409);
  });

  it('cancels a planned meeting, carrying the chosen topics to the next one, and keeps it read-only', () => {
    const { server, list, running } = seeded();
    const planned = list.items.find((m) => m.status === 'planned')!;
    const topic = call(server, 'POST', `/meetings/${planned.id}/topics`, {
      title: 'Supplier prices',
      raisedBy: 'them',
      raisedByStakeholder: '  Ana   Silva ',
    }).body as MeetingTopic;
    expect(topic.raisedByStakeholder).toBe('Ana Silva');
    const cancelled = call(server, 'POST', `/meetings/${planned.id}/cancel`, {
      carryOver: [topic.id],
    });
    expect(cancelled.status).toBe(200);
    const result = cancelled.body as EndMeetingResult;
    expect([result.meeting.status, result.meeting.startedAt]).toEqual([
      'cancelled',
      null,
    ]);
    expect(
      result.nextMeeting!.topics.map((t) => t.carriedFrom?.topicId)
    ).toContain(topic.id);
    expect(
      call(server, 'POST', `/meetings/${planned.id}/topics`, {
        title: 'late',
        raisedBy: 'us',
      }).status
    ).toBe(409);
    expect(call(server, 'POST', `/meetings/${planned.id}/start`).status).toBe(
      409
    );
    expect(
      call(server, 'POST', `/meetings/${running.id}/cancel`, { carryOver: [] })
        .status
    ).toBe(409);
  });

  it('keeps stakeholders named or by e-mail, each once', () => {
    const { server } = seeded();
    const created = call(server, 'POST', '/meetings', {
      title: 'Kick-off',
      startsAt: '2026-11-02T09:00:00.000Z',
      stakeholders: ['Ana  Silva', 'Priya@Example.com', 'ana silva'],
    });
    expect(created.status).toBe(201);
    expect((created.body as Meeting).stakeholders).toEqual([
      'Ana Silva',
      'priya@example.com',
    ]);
  });

  it('moves one topic to the next meeting without ending this one, and refuses to move it twice', () => {
    const { server, running } = seeded();
    const meeting = call(server, 'GET', `/meetings/${running.id}`)
      .body as Meeting;
    const topic = meeting.topics[0]!;
    const moved = call(server, 'POST', `/meeting-topics/${topic.id}/move`);
    expect(moved.status).toBe(200);
    expect((moved.body as MoveMeetingTopicResult).topic.status).toBe('moved');
    expect(
      call(server, 'POST', `/meeting-topics/${topic.id}/move`).status
    ).toBe(409);
    expect(
      (call(server, 'GET', `/meetings/${running.id}`).body as Meeting).status
    ).toBe('in_progress');
  });

  it('moves a topic to a meeting it names, at the top when asked, and refuses its own meeting or a closed one', () => {
    const { server, list, running } = seeded();
    const ended = list.items.find((m) => m.status === 'ended')!;
    const oneOff = call(server, 'POST', '/meetings', {
      title: 'Pricing workshop',
      startsAt: '2026-10-09T14:00:00.000Z',
    }).body as Meeting;
    call(server, 'POST', `/meetings/${oneOff.id}/topics`, {
      title: 'Discount bands',
      raisedBy: 'us',
    });
    const topic = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!;
    const refused = (toMeetingId: string) =>
      call(server, 'POST', `/meeting-topics/${topic.id}/move`, { toMeetingId })
        .status;
    expect(refused(running.id)).toBe(400);
    expect(refused(ended.id)).toBe(409);
    expect(refused('00000000-0000-4000-8000-00000000ffff')).toBe(404);
    const moved = call(server, 'POST', `/meeting-topics/${topic.id}/move`, {
      toMeetingId: oneOff.id,
      position: 'first',
    });
    expect(moved.status).toBe(200);
    expect(
      (
        call(server, 'GET', `/meetings/${oneOff.id}`).body as Meeting
      ).topics.map((t) => [t.title, t.position])
    ).toEqual([
      [topic.title, 0],
      ['Discount bands', 1],
    ]);
  });

  it("ends a one-off meeting carrying its topics to the meeting it names, and keeps a one-off meeting's Jira target", () => {
    const { server, running } = seeded();
    const oneOff = call(server, 'POST', '/meetings', {
      title: 'Workshop',
      startsAt: '2026-10-09T14:00:00.000Z',
      jiraProjectKey: 'OPS',
    }).body as Meeting;
    expect([oneOff.jiraProjectKey, oneOff.jiraIssueType]).toEqual([
      'OPS',
      'Story',
    ]);
    const topic = call(server, 'POST', `/meetings/${oneOff.id}/topics`, {
      title: 'Open points',
      raisedBy: 'us',
    }).body as MeetingTopic;
    const ended = call(server, 'POST', `/meetings/${oneOff.id}/end`, {
      carryOver: [topic.id],
      carryOverTo: running.id,
    }).body as EndMeetingResult;
    expect(ended.nextMeeting?.id).toBe(running.id);
    expect(ended.nextMeeting?.topics.at(-1)?.title).toBe('Open points');
    const changed = call(server, 'PUT', `/meetings/${oneOff.id}/jira-target`, {
      jiraProjectKey: 'FIN',
      jiraIssueType: 'Task',
    });
    expect(changed.status).toBe(200);
    expect((changed.body as Meeting).jiraIssueType).toBe('Task');
    expect(
      call(server, 'PUT', `/meetings/${running.id}/jira-target`, {
        jiraProjectKey: 'FIN',
      }).status
    ).toBe(400);
  });

  it('finds meetings, open topics and notes by text, ignoring case, and refuses a single character', () => {
    const { server } = seeded();
    const found = call(server, 'GET', '/meeting-search?q=INVOICE').body as {
      meetings: unknown[];
      topics: { title: string }[];
      notes: { note: { text: string } }[];
    };
    expect(found.meetings).toEqual([]);
    expect(found.topics.map((t) => t.title)).toEqual([
      'Overdue invoice reminders',
    ]);
    expect(found.notes.map((n) => n.note.text)).toEqual([
      '1.5% per month, capped at 10% of the invoice.',
    ]);
    expect(call(server, 'GET', '/meeting-search?q=x').status).toBe(400);
  });

  it('deletes a note and a topic with 204 and no body', () => {
    const { server, running } = seeded();
    const topic = call(server, 'POST', `/meetings/${running.id}/topics`, {
      title: 'Temporary',
      raisedBy: 'us',
    }).body as MeetingTopic;
    const note = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
      text: 'scrap',
    }).body as { id: string };
    const gone = call(server, 'DELETE', `/meeting-notes/${note.id}`);
    expect([gone.status, gone.body]).toEqual([204, null]);
    expect(call(server, 'DELETE', `/meeting-topics/${topic.id}`).status).toBe(
      204
    );
    expect(call(server, 'DELETE', `/meeting-topics/${topic.id}`).status).toBe(
      404
    );
  });

  it('seeds last week with an open action and a decision, listed across the series', () => {
    const { server, running } = seeded();
    const open = call(
      server,
      'GET',
      `/meeting-notes?kind=action&seriesId=${running.seriesId}&status=open`
    ).body as MeetingNoteList;
    expect(open.items.map((i) => [i.note.text, i.note.owner])).toEqual([
      ['Profile the export query on the largest account', 'Sam'],
    ]);
    expect(open.items[0]!.meetingId).not.toBe(running.id);
    const decisions = call(server, 'GET', '/meeting-notes?kind=decision')
      .body as MeetingNoteList;
    expect(decisions.items.map((i) => i.note.text)).toEqual([
      'Exports stay synchronous for now',
    ]);
  });

  it('adds an action with an owner and a due day, and refuses them on another kind', () => {
    const { server, running } = seeded();
    const topic = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!;
    const added = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
      text: 'Send the numbers',
      kind: 'action',
      owner: ' Priya ',
      dueOn: '2026-10-30',
    });
    expect(added.status).toBe(201);
    const note = added.body as MeetingNote;
    expect([note.kind, note.owner, note.dueOn, note.doneAt]).toEqual([
      'action',
      'Priya',
      '2026-10-30',
      null,
    ]);
    const refused = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
      text: 'Agreed',
      kind: 'decision',
      owner: 'Priya',
    });
    expect(refused.status).toBe(400);
    const decided = call(server, 'PATCH', `/meeting-notes/${note.id}`, {
      text: 'Send the numbers',
      kind: 'decision',
    }).body as MeetingNote;
    expect([decided.kind, decided.owner, decided.dueOn]).toEqual([
      'decision',
      null,
      null,
    ]);
  });

  it('marks an action done and open again after its meeting ended, and refuses another kind', () => {
    const { server, running } = seeded();
    const [action] = (
      call(server, 'GET', `/meeting-notes?kind=action&status=open`)
        .body as MeetingNoteList
    ).items;
    const done = call(
      server,
      'POST',
      `/meeting-notes/${action!.note.id}/done`,
      {
        done: true,
      }
    );
    expect(done.status).toBe(200);
    expect((done.body as MeetingNote).doneByName).not.toBeNull();
    expect(
      (
        call(
          server,
          'GET',
          `/meeting-notes?kind=action&seriesId=${running.seriesId}&status=open`
        ).body as MeetingNoteList
      ).items
    ).toEqual([]);
    const undone = call(
      server,
      'POST',
      `/meeting-notes/${action!.note.id}/done`,
      { done: false }
    ).body as MeetingNote;
    expect([undone.doneAt, undone.doneBy]).toEqual([null, null]);
    const [decision] = (
      call(server, 'GET', '/meeting-notes?kind=decision')
        .body as MeetingNoteList
    ).items;
    expect(
      call(server, 'POST', `/meeting-notes/${decision!.note.id}/done`, {
        done: true,
      }).status
    ).toBe(409);
  });

  it('answers a question, which marks it answered, reopens it keeping the answers, and takes answers after its meeting ended', () => {
    const { server, running } = seeded();
    const topic = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!;
    const question = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
      text: 'Who signs off?',
      kind: 'question',
    }).body as MeetingNote;
    const openQuestions = () =>
      (
        call(
          server,
          'GET',
          `/meeting-notes?kind=question&seriesId=${running.seriesId}&status=open`
        ).body as MeetingNoteList
      ).items.map((i) => i.note.id);
    expect(openQuestions()).toContain(question.id);
    const answered = call(
      server,
      'POST',
      `/meeting-notes/${question.id}/answers`,
      { text: ' Ana ' }
    );
    expect(answered.status).toBe(201);
    const result = answered.body as MeetingNoteAnswerResult;
    expect([result.question.doneAt !== null, result.answer.answerTo]).toEqual([
      true,
      question.id,
    ]);
    expect([
      result.answer.kind,
      result.answer.text,
      result.answer.topicId,
    ]).toEqual(['note', 'Ana', topic.id]);
    expect(openQuestions()).not.toContain(question.id);
    const reopened = call(
      server,
      'POST',
      `/meeting-notes/${question.id}/done`,
      {
        done: false,
      }
    ).body as MeetingNote;
    expect(reopened.doneAt).toBeNull();
    expect(openQuestions()).toContain(question.id);
    expect(
      call(server, 'POST', `/meetings/${running.id}/end`, { carryOver: [] })
        .status
    ).toBe(200);
    const late = call(server, 'POST', `/meeting-notes/${question.id}/answers`, {
      text: 'Ana, confirmed by legal',
    });
    expect(late.status).toBe(201);
    const after = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!.notes.filter((n) => n.answerTo === question.id);
    expect(after.map((n) => n.text)).toEqual([
      'Ana',
      'Ana, confirmed by legal',
    ]);
  });

  it('refuses an answer to a note that is not a question, a kind on an answer, and a question with answers changing kind', () => {
    const { server, running } = seeded();
    const topic = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!;
    const add = (body: object) =>
      call(server, 'POST', `/meeting-topics/${topic.id}/notes`, body)
        .body as MeetingNote;
    const plain = add({ text: 'Plain' });
    expect(
      call(server, 'POST', `/meeting-notes/${plain.id}/answers`, { text: 'x' })
        .status
    ).toBe(409);
    const question = add({ text: 'Why?', kind: 'question' });
    const { answer } = call(
      server,
      'POST',
      `/meeting-notes/${question.id}/answers`,
      { text: 'Because' }
    ).body as MeetingNoteAnswerResult;
    expect(
      call(server, 'PATCH', `/meeting-notes/${answer.id}`, {
        text: 'Because',
        kind: 'decision',
      }).status
    ).toBe(400);
    expect(
      call(server, 'PATCH', `/meeting-notes/${question.id}`, {
        text: 'Why?',
        kind: 'note',
      }).status
    ).toBe(409);
    expect(call(server, 'DELETE', `/meeting-notes/${question.id}`).status).toBe(
      204
    );
    expect(
      (
        call(server, 'GET', `/meetings/${running.id}`).body as Meeting
      ).topics[0]!.notes.map((n) => n.id)
    ).not.toContain(answer.id);
  });

  it('marks a question open again once its last answer is removed, not before', () => {
    const { server, running } = seeded();
    const topic = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!;
    const question = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
      text: 'Who signs off?',
      kind: 'question',
    }).body as MeetingNote;
    const answer = (text: string) =>
      (
        call(server, 'POST', `/meeting-notes/${question.id}/answers`, {
          text,
        }).body as MeetingNoteAnswerResult
      ).answer;
    const [first, second] = [answer('Ana'), answer('Or Sam')];
    const doneAt = () =>
      (call(server, 'GET', `/meetings/${running.id}`).body as Meeting).topics
        .flatMap((t) => t.notes)
        .find((n) => n.id === question.id)!.doneAt;
    call(server, 'DELETE', `/meeting-notes/${first.id}`);
    expect(doneAt()).not.toBeNull();
    call(server, 'DELETE', `/meeting-notes/${second.id}`);
    expect(doneAt()).toBeNull();
  });

  it('carries a question to the next meeting with its answers, which name the copy', () => {
    const { server, running } = seeded();
    const topic = (
      call(server, 'GET', `/meetings/${running.id}`).body as Meeting
    ).topics[0]!;
    const question = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
      text: 'Who signs off?',
      kind: 'question',
    }).body as MeetingNote;
    call(server, 'POST', `/meeting-notes/${question.id}/answers`, {
      text: 'Ana',
    });
    const result = call(server, 'POST', `/meetings/${running.id}/end`, {
      carryOver: [topic.id],
    }).body as EndMeetingResult;
    const copy = result.nextMeeting!.topics.find(
      (t) => t.carriedFrom?.topicId === topic.id
    )!;
    const copied = copy.notes.find((n) => n.text === 'Who signs off?')!;
    expect(copied.id).not.toBe(question.id);
    expect(copied.doneAt).not.toBeNull();
    expect(
      copy.notes.filter((n) => n.answerTo === copied.id).map((n) => n.text)
    ).toEqual(['Ana']);
    expect(
      call(server, 'POST', `/meeting-notes/${question.id}/answers`, {
        text: 'too late',
      }).status
    ).toBe(409);
  });

  it('refuses a status on notes that are not actions', () => {
    const { server } = seeded();
    expect(
      call(server, 'GET', '/meeting-notes?kind=decision&status=open').status
    ).toBe(400);
  });

  describe('note images', () => {
    const PNG = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    );
    const asPng = { 'Content-Type': 'image/png' };

    function noted() {
      const { server, running } = seeded();
      const topic = call(server, 'POST', `/meetings/${running.id}/topics`, {
        title: 'Screens',
        raisedBy: 'us',
      }).body as MeetingTopic;
      const note = call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
        text: 'The old screen',
      }).body as MeetingNote;
      return { server, running, topic, note };
    }

    it('adds an image to a note and serves its bytes with its type, an ETag and no sniffing, or 304', () => {
      const { server, note } = noted();
      const added = call(
        server,
        'POST',
        `/meeting-notes/${note.id}/images`,
        PNG,
        asPng
      );
      expect(added.status).toBe(201);
      const image = (added.body as MeetingNote).images[0]!;
      expect([image.mediaType, image.sizeBytes, image.createdBy]).toEqual([
        'image/png',
        PNG.length,
        'alex@example.com',
      ]);
      const read = call(server, 'GET', `/meeting-note-images/${image.id}`);
      expect(read.status).toBe(200);
      expect(read.headers['Content-Type']).toBe('image/png');
      expect(read.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(read.response.kind === 'bytes' && read.response.body).toEqual(PNG);
      const again = call(
        server,
        'GET',
        `/meeting-note-images/${image.id}`,
        undefined,
        { 'If-None-Match': read.headers['ETag']! }
      );
      expect(again.status).toBe(304);
    });

    it('refuses an SVG, another content type, no bytes and an eleventh image', () => {
      const { server, note } = noted();
      const path = `/meeting-notes/${note.id}/images`;
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"/>'
      );
      expect(call(server, 'POST', path, svg, asPng).status).toBe(400);
      expect(
        call(server, 'POST', path, svg, { 'Content-Type': 'image/svg+xml' })
          .status
      ).toBe(400);
      expect(call(server, 'POST', path, new Uint8Array(), asPng).status).toBe(
        400
      );
      for (let i = 0; i < 10; i++)
        expect(call(server, 'POST', path, PNG, asPng).status).toBe(201);
      expect(call(server, 'POST', path, PNG, asPng).status).toBe(409);
    });

    it('removes an image with 204, then answers 404 for it', () => {
      const { server, running, note } = noted();
      const image = (
        call(server, 'POST', `/meeting-notes/${note.id}/images`, PNG, asPng)
          .body as MeetingNote
      ).images[0]!;
      const gone = call(server, 'DELETE', `/meeting-note-images/${image.id}`);
      expect([gone.status, gone.body]).toEqual([204, null]);
      expect(
        call(server, 'GET', `/meeting-note-images/${image.id}`).status
      ).toBe(404);
      expect(
        call(server, 'DELETE', `/meeting-note-images/${image.id}`).status
      ).toBe(404);
      const meeting = call(server, 'GET', `/meetings/${running.id}`)
        .body as Meeting;
      expect(
        meeting.topics.find((t) => t.id === note.topicId)!.notes[0]!.images
      ).toEqual([]);
    });

    it("carries the images with their note to the next meeting, and keeps an ended meeting's images as they are", () => {
      const { server, running, topic, note } = noted();
      const image = (
        call(server, 'POST', `/meeting-notes/${note.id}/images`, PNG, asPng)
          .body as MeetingNote
      ).images[0]!;
      const result = call(server, 'POST', `/meetings/${running.id}/end`, {
        carryOver: [topic.id],
      }).body as EndMeetingResult;
      const copy = result.nextMeeting!.topics.find(
        (t) => t.carriedFrom?.topicId === topic.id
      )!.notes[0]!.images[0]!;
      expect(copy.id).not.toBe(image.id);
      const copied = call(server, 'GET', `/meeting-note-images/${copy.id}`);
      expect(copied.response.kind === 'bytes' && copied.response.body).toEqual(
        PNG
      );
      expect(
        call(server, 'POST', `/meeting-notes/${note.id}/images`, PNG, asPng)
          .status
      ).toBe(409);
      expect(
        call(server, 'DELETE', `/meeting-note-images/${image.id}`).status
      ).toBe(409);
    });
  });

  describe('story drafts', () => {
    function withTopic() {
      const { server, clock } = testServer();
      const list = call(server, 'GET', '/meetings').body as MeetingList;
      const running = list.items.find((m) => m.status === 'in_progress')!;
      const meeting = call(server, 'GET', `/meetings/${running.id}`)
        .body as Meeting;
      const topic = meeting.topics.find((t) => t.notes.length > 0)!;
      return { server, clock, meeting, topic };
    }

    it('writes a story after a short while, from the chosen notes, and lists it for the meeting', () => {
      const { server, clock, meeting, topic } = withTopic();
      const asked = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        {
          confirmSpend: true,
          noteIds: [topic.notes[0]!.id],
        }
      );
      expect(asked.status).toBe(202);
      const draft = asked.body as MeetingStoryDraft;
      expect([draft.status, draft.story, draft.noteIds]).toEqual([
        'drafting',
        null,
        [topic.notes[0]!.id],
      ]);
      clock.advance(MOCK_DRAFT_MS);
      const ready = call(server, 'GET', `/meeting-story-drafts/${draft.id}`)
        .body as MeetingStoryDraft;
      expect(ready.status).toBe('ready');
      expect(ready.story!.acceptanceCriteria.length).toBeGreaterThan(0);
      const listed = call(server, 'GET', `/meetings/${meeting.id}/story-drafts`)
        .body as MeetingStoryDraftList;
      expect(listed.items.map((d) => d.id)).toEqual([draft.id]);
    });

    it('refuses a second open draft of the same topic', () => {
      const { server, topic } = withTopic();
      call(server, 'POST', `/meeting-topics/${topic.id}/story-drafts`, {
        confirmSpend: true,
      });
      const again = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        { confirmSpend: true }
      );
      expect(again.status).toBe(409);
    });

    it("creates a ready story once in the series' project, and a second click answers the same issue", () => {
      const { server, clock, topic } = withTopic();
      const draft = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        { confirmSpend: true }
      ).body as MeetingStoryDraft;
      expect(
        call(server, 'POST', `/meeting-story-drafts/${draft.id}/create-issue`)
          .status
      ).toBe(409);
      clock.advance(MOCK_DRAFT_MS);
      const created = call(
        server,
        'POST',
        `/meeting-story-drafts/${draft.id}/create-issue`
      ).body as MeetingStoryDraft;
      expect(created.status).toBe('created');
      expect(created.jiraKey).toMatch(/^PROJ-\d+$/);
      const twice = call(
        server,
        'POST',
        `/meeting-story-drafts/${draft.id}/create-issue`
      ).body as MeetingStoryDraft;
      expect(twice.jiraKey).toBe(created.jiraKey);
      expect(
        call(server, 'DELETE', `/meeting-story-drafts/${draft.id}`).status
      ).toBe(409);
    });

    it('saves an edit of a ready story, trimmed, and refuses one while it is written, blank or after Jira', () => {
      const { server, clock, topic } = withTopic();
      const draft = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        { confirmSpend: true }
      ).body as MeetingStoryDraft;
      const story = {
        title: '  Charge late fees ',
        role: 'a finance user',
        want: 'a late fee on overdue invoices',
        soThat: 'customers pay on time',
        context: null,
        implementedFeature: null,
        acceptanceCriteria: ['Only enterprise accounts get a fee.'],
        outOfScope: [],
        dependencies: [],
        testNotes: [],
        openQuestions: [],
      };
      const path = `/meeting-story-drafts/${draft.id}/story`;
      expect(call(server, 'PUT', path, story).status).toBe(409);
      clock.advance(MOCK_DRAFT_MS);
      expect(
        call(server, 'PUT', path, { ...story, acceptanceCriteria: [] }).status
      ).toBe(400);
      expect(call(server, 'PUT', path, { ...story, want: '  ' }).status).toBe(
        400
      );
      const edited = call(server, 'PUT', path, story).body as MeetingStoryDraft;
      expect([
        edited.status,
        edited.story?.title,
        edited.editedBy !== null,
        edited.editedAt !== null,
      ]).toEqual(['ready', 'Charge late fees', true, true]);
      const created = call(
        server,
        'POST',
        `/meeting-story-drafts/${draft.id}/create-issue`
      ).body as MeetingStoryDraft;
      expect(created.story?.title).toBe('Charge late fees');
      expect(call(server, 'PUT', path, story).status).toBe(409);
    });

    it('follows the series when its Jira project is turned off, and then refuses to create', () => {
      const { server, clock, meeting, topic } = withTopic();
      const draft = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        { confirmSpend: true }
      ).body as MeetingStoryDraft;
      clock.advance(MOCK_DRAFT_MS);
      const series = call(
        server,
        'PATCH',
        `/meeting-series/${meeting.seriesId}`,
        { jiraProjectKey: null }
      ).body as MeetingSeries;
      expect(series.jiraProjectKey).toBeNull();
      const read = call(server, 'GET', `/meeting-story-drafts/${draft.id}`)
        .body as MeetingStoryDraft;
      expect(read.target.projectKey).toBeNull();
      expect(
        call(server, 'POST', `/meeting-story-drafts/${draft.id}/create-issue`)
          .status
      ).toBe(409);
    });

    it('stops a draft still being written when it is discarded, so it never turns ready', () => {
      const { server, clock, meeting, topic } = withTopic();
      const draft = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        { confirmSpend: true }
      ).body as MeetingStoryDraft;
      expect(
        call(server, 'DELETE', `/meeting-story-drafts/${draft.id}`).status
      ).toBe(204);
      clock.advance(MOCK_DRAFT_MS);
      expect(
        call(server, 'GET', `/meeting-story-drafts/${draft.id}`).status
      ).toBe(404);
      const listed = call(server, 'GET', `/meetings/${meeting.id}/story-drafts`)
        .body as MeetingStoryDraftList;
      expect(listed.items).toEqual([]);
    });

    it('grills: asks two questions, takes the answers once, then writes the story with them', () => {
      const { server, clock, topic } = withTopic();
      const draft = call(
        server,
        'POST',
        `/meeting-topics/${topic.id}/story-drafts`,
        { confirmSpend: true, mode: 'grill' }
      ).body as MeetingStoryDraft;
      expect([draft.mode, draft.status, draft.questions]).toEqual([
        'grill',
        'drafting',
        null,
      ]);
      expect(
        call(server, 'POST', `/meeting-story-drafts/${draft.id}/answers`, {
          confirmSpend: true,
          answers: [],
        }).status
      ).toBe(409);
      clock.advance(MOCK_DRAFT_MS);
      const asking = call(server, 'GET', `/meeting-story-drafts/${draft.id}`)
        .body as MeetingStoryDraft;
      expect([asking.status, asking.questions?.map((q) => q.id)]).toEqual([
        'asking',
        ['Q1', 'Q2'],
      ]);
      expect(
        call(server, 'POST', `/meeting-story-drafts/${draft.id}/answers`, {
          confirmSpend: true,
          answers: [{ questionId: 'Q9', choice: 'open' }],
        }).status
      ).toBe(400);
      const answered = call(
        server,
        'POST',
        `/meeting-story-drafts/${draft.id}/answers`,
        {
          confirmSpend: true,
          answers: [
            { questionId: 'Q1', choice: 'own', text: ' Finance only ' },
          ],
        }
      );
      expect(answered.status).toBe(202);
      const writing = answered.body as MeetingStoryDraft;
      expect([writing.status, writing.answers]).toEqual([
        'drafting',
        [
          {
            questionId: 'Q1',
            question: asking.questions![0]!.text,
            choice: 'own',
            answer: 'Finance only',
          },
          {
            questionId: 'Q2',
            question: asking.questions![1]!.text,
            choice: 'open',
            answer: null,
          },
        ],
      ]);
      clock.advance(MOCK_DRAFT_MS);
      const ready = call(server, 'GET', `/meeting-story-drafts/${draft.id}`)
        .body as MeetingStoryDraft;
      expect(ready.status).toBe('ready');
      expect(ready.story!.acceptanceCriteria).toContain(
        'As answered: Finance only'
      );
      expect(ready.story!.openQuestions).toContain(asking.questions![1]!.text);
      expect(
        call(server, 'POST', `/meeting-story-drafts/${draft.id}/answers`, {
          confirmSpend: true,
          answers: [],
        }).status
      ).toBe(409);
    });
  });
  describe('Confluence pages', () => {
    it('finds parent pages by the start of their title words, and lists them all for a blank search', () => {
      const { server } = seeded();
      const titles = (q: string) =>
        (
          call(server, 'GET', `/confluence/pages?q=${q}`)
            .body as ConfluencePageList
        ).items.map((p) => p.title);
      expect(titles('')).toHaveLength(4);
      expect(titles('meet')).toEqual(['Meeting notes']);
      expect(titles('sync no')).toEqual(['Finance sync notes']);
    });

    it('creates the page of a meeting once, refuses a title the space has, and remembers the parent for the series', () => {
      const { server, list } = seeded();
      const ended = list.items.find((m) => m.status === 'ended')!;
      const planned = list.items.find((m) => m.status === 'planned')!;
      const path = `/meetings/${ended.id}/confluence-page`;
      expect(
        call(server, 'POST', path, {
          parentId: '100002',
          title: 'Release notes',
          body: '<p>Notes</p>',
        }).status
      ).toBe(400);
      const created = call(server, 'POST', path, {
        parentId: '100002',
        title: 'Finance sync · notes',
        body: '<p>Notes</p>',
      });
      expect(created.status).toBe(201);
      const meeting = created.body as Meeting;
      expect(meeting.confluencePage?.title).toBe('Finance sync · notes');
      expect(meeting.confluencePage?.url).toMatch(/pageId=/);
      expect(meeting.confluenceParent).toEqual({
        id: '100002',
        title: 'Meeting notes',
      });
      expect(
        (call(server, 'GET', `/meetings/${planned.id}`).body as Meeting)
          .confluenceParent
      ).toEqual({ id: '100002', title: 'Meeting notes' });
      expect(
        call(server, 'POST', path, {
          parentId: '100002',
          title: 'Another title',
          body: '<p>Notes</p>',
        }).status
      ).toBe(409);
    });

    it('refuses to search or create while Confluence is not connected', () => {
      const { server, running } = seeded();
      server.meetingDesk.confluenceConnected = false;
      expect(call(server, 'GET', '/confluence/pages').status).toBe(409);
      expect(
        call(server, 'POST', `/meetings/${running.id}/confluence-page`, {
          parentId: '100002',
          title: 'Finance sync',
          body: '<p>Notes</p>',
        }).status
      ).toBe(409);
    });
  });
});
