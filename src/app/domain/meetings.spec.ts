import {
  carryOverCandidates,
  dateInputValue,
  defaultMeeting,
  groupMeetings,
  moveInOrder,
  parseEmails,
  raisedByLabel,
  shortEmail,
  startsAtFrom,
  suggestedCarryOver,
  topicWhen,
  type MeetingLike,
  type TopicLike,
} from './meetings';

const meeting = (
  id: string,
  status: MeetingLike['status'],
  startsAt: string
): MeetingLike => ({ id, status, startsAt });

const topic = (over: Partial<TopicLike> & { id: string }): TopicLike => ({
  status: 'open',
  raisedBy: 'us',
  raisedByEmail: null,
  origin: 'planned',
  createdAt: '2026-10-06T10:24:00.000Z',
  notes: [],
  ...over,
});

describe('meetings', () => {
  const list = [
    meeting('past-1', 'ended', '2026-09-29T09:00:00.000Z'),
    meeting('next-2', 'planned', '2026-10-20T09:00:00.000Z'),
    meeting('now', 'in_progress', '2026-10-06T09:00:00.000Z'),
    meeting('past-2', 'ended', '2026-10-01T09:00:00.000Z'),
    meeting('next-1', 'planned', '2026-10-13T09:00:00.000Z'),
  ];

  it('lists the meeting running now, the planned ones soonest first and the ended ones latest first', () => {
    const groups = groupMeetings(list);
    expect(groups.now.map((m) => m.id)).toEqual(['now']);
    expect(groups.next.map((m) => m.id)).toEqual(['next-1', 'next-2']);
    expect(groups.past.map((m) => m.id)).toEqual(['past-2', 'past-1']);
  });

  it('opens the meeting running now, else the next one, else the latest that ended, else none', () => {
    expect(defaultMeeting(list)?.id).toBe('now');
    expect(defaultMeeting(list.filter((m) => m.id !== 'now'))?.id).toBe(
      'next-1'
    );
    expect(defaultMeeting(list.filter((m) => m.status === 'ended'))?.id).toBe(
      'past-2'
    );
    expect(defaultMeeting([])).toBeNull();
  });

  it('says who raised a topic, keeping a stakeholder short', () => {
    expect(raisedByLabel(topic({ id: 'a' }))).toBe('OTHER_COMPANY');
    expect(raisedByLabel(topic({ id: 'b', raisedBy: 'them' }))).toBe('ACME');
    expect(
      raisedByLabel(
        topic({ id: 'c', raisedBy: 'them', raisedByEmail: 'maria@example.com' })
      )
    ).toBe('ACME · maria@');
    expect(shortEmail('no-at-sign')).toBe('no-at-sign');
  });

  it('says a topic was planned, or when it was raised in the meeting', () => {
    expect(topicWhen(topic({ id: 'a' }))).toBe('planned');
    expect(topicWhen(topic({ id: 'b', origin: 'in_meeting' }))).toMatch(
      /^raised at \d{2}:\d{2}$/
    );
  });

  it('suggests carrying over the open topics nobody took a note on, and offers only open ones', () => {
    const topics = [
      topic({ id: 'noted', notes: [{}] }),
      topic({ id: 'silent' }),
      topic({ id: 'moved', status: 'moved' }),
    ];
    expect(suggestedCarryOver(topics)).toEqual(['silent']);
    expect(carryOverCandidates(topics).map((t) => t.id)).toEqual([
      'noted',
      'silent',
    ]);
  });

  it('moves one topic up or down the order, and keeps the order at either end', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a'], 'z', 1)).toEqual(['a']);
  });

  describe('parseEmails', () => {
    it('splits on commas, semicolons and spaces, lower-cases and keeps each e-mail once, in order', () => {
      expect(
        parseEmails(
          ' Priya@example.com, jordan@example.com;priya@example.com  sam@example.com '
        )
      ).toEqual(['priya@example.com', 'jordan@example.com', 'sam@example.com']);
    });

    it('answers nothing for an empty or blank list', () => {
      expect(parseEmails('')).toEqual([]);
      expect(parseEmails(' , ;')).toEqual([]);
    });
  });

  describe('dateInputValue and startsAtFrom', () => {
    it('writes a date as a date input takes it, in local time', () => {
      expect(dateInputValue(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
      expect(dateInputValue(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
    });

    it('turns a local day and time into the ISO instant the API takes', () => {
      expect(startsAtFrom('2026-10-22', '09:30')).toBe(
        new Date(2026, 9, 22, 9, 30).toISOString()
      );
    });

    it('answers null for a day or time it cannot read', () => {
      expect(startsAtFrom('', '09:30')).toBeNull();
      expect(startsAtFrom('2026-10-22', '')).toBeNull();
      expect(startsAtFrom('22/10/2026', '09:30')).toBeNull();
      expect(startsAtFrom('2026-13-40', '09:30')).toBeNull();
    });
  });
});
