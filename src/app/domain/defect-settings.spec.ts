import {
  defectsStateLabel,
  describeDefectEvent,
  prioritiesOf,
  prioritiesText,
} from './defect-settings';
import { describeSettingsEvent } from './settings';

describe('defectsStateLabel', () => {
  it('says whether the watch reads Jira', () => {
    expect(defectsStateLabel({ watchOn: true })).toEqual({
      label: 'Watching',
      off: false,
    });
    expect(defectsStateLabel({ watchOn: false })).toEqual({
      label: 'Off',
      off: true,
    });
  });
});

describe('prioritiesOf', () => {
  it('reads comma-separated names, trimmed, skipping empty ones', () => {
    expect(prioritiesOf(' Highest, High ,, ')).toEqual({
      value: ['Highest', 'High'],
    });
    expect(prioritiesOf('')).toEqual({ value: [] });
  });

  it('refuses a repeated name, case ignored, a long name and too many', () => {
    expect(prioritiesOf('High, high')).toEqual({
      problem: 'Name each priority once.',
    });
    expect(prioritiesOf('x'.repeat(61))).toEqual({
      problem: 'A priority is at most 60 characters.',
    });
    const many = Array.from({ length: 21 }, (_, i) => `P${i}`).join(',');
    expect(prioritiesOf(many)).toEqual({
      problem: 'Name at most 20 priorities.',
    });
  });

  it('reads back what prioritiesText writes', () => {
    const names = ['Highest', 'High'];
    expect(prioritiesOf(prioritiesText(names))).toEqual({ value: names });
  });
});

describe('describeDefectEvent', () => {
  it('names what a save changed, and is part of the settings history', () => {
    const payload = {
      changes: {
        watchOn: { from: false, to: true },
        defectsJql: { from: null, to: 'project = PROJ' },
        priorities: { from: ['High'], to: [] },
      },
    };
    const words = 'Watch: on; Query: changed; Priorities: none';
    expect(describeDefectEvent('defect_settings.updated', payload)).toBe(words);
    expect(describeSettingsEvent('defect_settings.updated', payload)).toBe(
      words
    );
  });

  it('says only that it saved when the changes cannot be read, and ignores other sections', () => {
    expect(describeDefectEvent('defect_settings.updated', null)).toBe(
      'Saved the defect settings'
    );
    expect(
      describeDefectEvent('pr_comment_settings.updated', {})
    ).toBeUndefined();
  });
});
