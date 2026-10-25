import type {
  EndMeetingResult,
  Meeting,
  MeetingList,
  MeetingNote,
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
      raisedByEmail: 'Priya@Example.com',
    }).body as MeetingTopic;
    expect([during.origin, during.raisedByEmail]).toEqual([
      'in_meeting',
      'priya@example.com',
    ]);
    const refused = call(server, 'POST', `/meetings/${running.id}/topics`, {
      title: 'x',
      raisedBy: 'us',
      raisedByEmail: 'priya@example.com',
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
});
