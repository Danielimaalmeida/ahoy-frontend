import { outcomePresentation } from './outcome';
import type { OutcomeModifier } from './outcome';

describe('outcomePresentation', () => {
  const CASES: readonly (readonly [string, OutcomeModifier])[] = [
    // Automated checks and human gates.
    ['pass', 'done'],
    ['approve', 'done'],
    ['branch', 'input'],
    ['send_back', 'sendback'],
    ['fail', 'halted'],
    ['error', 'halted'],
    ['reject', 'halted'],
    ['halt', 'halted'],
    ['waiting', 'decision'],
    // Runs.
    ['queued', 'queued'],
    ['running', 'running'],
    ['awaiting_input', 'input'],
    ['succeeded', 'done'],
    ['failed', 'halted'],
    ['lost', 'halted'],
    ['cancelled', 'queued'],
    ['timed_out', 'halted'],
    ['auth_failed', 'halted'],
    ['output_violation', 'halted'],
    ['budget_exceeded', 'halted'],
  ];

  for (const [value, modifier] of CASES) {
    it(`shows ${value} as ${modifier}`, () => {
      expect(outcomePresentation(value)).toEqual({ label: value, modifier });
    });
  }

  it('keeps the API word as the label', () => {
    expect(outcomePresentation('send_back').label).toBe('send_back');
  });

  it('stays neutral for an unknown outcome instead of reading as a verdict', () => {
    expect(outcomePresentation('new_status')).toEqual({
      label: 'new_status',
      modifier: 'queued',
    });
  });
});
