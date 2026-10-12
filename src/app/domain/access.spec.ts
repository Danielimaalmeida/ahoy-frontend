import { isAllowedUser, normalizeQnumber, qnumberOf } from './access';

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

describe('isAllowedUser', () => {
  it('lets everyone through when the app has no list: the API decides', () => {
    expect(isAllowedUser(null, undefined)).toBe(true);
    expect(isAllowedUser('q1', undefined)).toBe(true);
  });

  it('lets through only a qnumber on the list', () => {
    expect(isAllowedUser('q123456', ['q123456', 'q7'])).toBe(true);
    expect(isAllowedUser('q654321', ['q123456'])).toBe(false);
  });

  it('refuses a user whose qnumber cannot be read, and everyone on an empty list', () => {
    expect(isAllowedUser(null, ['q123456'])).toBe(false);
    expect(isAllowedUser('q123456', [])).toBe(false);
  });
});
