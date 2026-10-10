import {
  budgetPercent,
  capCoversSpent,
  formatAiu,
  parseAiu,
  remainingNano,
} from './aiu';

const AIU = 1_000_000_000;

describe('formatAiu', () => {
  const CASES: readonly (readonly [number, number, string])[] = [
    [0, 1, '0.0'],
    [12 * AIU + 400_000_000, 1, '12.4'],
    [30 * AIU, 1, '30.0'],
    [24 * AIU + 60_000_000, 2, '24.06'],
    [1, 9, '0.000000001'],
    [999, 0, '0'],
    [2_500_000_000, 0, '3'],
    [2_499_999_999, 0, '2'],
    [-12 * AIU - 400_000_000, 1, '-12.4'],
    [12 * AIU + 400_000_000, 0, '12'],
    [12 * AIU + 400_000_000, 42, '12.400000000'],
    [12 * AIU + 400_000_000, -3, '12'],
  ];

  for (const [nano, decimals, expected] of CASES) {
    it(`formats ${nano} nano with ${decimals} decimals as "${expected}"`, () => {
      expect(formatAiu(nano, decimals)).toBe(expected);
    });
  }

  it('rounds half up without floats', () => {
    expect(formatAiu(1_950_000_000, 1)).toBe('2.0');
    expect(formatAiu(1_949_999_999, 1)).toBe('1.9');
  });

  it('refuses values that are not safe integers', () => {
    expect(formatAiu(12.4)).toBe('—');
    expect(formatAiu(Number.NaN)).toBe('—');
    expect(formatAiu(Number.MAX_SAFE_INTEGER + 1)).toBe('—');
  });

  it('falls back to one decimal when the decimals argument is not a number', () => {
    expect(formatAiu(12_400_000_000, Number.NaN)).toBe('12.4');
  });
});

describe('parseAiu', () => {
  const ACCEPTED: readonly (readonly [string, number])[] = [
    ['25', 25 * AIU],
    ['100', 100_000_000_000],
    ['25.5', 25 * AIU + 500_000_000],
    ['0.1', 100_000_000],
    ['24.06', 24 * AIU + 60_000_000],
    ['0.000000001', 1],
    ['0', 0],
    [' 30 ', 30 * AIU],
  ];

  for (const [text, nano] of ACCEPTED) {
    it(`reads "${text}" as ${nano} nano`, () => {
      expect(parseAiu(text)).toBe(nano);
    });
  }

  const REJECTED = [
    '1e3',
    '-1',
    '+1',
    '',
    '   ',
    '25.',
    '.5',
    '25,5',
    '0.0000000001',
    '1 000',
    'NaN',
    'Infinity',
    '9007199255',
  ];

  for (const text of REJECTED) {
    it(`refuses "${text}"`, () => {
      expect(parseAiu(text)).toBeNull();
    });
  }
});

describe('parseAiu and formatAiu', () => {
  const ROUND_TRIPS: readonly (readonly [string, number])[] = [
    ['0.1', 1],
    ['12.4', 1],
    ['24.06', 2],
    ['30', 0],
    ['0.000000001', 9],
  ];

  for (const [text, decimals] of ROUND_TRIPS) {
    it(`round-trips "${text}" without a float error`, () => {
      const nano = parseAiu(text);
      expect(nano).not.toBeNull();
      expect(formatAiu(nano!, decimals)).toBe(text);
    });
  }
});

describe('remainingNano', () => {
  it('is the cap minus what was spent', () => {
    expect(remainingNano(30 * AIU, 12 * AIU + 400_000_000)).toBe(
      17 * AIU + 600_000_000
    );
  });

  it('never goes below zero', () => {
    expect(remainingNano(10, 20)).toBe(0);
    expect(remainingNano(0, 0)).toBe(0);
  });
});

describe('budgetPercent', () => {
  const CASES: readonly (readonly [number, number, number])[] = [
    [30 * AIU, 12 * AIU + 400_000_000, 41],
    [20 * AIU, 9 * AIU + 800_000_000, 49],
    [25 * AIU, 6 * AIU + 100_000_000, 24],
    [30 * AIU, 3 * AIU + 200_000_000, 11],
    [15 * AIU, 600_000_000, 4],
    [21 * AIU + 440_000_000, 3 * AIU + 840_000_000, 18],
    [30 * AIU, 0, 0],
  ];

  for (const [cap, spent, percent] of CASES) {
    it(`shows ${percent}% for ${spent} of ${cap} nano`, () => {
      expect(budgetPercent(cap, spent)).toBe(percent);
    });
  }

  it('stays inside 0–100', () => {
    expect(budgetPercent(10, 20)).toBe(100);
    expect(budgetPercent(10, -5)).toBe(0);
  });

  it('is 100% when something was spent with no cap, and 0% when nothing was', () => {
    expect(budgetPercent(0, 5)).toBe(100);
    expect(budgetPercent(0, 0)).toBe(0);
  });
});

describe('capCoversSpent', () => {
  it('accepts a cap equal to or above what was spent', () => {
    expect(capCoversSpent(12 * AIU + 400_000_000, 12 * AIU + 400_000_000)).toBe(
      true
    );
    expect(capCoversSpent(40 * AIU, 12 * AIU + 400_000_000)).toBe(true);
  });

  it('rejects a cap below what was spent', () => {
    expect(capCoversSpent(10 * AIU, 12 * AIU + 400_000_000)).toBe(false);
  });
});
