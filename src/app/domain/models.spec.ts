import {
  CREW,
  EFFORT_SOURCE_LABELS,
  MODEL_SLOTS,
  MODEL_SOURCE_LABELS,
  crewLabel,
} from './models';
import type { ModelSlot } from './types';

describe('MODEL_SLOTS', () => {
  it('lists the four slots in table order', () => {
    expect(MODEL_SLOTS).toEqual([
      'intake',
      'planning',
      'implementation',
      'review',
    ]);
  });
});

describe('CREW', () => {
  const CASES: readonly (readonly [ModelSlot, string])[] = [
    ['intake', 'Navigator'],
    ['planning', 'Cartographer'],
    ['implementation', 'Implementer'],
    ['review', 'Lookout'],
  ];

  for (const [slotName, crew] of CASES) {
    it(`shows ${crew} for ${slotName}`, () => {
      expect(CREW[slotName]).toBe(crew);
    });
  }
});

describe('MODEL_SOURCE_LABELS', () => {
  it('uses the vocabulary tags', () => {
    expect(MODEL_SOURCE_LABELS).toEqual({
      revision: 'This revision only',
      story: 'Chosen for this voyage',
      configuration: 'Server default',
      phase_table: 'Agent config',
      agent_profile: "Agent's own",
    });
  });
});

describe('EFFORT_SOURCE_LABELS', () => {
  it("has exactly the contract's effort sources: no agent_profile", () => {
    expect(Object.keys(EFFORT_SOURCE_LABELS).sort()).toEqual([
      'configuration',
      'model_default',
      'phase_table',
      'revision',
      'story',
    ]);
  });

  it("keeps the model sources and adds the model's own default", () => {
    expect(EFFORT_SOURCE_LABELS['model_default']).toBe("Model's own");
    expect(EFFORT_SOURCE_LABELS['configuration']).toBe('Server default');
    expect(EFFORT_SOURCE_LABELS['story']).toBe('Chosen for this voyage');
  });
});

describe('crewLabel', () => {
  it('names the crew member of a slot', () => {
    expect(crewLabel('review')).toBe('Lookout');
  });

  it('falls back to the free-text agent from the API (G14)', () => {
    expect(crewLabel('some_phase', 'Cartographer')).toBe('Cartographer');
  });

  it('trims the API text and falls back to the slot name when it is empty', () => {
    expect(crewLabel('some_phase', '  Navigator  ')).toBe('Navigator');
    expect(crewLabel('some_phase', '   ')).toBe('some_phase');
    expect(crewLabel('some_phase')).toBe('some_phase');
  });
});
