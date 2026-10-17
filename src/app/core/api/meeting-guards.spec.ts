import addMeetingNote from '@testing/fixtures/addMeetingNote.json';
import addMeetingTopic from '@testing/fixtures/addMeetingTopic.json';
import createMeeting from '@testing/fixtures/createMeeting.json';
import createMeetingSeries from '@testing/fixtures/createMeetingSeries.json';
import endMeeting from '@testing/fixtures/endMeeting.json';
import getMeeting from '@testing/fixtures/getMeeting.json';
import listMeetingSeries from '@testing/fixtures/listMeetingSeries.json';
import listMeetings from '@testing/fixtures/listMeetings.json';
import moveMeetingTopic from '@testing/fixtures/moveMeetingTopic.json';
import { withField } from '@testing/fixtures/mutate';
import {
  isEndMeetingResult,
  isMeeting,
  isMeetingList,
  isMeetingNote,
  isMeetingSeries,
  isMeetingSeriesList,
  isMeetingTopic,
  isMoveMeetingTopicResult,
  isNoContent,
} from './guards';

describe('meeting guards', () => {
  it('accept every meeting answer the contract documents, as the fixtures hold them', () => {
    expect(isMeetingList(listMeetings)).toBe(true);
    expect(isMeeting(getMeeting)).toBe(true);
    expect(isMeeting(createMeeting)).toBe(true);
    expect(isEndMeetingResult(endMeeting)).toBe(true);
    expect(isMeetingTopic(addMeetingTopic)).toBe(true);
    expect(isMoveMeetingTopicResult(moveMeetingTopic)).toBe(true);
    expect(isMeetingNote(addMeetingNote)).toBe(true);
    expect(isMeetingSeries(createMeetingSeries)).toBe(true);
    expect(isMeetingSeriesList(listMeetingSeries)).toBe(true);
  });

  it('refuse a meeting whose status and start or end time disagree, naming the field', () => {
    const notStarted = withField(getMeeting, 'startedAt', null);
    expect(isMeeting(notStarted)).toBe(false);
    expect(isMeeting.explain(notStarted)).toContain('startedAt');
    expect(
      isMeeting(withField(getMeeting, 'endedAt', '2026-10-06T10:00:00.000Z'))
    ).toBe(false);
    expect(isMeeting(withField(getMeeting, 'status', 'paused'))).toBe(false);
  });

  it('refuse a topic that names a stakeholder for one we raised, or says where an open topic went', () => {
    expect(isMeetingTopic(withField(addMeetingTopic, 'raisedBy', 'us'))).toBe(
      false
    );
    expect(
      isMeetingTopic(
        withField(addMeetingTopic, 'movedTo', {
          topicId: 'a1f0c3d2-0b1e-4c5d-9e8f-7a6b5c4d3e29',
          meetingId: '0c6f3a52-1d2e-4b7a-8f90-6a1b2c3d4e52',
          meetingStartsAt: '2026-10-13T09:00:00.000Z',
        })
      )
    ).toBe(false);
    expect(isMeetingTopic(withField(addMeetingTopic, 'id', 'topic-1'))).toBe(
      false
    );
    expect(isMeetingTopic(withField(addMeetingTopic, 'position', -1))).toBe(
      false
    );
  });

  it('refuse a series with a cadence outside 1 to 366 days', () => {
    expect(
      isMeetingSeries(withField(createMeetingSeries, 'cadenceDays', 0))
    ).toBe(false);
    expect(
      isMeetingSeries(withField(createMeetingSeries, 'cadenceDays', null))
    ).toBe(true);
  });

  it('take only an empty body as the answer of a delete', () => {
    expect(isNoContent(null)).toBe(true);
    expect(isNoContent({})).toBe(false);
    expect(isNoContent('')).toBe(false);
  });
});
