import {
  GATE_FOR_PHASE,
  PHASES,
  phaseIndex,
  phaseLabel,
  phasePosition,
} from './phases';

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

describe('phaseLabel', () => {
  it('names every delivery phase in words', () => {
    expect(PHASES.map(phaseLabel)).toEqual([
      'Intake',
      'Planning',
      'Plan review',
      'Design',
      'Implementation',
      'PR review',
      'Delivery gate',
      'Done',
    ]);
  });

  it('names blocked', () => {
    expect(phaseLabel('blocked')).toBe('Blocked');
  });

  it('shows an unknown phase as the API sent it', () => {
    expect(phaseLabel('sea_trials')).toBe('sea_trials');
  });

  it('does not read a phase from the object prototype', () => {
    expect(phaseLabel('toString')).toBe('toString');
  });
});

describe('phasePosition', () => {
  it('says where a delivery phase is among the eight', () => {
    expect(phasePosition('delivery_gate')).toBe('Phase 7 of 8');
    expect(phasePosition('intake')).toBe('Phase 1 of 8');
  });

  it('has no position for blocked or an unknown phase', () => {
    expect(phasePosition('blocked')).toBeNull();
    expect(phasePosition('sea_trials')).toBeNull();
  });
});
