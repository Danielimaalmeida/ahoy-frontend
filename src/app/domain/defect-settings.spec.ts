import {
  dailySpendText,
  defectsStateLabel,
  startCapOf,
  describeDefectEvent,
  prioritiesOf,
  prioritiesText,
  spendsMore,
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

describe('automatic starts in words', () => {
  it('says Fixing when the watch starts defects by itself', () => {
    expect(defectsStateLabel({ watchOn: true, autoStart: true }).label).toBe(
      'Fixing'
    );
  });

  it('reads a cap on starts from 1 to 20', () => {
    expect(startCapOf(' 3 ')).toEqual({ value: 3 });
    expect(startCapOf('0')).toEqual({
      problem: 'Type a whole number from 1 to 20.',
    });
    expect(startCapOf('2.5')).toEqual({
      problem: 'Type a whole number from 1 to 20.',
    });
  });

  it('says the most a day may spend', () => {
    expect(dailySpendText(12_500_000_000, 2)).toBe('25 AIU');
    expect(dailySpendText(null, 2)).toBeNull();
  });

  it('names the automatic starts in the history', () => {
    expect(
      describeDefectEvent('defect_settings.updated', {
        changes: {
          autoStart: { from: false, to: true },
          budgetNanoAiu: { from: null, to: 20_000_000_000 },
        },
      })
    ).toBe('Automatic starts: on; AIU cap per defect: 20 AIU');
    expect(
      describeDefectEvent('defect_settings.updated', {
        changes: { budgetNanoAiu: { from: null, to: 12_345_000_000 } },
      })
    ).toBe('AIU cap per defect: 12.345 AIU');
  });

  it('asks for a yes when the watch may spend more by itself, as the API does', () => {
    const on = {
      watchOn: true,
      autoStart: true,
      budgetNanoAiu: 20_000_000_000,
      maxStartsPerDay: 2,
    };
    const off = { ...on, autoStart: false };
    expect(spendsMore(off, on)).toBe(true);
    expect(spendsMore({ ...on, watchOn: false }, on)).toBe(true);
    expect(spendsMore(on, { ...on, budgetNanoAiu: 30_000_000_000 })).toBe(true);
    expect(spendsMore(on, { ...on, maxStartsPerDay: 3 })).toBe(true);
    expect(
      spendsMore(on, {
        ...on,
        budgetNanoAiu: 10_000_000_000,
        maxStartsPerDay: 1,
      })
    ).toBe(false);
    expect(spendsMore(on, off)).toBe(false);
    expect(spendsMore(off, { ...on, watchOn: false })).toBe(false);
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
        startAs: { from: null, to: 'q123456' },
      },
    };
    const words =
      'Watch: on; Query: changed; Priorities: none; Start as: q123456';
    expect(describeDefectEvent('defect_settings.updated', payload)).toBe(words);
    expect(describeSettingsEvent('defect_settings.updated', payload)).toBe(
      words
    );
  });

  it('still reads a save from before the component map was removed', () => {
    const payload = {
      changes: {
        components: {
          from: [],
          to: [{ component: 'Billing', repository: 'billing-api' }],
        },
      },
    };
    expect(describeDefectEvent('defect_settings.updated', payload)).toBe(
      'Components: 1'
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
