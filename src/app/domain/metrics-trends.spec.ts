import {
  changeLabel,
  formatTrend,
  isTrendSpan,
  lastWeekPartial,
  sparkline,
  sparkX,
  TREND_SIGNALS,
  trendVerdict,
  versionWeeks,
  weekPosition,
  weekStartLabel,
  type TrendCounts,
} from './metrics-trends';

const ZERO: TrendCounts = {
  voyages: 0,
  halts: 0,
  repeatedHalts: 0,
  questions: 0,
  humanDecisions: 0,
  sentBack: 0,
  gateEvaluations: 0,
  gatePasses: 0,
  finished: 0,
  done: 0,
  finishedWithRework: 0,
  packages: 0,
  unverified: 0,
  runs: 0,
  runErrors: 0,
  nanoAiu: 0,
  fixNanoAiu: 0,
  medianNanoAiuPerDone: null,
  medianSecondsToDone: null,
  waits: 0,
  medianWaitSeconds: null,
};

const signal = (id: string) => TREND_SIGNALS.find((s) => s.id === id)!;

describe('the spans of the Trends section', () => {
  it('offers 8, 12 and 26 weeks and refuses anything else', () => {
    expect([8, 12, 26].every(isTrendSpan)).toBe(true);
    expect([0, 4, '12', null].some(isTrendSpan)).toBe(false);
  });
});

describe('the trend signals', () => {
  it('divides the counts, and has no value with nothing to divide by', () => {
    const counts = {
      ...ZERO,
      voyages: 4,
      halts: 3,
      finished: 5,
      finishedWithRework: 2,
      done: 8,
    };
    expect(signal('halts').value(counts, 1)).toBe(0.75);
    expect(signal('rework').value(counts, 1)).toBe(40);
    expect(signal('done').value(counts, 4)).toBe(2);
    expect(signal('gatePass').value(counts, 1)).toBeNull();
    expect(signal('timeToDone').value(counts, 1)).toBeNull();
  });

  it('says what each was counted over', () => {
    expect(signal('halts').basis({ ...ZERO, halts: 1, voyages: 2 })).toBe(
      '1 halt in 2 voyages'
    );
    expect(
      signal('sentBack').basis({ ...ZERO, sentBack: 2, humanDecisions: 9 })
    ).toBe('2 of 9 decisions');
  });

  it('has three groups and every signal says which way is better', () => {
    expect(new Set(TREND_SIGNALS.map((s) => s.group))).toEqual(
      new Set(['autonomy', 'quality', 'cost'])
    );
    expect(
      TREND_SIGNALS.filter((s) => s.better === 'higher').map((s) => s.id)
    ).toEqual(['gatePass', 'done']);
  });
});

describe('formatTrend', () => {
  it('words each kind of value, and a dash for none', () => {
    expect(formatTrend('ratio', 0.64)).toBe('0.6');
    expect(formatTrend('percent', 19.5)).toBe('20%');
    expect(formatTrend('aiu', 41_240_000_000)).toBe('41.2');
    expect(formatTrend('duration', 108_000)).toBe('1 d 6 h');
    expect(formatTrend('perWeek', 7)).toBe('7 / week');
    expect(formatTrend('perWeek', 5.5)).toBe('5.5 / week');
    expect(formatTrend('percent', null)).toBe('—');
  });
});

describe('trendVerdict', () => {
  it('calls a fall better when lower is better, and a rise worse', () => {
    expect(trendVerdict(0.6, 0.9, 'lower')).toEqual({
      verdict: 'better',
      change: -33,
    });
    expect(trendVerdict(12, 8, 'lower')).toEqual({
      verdict: 'worse',
      change: 50,
    });
    expect(trendVerdict(81, 69, 'higher')).toEqual({
      verdict: 'better',
      change: 17,
    });
  });

  it('calls a change under a tenth flat, and has nothing to say without both sides', () => {
    expect(trendVerdict(19, 20, 'lower').verdict).toBe('flat');
    expect(trendVerdict(0, 0, 'lower').verdict).toBe('flat');
    expect(trendVerdict(null, 3, 'lower')).toEqual({
      verdict: 'none',
      change: null,
    });
  });

  it('judges a rise from nothing without a percentage', () => {
    expect(trendVerdict(2, 0, 'lower')).toEqual({
      verdict: 'worse',
      change: null,
    });
    expect(changeLabel('worse', null, 2, 0)).toBe('↑ from 0');
    expect(changeLabel('better', -27, 0.6, 0.9)).toBe('↓ 27%');
    expect(changeLabel('flat', 2, 1, 1)).toBe('flat');
    expect(changeLabel('none', null, null, 1)).toBe('no data');
    expect(changeLabel('none', null, 5.5, null)).toBe('nothing before');
  });
});

describe('sparkline', () => {
  it('draws the highest value at the top, breaks the line at a week without one and fades thin weeks', () => {
    const spark = sparkline(
      [1, 3, null, 2, 2],
      ['a', 'b', 'c', 'd', 'e'],
      [true, false, false, false, false],
      104,
      54
    );
    expect(spark.lines).toEqual(['4,50 28,4', '76,27 100,27']);
    expect(spark.dots.map((d) => [d.x, d.y, d.faded, d.title])).toEqual([
      [4, 50, true, 'a'],
      [28, 4, false, 'b'],
      [76, 27, false, 'd'],
      [100, 27, false, 'e'],
    ]);
  });

  it('puts a flat series in the middle, and a single week alone', () => {
    expect(
      sparkline([5, 5], ['a', 'b'], [], 100, 50).dots.map((d) => d.y)
    ).toEqual([25, 25]);
    expect(sparkline([5], ['a'], [], 100, 50).lines).toEqual([]);
    expect(sparkX(0, 1, 100)).toBe(50);
    expect(sparkX(2, 5, 104)).toBe(52);
  });
});

describe('versionWeeks', () => {
  it('marks the week a version started in, never one that started before the span', () => {
    const weeks = ['2026-09-07', '2026-09-14', '2026-09-21'];
    expect(
      versionWeeks(weeks, [
        '2026-09-16T10:00:00Z',
        '2026-08-01T00:00:00Z',
        '2026-09-21T00:00:00Z',
      ])
    ).toEqual([1, 2]);
  });
});

describe('weekStartLabel', () => {
  it('names a week by its Monday', () => {
    expect(weekStartLabel('2026-09-14')).toBe('14 Sep');
    expect(weekStartLabel('2026-09-28')).toBe('28 Sep');
  });
});

describe('lastWeekPartial and weekPosition', () => {
  const weeks = ['2026-10-12', '2026-10-19', '2026-10-26'];

  it('says the last week is still running until its Monday a week on', () => {
    expect(lastWeekPartial(weeks, '2026-10-28T12:00:00Z')).toBe(true);
    expect(lastWeekPartial(weeks, '2026-11-02T00:00:00Z')).toBe(false);
    expect(lastWeekPartial([], '2026-10-28T12:00:00Z')).toBe(false);
  });

  it('places a time among the weeks, within them', () => {
    expect(weekPosition(weeks, '2026-10-15T12:00:00Z')).toBe(0.5);
    expect(weekPosition(weeks, '2026-09-01T00:00:00Z')).toBe(0);
    expect(weekPosition(weeks, '2026-12-01T00:00:00Z')).toBe(2);
  });
});
