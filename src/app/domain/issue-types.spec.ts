import { isDefectType } from './issue-types';

describe('isDefectType', () => {
  it('reads Bug, Defect and Defeito as a defect, whatever their case or spaces', () => {
    for (const type of ['Bug', 'Defect', 'defeito', ' BUG '])
      expect(isDefectType(type)).toBe(true);
  });

  it('reads Story, Task and anything else as not a defect', () => {
    for (const type of ['Story', 'Task', 'Bugfix', ''])
      expect(isDefectType(type)).toBe(false);
  });

  it('reads an unknown type, before intake or from an older server, as not a defect', () => {
    expect(isDefectType(null)).toBe(false);
    expect(isDefectType(undefined)).toBe(false);
  });
});
