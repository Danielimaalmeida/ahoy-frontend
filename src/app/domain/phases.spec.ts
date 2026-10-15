import { GATE_FOR_PHASE, PHASES, phaseIndex } from './phases';

describe('PHASES', () => {
  it('lists the eight delivery phases in order', () => {
    expect(PHASES).toEqual([
      'intake',
      'planning',
      'plan_review',
      'design',
      'implementation',
      'pr_review',
      'delivery_gate',
      'done',
    ]);
  });
});

describe('phaseIndex', () => {
  const CASES: readonly (readonly [string, number])[] = [
    ['intake', 1],
    ['planning', 2],
    ['plan_review', 3],
    ['design', 4],
    ['implementation', 5],
    ['pr_review', 6],
    ['delivery_gate', 7],
    ['done', 8],
  ];

  for (const [phase, index] of CASES) {
    it(`puts ${phase} at position ${index}`, () => {
      expect(phaseIndex(phase)).toBe(index);
    });
  }

  it('has no position for blocked, whose position comes from the last phase event (G12)', () => {
    expect(phaseIndex('blocked')).toBeNull();
  });

  it('has no position for an unknown phase', () => {
    expect(phaseIndex('nonsense')).toBeNull();
  });
});

describe('GATE_FOR_PHASE', () => {
  it('names the gate of the two human phases (G11)', () => {
    expect(GATE_FOR_PHASE).toEqual({
      plan_review: 'plan_accepted',
      delivery_gate: 'delivery_accepted',
    });
  });
});
