import addMeetingNote from '@testing/fixtures/addMeetingNote.json';
import addMeetingNoteImage from '@testing/fixtures/addMeetingNoteImage.json';
import addMeetingTopic from '@testing/fixtures/addMeetingTopic.json';
import createMeeting from '@testing/fixtures/createMeeting.json';
import createMeetingSeries from '@testing/fixtures/createMeetingSeries.json';
import answerMeetingStoryQuestions from '@testing/fixtures/answerMeetingStoryQuestions.json';
import createMeetingStoryIssue from '@testing/fixtures/createMeetingStoryIssue.json';
import getMeetingStoryDraft from '@testing/fixtures/getMeetingStoryDraft.json';
import listMeetingStoryDrafts from '@testing/fixtures/listMeetingStoryDrafts.json';
import requestMeetingStoryDraft from '@testing/fixtures/requestMeetingStoryDraft.json';
import updateMeetingSeries from '@testing/fixtures/updateMeetingSeries.json';
import cancelMeeting from '@testing/fixtures/cancelMeeting.json';
import endMeeting from '@testing/fixtures/endMeeting.json';
import getMeeting from '@testing/fixtures/getMeeting.json';
import listMeetingSeries from '@testing/fixtures/listMeetingSeries.json';
import listMeetingNotes from '@testing/fixtures/listMeetingNotes.json';
import listMeetings from '@testing/fixtures/listMeetings.json';
import moveMeetingTopic from '@testing/fixtures/moveMeetingTopic.json';
import setMeetingNoteDone from '@testing/fixtures/setMeetingNoteDone.json';
import { withField } from '@testing/fixtures/mutate';
import {
  isEndMeetingResult,
  isMeeting,
  isMeetingList,
  isMeetingNote,
  isMeetingNoteList,
  isMeetingSeries,
  isMeetingSeriesList,
  isMeetingStoryDraft,
  isMeetingStoryDraftList,
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
    expect(isEndMeetingResult(cancelMeeting)).toBe(true);
    expect(isMeetingTopic(addMeetingTopic)).toBe(true);
    expect(isMoveMeetingTopicResult(moveMeetingTopic)).toBe(true);
    expect(isMeetingNote(addMeetingNote)).toBe(true);
    expect(isMeetingSeries(createMeetingSeries)).toBe(true);
    expect(isMeetingSeriesList(listMeetingSeries)).toBe(true);
    expect(isMeetingSeries(updateMeetingSeries)).toBe(true);
  });

  it('accept a done action and the notes of one kind across meetings', () => {
    expect(isMeetingNote(setMeetingNoteDone)).toBe(true);
    expect(isMeetingNoteList(listMeetingNotes)).toBe(true);
  });

  it('refuse an owner, a due day or a done mark on a note that is not an action, naming the field', () => {
    const decisionWithOwner = withField(
      { ...addMeetingNote, kind: 'decision' },
      'owner',
      'Sam'
    );
    expect(isMeetingNote(decisionWithOwner)).toBe(false);
    expect(isMeetingNote.explain(decisionWithOwner)).toContain('owner');
    expect(
      isMeetingNote(withField(setMeetingNoteDone, 'kind', 'question'))
    ).toBe(false);
    expect(
      isMeetingNote(withField(addMeetingNote, 'dueOn', '2026-10-30'))
    ).toBe(false);
    expect(isMeetingNote(withField(addMeetingNote, 'kind', 'todo'))).toBe(
      false
    );
  });

  it('accept a note with images, and refuse an image of another format, an empty or oversized one, or an eleventh', () => {
    expect(isMeetingNote(addMeetingNoteImage)).toBe(true);
    const image = addMeetingNoteImage.images[0]!;
    const withImage = (over: object) =>
      withField(addMeetingNoteImage, 'images', [{ ...image, ...over }]);
    expect(isMeetingNote(withImage({ mediaType: 'image/svg+xml' }))).toBe(
      false
    );
    expect(isMeetingNote(withImage({ sizeBytes: 0 }))).toBe(false);
    expect(isMeetingNote(withImage({ sizeBytes: 5_242_881 }))).toBe(false);
    const eleven = withField(
      addMeetingNoteImage,
      'images',
      Array.from({ length: 11 }, () => image)
    );
    expect(isMeetingNote(eleven)).toBe(false);
    expect(isMeetingNote.explain(eleven)).toContain('images');
    expect(isMeetingNote(withField(addMeetingNote, 'images', undefined))).toBe(
      false
    );
  });

  it('refuse a done mark without who did it, or who without when', () => {
    expect(isMeetingNote(withField(setMeetingNoteDone, 'doneBy', null))).toBe(
      false
    );
    expect(isMeetingNote(withField(setMeetingNoteDone, 'doneAt', null))).toBe(
      false
    );
  });

  it('accept every story draft answer the contract documents: drafting, asking, ready, failed and created', () => {
    expect(isMeetingStoryDraft(requestMeetingStoryDraft)).toBe(true);
    expect(isMeetingStoryDraft(answerMeetingStoryQuestions)).toBe(true);
    expect(isMeetingStoryDraft(getMeetingStoryDraft)).toBe(true);
    expect(isMeetingStoryDraft(createMeetingStoryIssue)).toBe(true);
    expect(isMeetingStoryDraftList(listMeetingStoryDrafts)).toBe(true);
  });

  it('refuse a draft whose status and story, failure or issue disagree, naming the field', () => {
    const readyWithoutStory = withField(getMeetingStoryDraft, 'story', null);
    expect(isMeetingStoryDraft(readyWithoutStory)).toBe(false);
    expect(isMeetingStoryDraft.explain(readyWithoutStory)).toContain('story');
    expect(
      isMeetingStoryDraft(
        withField(requestMeetingStoryDraft, 'failure', 'it broke')
      )
    ).toBe(false);
    expect(
      isMeetingStoryDraft(withField(getMeetingStoryDraft, 'jiraKey', 'PROJ-1'))
    ).toBe(false);
    expect(
      isMeetingStoryDraft(withField(createMeetingStoryIssue, 'jiraKey', null))
    ).toBe(false);
  });

  it('refuse a grill whose questions do not recommend exactly one option, or a plain draft with questions', () => {
    const asking = listMeetingStoryDrafts.items[2]!;
    expect(asking.status).toBe('asking');
    expect(isMeetingStoryDraft(asking)).toBe(true);
    const [first, ...rest] = asking.questions!;
    const twoRecommended = {
      ...first!,
      options: first!.options.map((o) => ({ ...o, recommended: true })),
    };
    expect(
      isMeetingStoryDraft(
        withField(asking, 'questions', [twoRecommended, ...rest])
      )
    ).toBe(false);
    const oneOption = { ...first!, options: first!.options.slice(0, 1) };
    expect(
      isMeetingStoryDraft(withField(asking, 'questions', [oneOption, ...rest]))
    ).toBe(false);
    const askingWithout = withField(asking, 'questions', null);
    expect(isMeetingStoryDraft(askingWithout)).toBe(false);
    expect(isMeetingStoryDraft.explain(askingWithout)).toContain('questions');
    expect(
      isMeetingStoryDraft(
        withField(getMeetingStoryDraft, 'questions', asking.questions)
      )
    ).toBe(false);
  });

  it('refuse an answer left open that still has text, or one answered that has none', () => {
    const [own, option] = answerMeetingStoryQuestions.answers;
    expect(
      isMeetingStoryDraft(
        withField(answerMeetingStoryQuestions, 'answers', [
          { ...own!, choice: 'open' },
          option,
        ])
      )
    ).toBe(false);
    expect(
      isMeetingStoryDraft(
        withField(answerMeetingStoryQuestions, 'answers', [
          { ...own!, answer: null },
          option,
        ])
      )
    ).toBe(false);
  });

  it('refuse a story without acceptance criteria, or a Jira link that is not https', () => {
    const story = getMeetingStoryDraft.story;
    expect(
      isMeetingStoryDraft(
        withField(getMeetingStoryDraft, 'story', {
          ...story,
          acceptanceCriteria: [],
        })
      )
    ).toBe(false);
    expect(
      isMeetingStoryDraft(
        withField(createMeetingStoryIssue, 'jiraUrl', 'javascript:alert(1)')
      )
    ).toBe(false);
  });

  it('refuse a series with a Jira project key that is not one', () => {
    expect(
      isMeetingSeries(withField(createMeetingSeries, 'jiraProjectKey', 'proj'))
    ).toBe(false);
    expect(
      isMeetingSeries(withField(createMeetingSeries, 'jiraIssueType', 'Epic'))
    ).toBe(false);
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

  it('accept a meeting marked done without a start, and refuse a cancelled one that started or has no end', () => {
    const cancelled = cancelMeeting.meeting;
    expect(isMeeting(cancelled)).toBe(true);
    expect(isMeeting({ ...cancelled, status: 'ended', startedAt: null })).toBe(
      true
    );
    const started = withField(
      cancelled,
      'startedAt',
      '2026-10-06T08:00:00.000Z'
    );
    expect(isMeeting(started)).toBe(false);
    expect(isMeeting.explain(started)).toContain('startedAt');
    expect(isMeeting(withField(cancelled, 'endedAt', null))).toBe(false);
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
