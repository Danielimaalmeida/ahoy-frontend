import type {
  EndMeetingResult,
  Meeting,
  MeetingList,
  MeetingTopic,
  MoveMeetingTopicResult,
} from '@core/api/types';
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
});
