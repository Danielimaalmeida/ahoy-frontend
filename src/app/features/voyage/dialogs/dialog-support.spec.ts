import { serverFieldError } from './dialog-support';

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
