import {
  absoluteTime,
  formatDuration,
  relativeTime,
  waitingTime,
} from './time';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Tue 6 Oct 2026, 12:00 local time. */
const NOW = new Date(2026, 9, 6, 12, 0, 0);

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe('relativeTime', () => {
  const CASES: readonly (readonly [number, string])[] = [
    [0, 'just now'],
    [59 * SECOND, 'just now'],
    [MINUTE, '1 m ago'],
    [22 * MINUTE, '22 m ago'],
    [59 * MINUTE, '59 m ago'],
    [HOUR, '1 h ago'],
    [2 * HOUR + 10 * MINUTE, '2 h 10 m ago'],
    [DAY, '1 d ago'],
    [3 * DAY, '3 d ago'],
  ];

  for (const [elapsed, expected] of CASES) {
    it(`shows "${expected}" for ${elapsed} ms ago`, () => {
      expect(relativeTime(ago(elapsed), NOW)).toBe(expected);
    });
  }

  it('treats a future time as now', () => {
    expect(relativeTime(new Date(NOW.getTime() + MINUTE), NOW)).toBe(
      'just now'
    );
  });

  it('accepts an ISO string', () => {
    expect(relativeTime(ago(22 * MINUTE).toISOString(), NOW)).toBe('22 m ago');
  });

  it('shows an em dash for an invalid date', () => {
    expect(relativeTime('not a date', NOW)).toBe('—');
  });
});

describe('absoluteTime', () => {
  it('shows a log time as "Tue 09:48"', () => {
    expect(absoluteTime(new Date(2026, 9, 6, 9, 48))).toBe('Tue 09:48');
  });

  it('shows another day as "Mon 10:31"', () => {
    expect(absoluteTime(new Date(2026, 9, 5, 10, 31))).toBe('Mon 10:31');
  });

  it('pads the minutes', () => {
    expect(absoluteTime(new Date(2026, 9, 6, 9, 5))).toBe('Tue 09:05');
  });

  it('shows an em dash for an invalid date', () => {
    expect(absoluteTime('nope')).toBe('—');
  });
});

describe('waitingTime', () => {
  const CASES: readonly (readonly [number, string])[] = [
    [30 * SECOND, 'just now'],
    [9 * MINUTE, '9 m'],
    [48 * MINUTE, '48 m'],
    [2 * HOUR + 10 * MINUTE, '2 h 10 m'],
    [2 * HOUR, '2 h'],
    [26 * HOUR, '1 d'],
  ];

  for (const [elapsed, expected] of CASES) {
    it(`shows "${expected}" for a ${elapsed} ms wait`, () => {
      expect(waitingTime(ago(elapsed), NOW)).toBe(expected);
    });
  }

  it('shows an em dash for an invalid date', () => {
    expect(waitingTime('nope', NOW)).toBe('—');
  });
});

describe('formatDuration', () => {
  const CASES: readonly (readonly [number, string])[] = [
    [0, '0 s'],
    [45 * SECOND, '45 s'],
    [16 * MINUTE + 12 * SECOND, '16 m 12 s'],
    [16 * MINUTE, '16 m'],
    [HOUR + 4 * MINUTE, '1 h 4 m'],
    [2 * HOUR, '2 h'],
  ];

  for (const [elapsed, expected] of CASES) {
    it(`shows "${expected}" for ${elapsed} ms`, () => {
      expect(formatDuration(NOW, new Date(NOW.getTime() + elapsed))).toBe(
        expected
      );
    });
  }

  it('never goes negative', () => {
    expect(formatDuration(NOW, ago(MINUTE))).toBe('0 s');
  });

  it('accepts ISO strings', () => {
    expect(
      formatDuration(new Date(2026, 9, 6, 9, 31), new Date(2026, 9, 6, 9, 47))
    ).toBe('16 m');
  });

  it('shows an em dash for an invalid date', () => {
    expect(formatDuration('nope', NOW)).toBe('—');
  });
});
