import { checkRestartCap, suggestedRestartCap } from './restart-voyage-dialog';

const AIU = 1_000_000_000;

describe('checkRestartCap', () => {
  it('takes an amount above what is already spent, in nano-AIU', () => {
    expect(checkRestartCap('40', 12 * AIU)).toEqual({ cap: 40 * AIU });
    expect(checkRestartCap(' 12.5 ', 12 * AIU)).toEqual({
      cap: 12_500_000_000,
    });
  });

  it('refuses a cap that leaves nothing above what is spent', () => {
    expect(checkRestartCap('12', 12 * AIU)).toEqual({ error: 'notAboveSpent' });
    expect(checkRestartCap('5', 12 * AIU)).toEqual({ error: 'notAboveSpent' });
    expect(checkRestartCap('0', 0)).toEqual({ error: 'notAboveSpent' });
  });

  it('refuses an empty field or text that is not an amount', () => {
    expect(checkRestartCap('  ', 0)).toEqual({ error: 'required' });
    expect(checkRestartCap('lots', 0)).toEqual({ error: 'amount' });
  });
});

describe('suggestedRestartCap', () => {
  it('offers the current cap while it leaves room, and nothing once it is spent', () => {
    expect(suggestedRestartCap(15 * AIU, 800_000_000)).toBe('15');
    expect(suggestedRestartCap(15 * AIU, 15 * AIU)).toBe('');
  });
});
