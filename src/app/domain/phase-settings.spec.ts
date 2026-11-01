import { describe, expect, it } from 'vitest';
import {
  aiuLabel,
  capsRaised,
  describePhaseEvent,
  isStoryPhase,
  MAX_TIMEOUT_MINUTES,
  minutesLabel,
  MIN_TIMEOUT_MINUTES,
  phaseName,
  readBudget,
  readMinutes,
} from './phase-settings';
import { describeSettingsEvent } from './settings';

const AIU = 1_000_000_000;

describe('the phases in words', () => {
  it('names the known phases and keeps the name of one the deployment adds', () => {
    expect(phaseName('pr_review')).toBe('Review');
    expect(phaseName('refinement')).toBe('Pre-refinement');
    expect(phaseName('security_scan')).toBe('security_scan');
  });

  it("tells a story's phases from the agents' jobs outside one", () => {
    expect(isStoryPhase('implementation')).toBe(true);
    expect(isStoryPhase('diagnosis')).toBe(false);
  });

  it('writes AIU without trailing zeros and minutes as hours once past one', () => {
    expect(aiuLabel(60 * AIU)).toBe('60 AIU');
    expect(aiuLabel(2_500_000_000)).toBe('2.5 AIU');
    expect(aiuLabel(100_000_000)).toBe('0.1 AIU');
    expect(minutesLabel(15)).toBe('15 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(90)).toBe('1 h 30 min');
  });
});

describe('what an admin types', () => {
  it('takes a whole number of minutes within the limits, and says why it refuses one', () => {
    expect(
      readMinutes(' 30 ', MIN_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES)
    ).toEqual({ minutes: 30 });
    expect(readMinutes('1.5', 1, 60)).toEqual({
      problem: 'Give a whole number of minutes.',
    });
    expect(readMinutes('', 1, 60)).toEqual({
      problem: 'Give a whole number of minutes.',
    });
    expect(readMinutes('0', 1, 60)).toEqual({
      problem: 'Give 1 to 60 minutes.',
    });
    expect(readMinutes('61', 1, 60)).toEqual({
      problem: 'Give 1 to 60 minutes.',
    });
  });

  it('reads an AIU cap without floats, from 0.1 AIU to the cap', () => {
    expect(readBudget('2.5', 100 * AIU)).toEqual({ nanoAiu: 2_500_000_000 });
    expect(readBudget('100', 100 * AIU)).toEqual({ nanoAiu: 100 * AIU });
    expect(readBudget('lots', 100 * AIU)).toEqual({
      problem: 'Give an amount of AIU, such as 25 or 2.5.',
    });
    expect(readBudget('0.05', 100 * AIU)).toEqual({
      problem: 'Give at least 0.1 AIU.',
    });
    expect(readBudget('101', 100 * AIU)).toEqual({
      problem: 'The most allowed is 100 AIU.',
    });
  });

  it('finds the changes that raise a cap, and only those', () => {
    expect(
      capsRaised([
        { phase: 'intake', from: 10 * AIU, to: 5 * AIU },
        { phase: 'planning', from: 60 * AIU, to: 80 * AIU },
        { phase: 'pr_review', from: 30 * AIU, to: 30 * AIU },
      ])
    ).toEqual([{ phase: 'planning', from: 60 * AIU, to: 80 * AIU }]);
  });
});

describe('an entry of the phases’ history', () => {
  it('says each field that changed, in words, and a confirmed higher cap', () => {
    const payload = {
      changes: {
        'planning.budgetNanoAiu': {
          from: 60 * AIU,
          to: 80 * AIU,
          ranOn: 60 * AIU,
          runsOn: 80 * AIU,
        },
        'planning.model': { from: null, to: 'claude-sonnet-5' },
        'implementation.timeoutSeconds': { from: 3600, to: 5400 },
        'implementation.ciWaitMinutes': { from: 30, to: null },
      },
      confirmSpend: true,
    };
    expect(describePhaseEvent('phase_settings.updated', payload)).toBe(
      'Planning AIU cap per run: 60 AIU → 80 AIU; Planning model: the deployment’s → claude-sonnet-5; ' +
        'Implementation timeout: 1 h → 1 h 30 min; Implementation wait for CI: 30 min → the deployment’s ' +
        '(confirmed the higher AIU cap)'
    );
  });

  it('says the catalogue it saved or gave back, and reads a payload it does not know without failing', () => {
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: {
          models: { from: null, to: ['claude-sonnet-5', 'gpt-5.6-luna'] },
        },
      })
    ).toBe('Models: the built-in list → claude-sonnet-5, gpt-5.6-luna');
    expect(describePhaseEvent('phase_settings.updated', 'odd')).toBe(
      'Saved the phases'
    );
    expect(describePhaseEvent('agent_settings.updated', {})).toBeUndefined();
  });

  it('is what the settings history shows for a Phases entry', () => {
    expect(describeSettingsEvent('phase_settings.updated', {})).toBe(
      'Saved the phases'
    );
  });
});
