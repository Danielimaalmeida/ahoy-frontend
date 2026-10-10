import { FormControl } from '@angular/forms';
import {
  REASON_MAX,
  maxTrimmed,
  requiredText,
  serverFieldError,
} from './dialog-support';

describe('requiredText', () => {
  it('refuses empty and blank text', () => {
    expect(requiredText(new FormControl('', { nonNullable: true }))).toEqual({
      required: true,
    });
    expect(
      requiredText(new FormControl('  \n ', { nonNullable: true }))
    ).toEqual({ required: true });
    expect(
      requiredText(new FormControl('Wrong repo', { nonNullable: true }))
    ).toBeNull();
  });
});

describe('maxTrimmed', () => {
  it("allows the API's 2000 characters, not counting spaces around them", () => {
    const check = maxTrimmed(REASON_MAX);
    expect(
      check(new FormControl(`  ${'a'.repeat(2000)}  `, { nonNullable: true }))
    ).toBeNull();
    expect(
      check(new FormControl('a'.repeat(2001), { nonNullable: true }))
    ).toEqual({
      maxlength: { requiredLength: 2000, actualLength: 2001 },
    });
  });
});

describe('serverFieldError', () => {
  it('picks the messages of a 400 for one field, in either path form', () => {
    const outcome = {
      kind: 'other' as const,
      error: {
        kind: 'problem' as const,
        status: 400,
        code: 'validation_failed',
        title: 'Validation failed',
        errors: [
          {
            path: 'body/reason',
            message: 'must NOT have fewer than 1 characters',
          },
          { path: '/budgetNanoAiu', message: 'must be >= 1' },
        ],
      },
    };
    expect(serverFieldError(outcome, 'reason')).toBe(
      'must NOT have fewer than 1 characters'
    );
    expect(serverFieldError(outcome, 'budgetNanoAiu')).toBe('must be >= 1');
    expect(serverFieldError(outcome, 'models')).toBe('');
  });

  it('gives nothing for other outcomes', () => {
    expect(serverFieldError(null, 'reason')).toBe('');
    expect(serverFieldError({ kind: 'ok', value: 1 }, 'reason')).toBe('');
    expect(
      serverFieldError({ kind: 'other', error: { kind: 'network' } }, 'reason')
    ).toBe('');
  });
});
