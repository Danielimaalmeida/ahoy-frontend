import { defectTriageView, defectsLabel } from './defects';

describe('defectTriageView', () => {
  const at = (
    triage: 'can_try' | 'out',
    reasons: string[],
    ignored: {
      by: string;
      byName: string | null;
      reason: string | null;
    } | null = null
  ) => ({ triage, reasons, ignored });

  it('says Ahoy can try, with what made the defect fit', () => {
    expect(
      defectTriageView(at('can_try', ['1 repository', 'steps to reproduce']))
    ).toEqual({
      label: 'Ahoy can try',
      tone: 'fit',
      detail: '1 repository · steps to reproduce',
    });
  });

  it('says Not for Ahoy, with every rule the defect failed', () => {
    expect(
      defectTriageView(at('out', ['No component', 'No priority']))
    ).toEqual({
      label: 'Not for Ahoy',
      tone: 'out',
      detail: 'No component; No priority',
    });
  });

  it('says who ignored it, and why when they said, whatever the triage', () => {
    const sam = { by: 'sam@example.com', byName: 'Sam Example', reason: null };
    expect(defectTriageView(at('can_try', [], sam))).toEqual({
      label: 'Ignored',
      tone: 'ignored',
      detail: 'by Sam Example',
    });
    expect(
      defectTriageView(
        at('out', [], {
          ...sam,
          byName: null,
          reason: 'copy is being rewritten',
        })
      ).detail
    ).toBe('by sam@example.com: copy is being rewritten');
  });
});

describe('defectsLabel', () => {
  it('counts defects', () => {
    expect(defectsLabel(1)).toBe('1 defect');
    expect(defectsLabel(0)).toBe('0 defects');
  });
});
