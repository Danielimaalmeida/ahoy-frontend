import {
  canTryToFix,
  defectStartLine,
  defectTriageView,
  defectsLabel,
} from './defects';

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
      defectTriageView(at('can_try', ['steps to reproduce', 'expected result']))
    ).toEqual({
      label: 'Ahoy can try',
      tone: 'fit',
      detail: 'steps to reproduce · expected result',
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

describe('defectStartLine', () => {
  const base = {
    key: 'PROJ-212',
    started: null,
    startError: null,
    voyage: null,
    ignored: null,
  };

  it('says the watch or a person started the voyage', () => {
    expect(
      defectStartLine({
        ...base,
        started: { by: 'ahoy-defect-watch', byName: null },
      })
    ).toEqual({ text: 'Started by Ahoy', failed: false });
    expect(
      defectStartLine({
        ...base,
        started: { by: 'sam@example.com', byName: 'Sam Example' },
      })?.text
    ).toBe('Started by Sam Example');
  });

  it('says why the watch could not start it, until a voyage exists', () => {
    expect(defectStartLine({ ...base, startError: 'no such ref' })).toEqual({
      text: 'Ahoy could not start it: no such ref',
      failed: true,
    });
    expect(
      defectStartLine({ ...base, startError: 'x', voyage: { status: 'ready' } })
    ).toBeNull();
    expect(defectStartLine(base)).toBeNull();
  });

  it('says nothing of a refused start once someone ignored the defect', () => {
    expect(
      defectStartLine({ ...base, startError: 'x', ignored: { by: 'sam' } })
    ).toBeNull();
  });
});

describe('canTryToFix', () => {
  it('lets a person try a defect with no voyage that nobody ignored', () => {
    const base = {
      key: 'PROJ-212',
      started: null,
      startError: null,
      voyage: null,
      ignored: null,
    };
    expect(canTryToFix(base)).toBe(true);
    expect(canTryToFix({ ...base, voyage: { status: 'ready' } })).toBe(false);
    expect(canTryToFix({ ...base, ignored: { by: 'sam' } })).toBe(false);
  });

  it("does not offer a defect whose key cannot be a voyage's", () => {
    const base = {
      started: null,
      startError: null,
      voyage: null,
      ignored: null,
    };
    expect(canTryToFix({ ...base, key: 'A_B-12' })).toBe(false);
    expect(canTryToFix({ ...base, key: 'X-1' })).toBe(false);
    expect(canTryToFix({ ...base, key: `PROJ-${'1'.repeat(40)}` })).toBe(false);
  });
});
