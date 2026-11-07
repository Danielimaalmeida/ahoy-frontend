import { normalizeQnumber, qnumberOf } from './access';

describe('normalizeQnumber', () => {
  it('lower-cases a qnumber and ignores the spaces around it', () => {
    expect(normalizeQnumber(' Q123456 ')).toBe('q123456');
    expect(normalizeQnumber('q7a8b9')).toBe('q7a8b9');
  });

  it.each([
    null,
    42,
    '',
    'q',
    'alex@example.com',
    'x123456',
    'q12-34',
    `q${'1'.repeat(63)}`,
  ])('refuses %s', (value) => {
    expect(normalizeQnumber(value)).toBeNull();
  });
});

describe('qnumberOf', () => {
  it('takes the first candidate that is a qnumber', () => {
    expect(qnumberOf([undefined, 'Alex Rivera', 'Q42', 'q43'])).toBe('q42');
  });

  it('gives null when none is', () => {
    expect(qnumberOf([null, 'alex@example.com'])).toBeNull();
  });
});
