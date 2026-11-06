import { describe, expect, it } from 'vitest';
import { describeMeetingEvent, meetingLabelOf } from './meeting-settings';

describe('the names of a meeting’s two sides', () => {
  it('keeps a name trimmed, up to 40 characters on one line', () => {
    expect(meetingLabelOf('  Northwind ')).toEqual({ value: 'Northwind' });
    expect(meetingLabelOf('é'.repeat(40))).toEqual({ value: 'é'.repeat(40) });
  });

  it('refuses a blank, too long or multi-line name', () => {
    expect(meetingLabelOf('  ')).toEqual({ problem: 'Give the side a name.' });
    expect(meetingLabelOf('x'.repeat(41))).toEqual({
      problem: 'At most 40 characters.',
    });
    expect(meetingLabelOf('North\nwind')).toEqual({
      problem: 'Keep the name on one line.',
    });
  });

  it('describes a rename in the history, and leaves other sections’ entries alone', () => {
    expect(
      describeMeetingEvent('meeting_settings.updated', {
        changes: { usLabel: { from: 'Us', to: 'Northwind' } },
      })
    ).toBe('Our side: “Us” → “Northwind”');
    expect(describeMeetingEvent('meeting_settings.updated', [])).toBe(
      'Saved the meeting names'
    );
    expect(describeMeetingEvent('pr_comment_settings.updated', {})).toBe(
      undefined
    );
  });
});
