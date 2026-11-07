import { describe, expect, it } from 'vitest';
import {
  copilotSetupStep,
  nextSetupStep,
  setupBannerText,
  setupPercent,
  setupProgressLabel,
  setupReady,
  setupRemainderLabel,
  type SetupLike,
  type SetupStepLike,
} from './setup';

const step = (
  title: string,
  group: SetupStepLike['group'],
  required: boolean,
  state: SetupStepLike['state']
): SetupStepLike => ({ title, group, required, state });

const SETUP: SetupLike = {
  steps: [
    step('Database', 'installation', true, 'done'),
    step('Runs', 'installation', true, 'missing'),
    step('MCP servers', 'installation', false, 'attention'),
    step('Jira', 'team', true, 'done'),
    step('Agents', 'team', true, 'attention'),
    step('Meeting labels', 'team', false, 'optional'),
    step('Teams channel', 'team', false, 'optional'),
  ],
  requiredDone: 2,
  requiredTotal: 4,
};

describe('the Setup page in words', () => {
  it('names the first required step not done as the next, and none once every one is', () => {
    expect(nextSetupStep(SETUP)?.title).toBe('Runs');
    const ready = {
      steps: SETUP.steps.filter((s) => !s.required || s.state === 'done'),
      requiredDone: 2,
      requiredTotal: 2,
    };
    expect(nextSetupStep(ready)).toBeNull();
    expect([setupReady(SETUP), setupReady(ready)]).toEqual([false, true]);
  });

  it('counts what is left by who fixes it', () => {
    expect(setupProgressLabel(SETUP)).toBe('2 of 4');
    expect(setupPercent(SETUP)).toBe(50);
    expect(setupPercent({ steps: [], requiredDone: 0, requiredTotal: 0 })).toBe(
      100
    );
    expect(setupRemainderLabel(SETUP)).toBe(
      '1 to fix in the chart · 1 to fix here · 1 to check · 2 optional not set'
    );
    expect(
      setupRemainderLabel({ steps: [], requiredDone: 0, requiredTotal: 0 })
    ).toBe('Nothing left to do');
  });

  it('tells an admin the next step and where it is fixed, and a member only that admins are on it', () => {
    expect(setupBannerText(SETUP, true)).toEqual({
      heading: 'Ahoy is not ready yet: 2 of 4 required steps done.',
      text: 'Voyages may fail until the rest are. Next: Runs, in the Helm chart.',
    });
    expect(setupBannerText(SETUP, false)).toEqual({
      heading: 'Ahoy is being set up.',
      text: 'Some features may not work until the admins finish (2 of 4 required steps).',
    });
  });
});

describe('the Copilot token step after a change', () => {
  const saved = {
    qnumber: 'q1abcde',
    tokenReadable: true,
    token: { hint: 'abcd', lastTest: null },
  };

  it('says what Setup would say for each state of the token', () => {
    expect(copilotSetupStep({ ...saved, token: null })).toEqual({
      state: 'optional',
      detail:
        "Not saved: your runs use the cluster's ahoy-copilot-q1abcde Secret, if there is one.",
    });
    expect(copilotSetupStep({ ...saved, tokenReadable: false }).state).toBe(
      'attention'
    );
    expect(copilotSetupStep(saved)).toEqual({
      state: 'done',
      detail: 'Saved, ending in abcd; test it to see that GitHub takes it.',
    });
    const tested = (result: 'works' | 'refused' | 'unreachable') =>
      copilotSetupStep({
        ...saved,
        token: { hint: 'abcd', lastTest: { result, detail: 'alex' } },
      });
    expect(tested('works')).toEqual({
      state: 'done',
      detail: 'Saved, ending in abcd; it works as alex.',
    });
    expect(tested('refused')).toEqual({
      state: 'attention',
      detail: 'GitHub refused it at the last test.',
    });
    expect(tested('unreachable').state).toBe('done');
  });
});
