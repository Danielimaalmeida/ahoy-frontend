import {
  groupHaltWeeks,
  barWidth,
  changeVsPrevious,
  fixerLabel,
  formatMetricsAiu,
  formatPercent,
  formatSeconds,
  formatShare,
  formatTokens,
  isMetricsPeriod,
  outcomesLine,
  percentOf,
  periodRange,
  previousRange,
  stackWeeks,
  waitLabel,
  weekLabel,
} from './metrics';

describe('the period of the Metrics page', () => {
  it('offers 7, 30 and 90 days and refuses anything else', () => {
    expect([7, 30, 90].every(isMetricsPeriod)).toBe(true);
    expect([0, 31, '30', null].some(isMetricsPeriod)).toBe(false);
  });

  it('reads the days before now, and the same length just before that', () => {
    const range = periodRange(30, new Date('2026-10-11T09:00:00.000Z'));
    expect(range).toEqual({
      from: '2026-09-11T09:00:00.000Z',
      to: '2026-10-11T09:00:00.000Z',
    });
    expect(previousRange(range)).toEqual({
      from: '2026-08-12T09:00:00.000Z',
      to: '2026-09-11T09:00:00.000Z',
    });
  });
});

describe('formatSeconds', () => {
  it('says a duration in the largest two units, and a dash for none', () => {
    expect(formatSeconds(45)).toBe('45 s');
    expect(formatSeconds(48 * 60 + 59)).toBe('48 m');
    expect(formatSeconds(3 * 3600)).toBe('3 h');
    expect(formatSeconds(2 * 3600 + 50 * 60)).toBe('2 h 50 m');
    expect(formatSeconds(3 * 86400 + 4 * 3600)).toBe('3 d 4 h');
    expect(formatSeconds(null)).toBe('—');
    expect(formatSeconds(-1)).toBe('—');
    expect(formatSeconds(1.5)).toBe('—');
  });
});

describe('percentages and changes', () => {
  it('rounds half up and gives none without a whole', () => {
    expect(percentOf(146, 186)).toBe(78);
    expect(percentOf(1, 8)).toBe(13);
    expect(percentOf(3, 0)).toBeNull();
    expect(formatPercent(13, 41)).toBe('32%');
    expect(formatPercent(0, 0)).toBe('—');
  });

  it('gives a share to one decimal, rounded half up', () => {
    expect(formatShare(171_300, 412_800)).toBe('41.5%');
    expect(formatShare(18_600, 412_800)).toBe('4.5%');
    expect(formatShare(1, 2000)).toBe('0.1%');
    expect(formatShare(5, 5)).toBe('100.0%');
    expect(formatShare(0, 7)).toBe('0.0%');
    expect(formatShare(3, 0)).toBe('—');
  });

  it('compares with the period before only when there was something then', () => {
    expect(changeVsPrevious(412, 368, 30)).toBe('+12% vs previous 30 days');
    expect(changeVsPrevious(17, 23, 7)).toBe('−26% vs previous 7 days');
    expect(changeVsPrevious(5, 0, 30)).toBeNull();
  });

  it('draws a bar for any value above zero, never wider than the widest', () => {
    expect(barWidth(0, 10)).toBe(0);
    expect(barWidth(1, 1000)).toBe(1);
    expect(barWidth(5, 10)).toBe(50);
    expect(barWidth(12, 10)).toBe(100);
    expect(barWidth(3, 0)).toBe(0);
  });
});

describe('numbers for tiles and tables', () => {
  it('shortens token counts without floats', () => {
    expect(formatTokens(820)).toBe('820');
    expect(formatTokens(48_250)).toBe('48.3 k');
    expect(formatTokens(48_200_000)).toBe('48.2 M');
    expect(formatTokens(-1)).toBe('—');
  });

  it('shows AIU with two decimals', () => {
    expect(formatMetricsAiu(412_800_000_000)).toBe('412.80');
  });
});

describe('weekLabel', () => {
  it('names a week by its days, with both months when it spans two', () => {
    expect(weekLabel('2026-09-14')).toBe('14–20 Sep');
    expect(weekLabel('2026-09-28')).toBe('28 Sep–4 Oct');
    expect(weekLabel('not a date')).toBe('not a date');
  });
});

describe('stackWeeks', () => {
  it('gives each phase its colour slot in the order the API lists them, and adds each week up', () => {
    const { series, columns } = stackWeeks(
      [{ weekStart: '2026-09-14', byPhase: { planning: 2, intake: 1 } }],
      ['intake', 'planning']
    );
    expect(series.map((s) => [s.label, s.slot])).toEqual([
      ['intake', 1],
      ['planning', 2],
    ]);
    expect(columns).toEqual([
      {
        label: '14–20 Sep',
        total: 3,
        parts: [
          { slot: 1, value: 1 },
          { slot: 2, value: 2 },
        ],
      },
    ]);
  });

  it('folds the phases past the fifth into Other instead of making up a colour', () => {
    const phases = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { series, columns } = stackWeeks(
      [{ weekStart: '2026-09-14', byPhase: { e: 1, f: 2, g: 4 } }],
      phases
    );
    expect(series.map((s) => s.label)).toEqual(['a', 'b', 'c', 'd', 'Other']);
    expect(series.at(-1)!.phases).toEqual(['e', 'f', 'g']);
    expect(columns[0]!.parts.at(-1)).toEqual({ slot: 5, value: 7 });
  });
});

describe('words for people', () => {
  it('names who fixes a halt, and passes an unknown value through as it is', () => {
    expect(fixerLabel('story_owner')).toBe('Owner');
    expect(fixerLabel('agent_maintainer')).toBe('Agent instructions');
    expect(fixerLabel('toString')).toBe('toString');
  });

  it('names what a person was waited on for', () => {
    expect(waitLabel('answers', null)).toBe('Answers to agent questions');
    expect(waitLabel('decision', 'plan_accepted')).toBe('Plan review');
    expect(waitLabel('decision', 'delivery_accepted')).toBe('Delivery');
    expect(waitLabel('decision', 'other_gate')).toBe('Human gate');
    expect(waitLabel('resume', null)).toBe('Resume after a halt');
  });

  it('lists the outcomes of a wait, most first', () => {
    expect(
      outcomesLine({ send_back: 3, approve: 8, reject: 1, cancel: 0 })
    ).toBe('8 approve · 3 send back · 1 reject');
    expect(outcomesLine({})).toBe('—');
  });
});

describe('groupHaltWeeks', () => {
  it('groups the rows by week, oldest first, adding up halts and repeats, each week most halts first', () => {
    const weeks = groupHaltWeeks([
      {
        weekStart: '2026-10-05',
        kind: 'other',
        halts: 1,
        stories: 1,
        repeated: 1,
      },
      {
        weekStart: '2026-09-28',
        kind: 'auth',
        halts: 1,
        stories: 1,
        repeated: 0,
      },
      {
        weekStart: '2026-10-05',
        kind: 'auth',
        halts: 3,
        stories: 2,
        repeated: 3,
      },
    ]);
    expect(weeks.map((w) => [w.label, w.halts, w.repeated])).toEqual([
      ['28 Sep–4 Oct', 1, 0],
      ['5–11 Oct', 4, 4],
    ]);
    expect(weeks[1]?.kinds.map((k) => k.kind)).toEqual(['auth', 'other']);
    expect(groupHaltWeeks([])).toEqual([]);
  });
});
