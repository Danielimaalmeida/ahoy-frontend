import {
  DEFAULT_PLANNING_MODE,
  PLANNING_MODES,
  PLANNING_MODE_LABELS,
  isPlanningMode,
  planningModeChoices,
  planningModeOf,
  plannersLabel,
} from './planning-mode';

describe('planningModeOf', () => {
  it('reads an absent mode as standard, since a server older than the plan panel sends none', () => {
    expect(planningModeOf({})).toBe('standard');
    expect(DEFAULT_PLANNING_MODE).toBe('standard');
  });

  it('keeps the mode the story has', () => {
    expect(planningModeOf({ planningMode: 'panel' })).toBe('panel');
    expect(planningModeOf({ planningMode: 'standard' })).toBe('standard');
  });
});

describe('isPlanningMode', () => {
  it('accepts exactly the two modes of the contract', () => {
    expect(PLANNING_MODES).toEqual(['standard', 'panel']);
    expect(PLANNING_MODES.every(isPlanningMode)).toBe(true);
    for (const value of ['Panel', '', 'single', null, undefined, 2])
      expect(isPlanningMode(value)).toBe(false);
  });

  it('has a label for every mode', () => {
    expect(Object.keys(PLANNING_MODE_LABELS).sort()).toEqual(
      [...PLANNING_MODES].sort()
    );
  });
});

describe('plannersLabel', () => {
  it('says the planners in words, and several while their number is not known', () => {
    expect(plannersLabel(3)).toBe('Three planners');
    expect(plannersLabel(2)).toBe('Two planners');
    expect(plannersLabel(7)).toBe('7 planners');
    expect(plannersLabel(null)).toBe('Several planners');
  });
});

describe('planningModeChoices', () => {
  it('offers standard first, then the panel with its planners and its cost', () => {
    const [standard, panel] = planningModeChoices(3);
    expect(standard?.value).toBe('standard');
    expect(standard?.title).toBe('Standard · one planner');
    expect(panel?.value).toBe('panel');
    expect(panel?.title).toBe('Panel · three planners and a judge');
    expect(panel?.description).toContain('costs more AIU');
    expect(panel?.description).toContain('rates every draft from 1 to 10');
  });

  it('does not invent a number of planners before the catalogue is read', () => {
    expect(planningModeChoices(null)[1]?.title).toBe(
      'Panel · several planners and a judge'
    );
  });
});
