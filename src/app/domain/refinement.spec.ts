import {
  isActiveRefinement,
  refinementLabel,
  refinementStateLabel,
} from './refinement';
import type { RefinementStatus } from './types';

describe('refinement statuses', () => {
  it('counts only queued and running refinements as in progress', () => {
    const active: RefinementStatus[] = ['queued', 'running'];
    const ended: RefinementStatus[] = [
      'succeeded',
      'failed',
      'budget_exceeded',
      'timed_out',
      'cancelled',
      'output_violation',
      'auth_failed',
      'lost',
    ];
    expect(active.every(isActiveRefinement)).toBe(true);
    expect(ended.some(isActiveRefinement)).toBe(false);
  });

  it('words every status, with every way of ending without content as Failed except a cancel', () => {
    expect(refinementLabel('queued')).toBe('Queued');
    expect(refinementLabel('running')).toBe('Refining');
    expect(refinementLabel('succeeded')).toBe('Refined');
    expect(refinementLabel('cancelled')).toBe('Cancelled');
    for (const status of [
      'failed',
      'budget_exceeded',
      'timed_out',
      'output_violation',
      'auth_failed',
      'lost',
    ] as const)
      expect(refinementLabel(status)).toBe('Failed');
  });

  it('says Cancelling for one in progress whose cancel was asked for, and nothing else', () => {
    expect(
      refinementStateLabel({ status: 'running', cancelRequested: true })
    ).toBe('Cancelling');
    expect(
      refinementStateLabel({ status: 'cancelled', cancelRequested: true })
    ).toBe('Cancelled');
    expect(
      refinementStateLabel({ status: 'succeeded', cancelRequested: false })
    ).toBe('Refined');
  });
});
