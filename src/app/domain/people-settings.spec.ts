import { describe, expect, it } from 'vitest';
import { describePeopleEvent, qnumberOf } from './people-settings';

describe('who may use Ahoy, in words', () => {
  it('reads a qnumber trimmed and lower-cased, and refuses anything else', () => {
    expect(qnumberOf(' Q12ab3 ')).toEqual({ value: 'q12ab3' });
    expect(qnumberOf('  ')).toEqual({ problem: 'Give a qnumber.' });
    for (const typed of ['alex@example.com', 'q', 'q 12', 'q'.padEnd(64, '1')])
      expect(qnumberOf(typed)).toHaveProperty('problem');
  });

  it('describes each change in the history, and leaves other sections’ entries alone', () => {
    expect(
      describePeopleEvent('members.added', { qnumber: 'q1', role: 'admin' })
    ).toBe('Added q1 as admin');
    expect(
      describePeopleEvent('members.removed', { qnumber: 'q1', role: 'member' })
    ).toBe('Removed q1');
    expect(
      describePeopleEvent('members.role_changed', {
        qnumber: 'q1',
        changes: { role: { from: 'admin', to: 'member' } },
      })
    ).toBe('q1: Admin → Member');
    expect(describePeopleEvent('members.added', null)).toBe('Added ? as ?');
    expect(describePeopleEvent('meeting_settings.updated', {})).toBe(undefined);
  });
});
