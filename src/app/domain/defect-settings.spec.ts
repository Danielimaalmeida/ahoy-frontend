import {
  dailySpendText,
  defectsStateLabel,
  startCapOf,
  describeDefectEvent,
  prioritiesOf,
  prioritiesText,
  reproduceModeLabel,
  reproductionCapOf,
  reproductionSpendsMore,
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
      startAs: 'q123456',
    };
    const off = { ...on, autoStart: false };
    expect(spendsMore(off, on)).toBe(true);
    expect(spendsMore({ ...on, watchOn: false }, on)).toBe(true);
    expect(spendsMore(on, { ...on, budgetNanoAiu: 30_000_000_000 })).toBe(true);
    expect(spendsMore(on, { ...on, maxStartsPerDay: 3 })).toBe(true);
    expect(spendsMore(on, { ...on, startAs: 'q777' })).toBe(true);
    expect(spendsMore(off, { ...off, startAs: 'q777' })).toBe(false);
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

describe('reproduction in words', () => {
  it('reads the reproductions per day from 1 to 50', () => {
    expect(reproductionCapOf(' 5 ')).toEqual({ value: 5 });
    expect(reproductionCapOf('50')).toEqual({ value: 50 });
    for (const typed of ['0', '51', '2.5', '-1', 'five', ''])
      expect(reproductionCapOf(typed), typed).toEqual({
        problem: 'Type a whole number from 1 to 50.',
      });
  });

  it('asks for a yes when reproduction is turned on or may run more often, as the API does', () => {
    const off = { reproduceOn: false, maxReproductionsPerDay: 5 };
    const on = { reproduceOn: true, maxReproductionsPerDay: 5 };
    expect(reproductionSpendsMore(off, on)).toBe(true);
    expect(
      reproductionSpendsMore(on, { ...on, maxReproductionsPerDay: 6 })
    ).toBe(true);
    expect(reproductionSpendsMore(on, on)).toBe(false);
    expect(
      reproductionSpendsMore(on, { ...on, maxReproductionsPerDay: 4 })
    ).toBe(false);
    expect(reproductionSpendsMore(on, off)).toBe(false);
    expect(
      reproductionSpendsMore(off, { ...off, maxReproductionsPerDay: 50 })
    ).toBe(false);
  });

  it('says what each mode does with the verdict', () => {
    expect(reproduceModeLabel('advisory')).toBe(
      'Advisory: the verdict is shown, starts go on as before'
    );
    expect(reproduceModeLabel('required')).toBe(
      'Required: Ahoy starts only what it reproduced'
    );
  });

  it('names reproduction in the history, without the id of the environment', () => {
    expect(
      describeDefectEvent('defect_settings.updated', {
        changes: {
          reproduceOn: { from: false, to: true },
          reproduceMode: { from: 'advisory', to: 'required' },
          reproduceEnvironmentId: {
            from: null,
            to: '5f0c1d6e-2b7a-4c39-9a51-0d3e8f4b6a21',
          },
          maxReproductionsPerDay: { from: 5, to: 8 },
        },
      })
    ).toBe(
      'Reproduction: on; Reproduction mode: required; Reproduction environment: changed; Reproductions per day: 8'
    );
    expect(
      describeDefectEvent('defect_settings.updated', {
        changes: {
          reproduceOn: { from: true, to: false },
          reproduceEnvironmentId: { from: 'x', to: null },
        },
      })
    ).toBe('Reproduction: off; Reproduction environment: none');
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
