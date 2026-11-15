import {
  canReproduce,
  canTryToFix,
  defectStartLine,
  defectTriageView,
  defectsLabel,
  reproductionInProgress,
  reproductionView,
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

describe('reproductionView', () => {
  const ended = (
    verdict: 'reproduced' | 'not_reproduced' | 'inconclusive',
    why: string,
    current = true
  ) => ({
    status: 'succeeded',
    environment: 'TEST',
    current,
    result: { verdict, why },
  });

  it('says nothing of a defect that was never reproduced', () => {
    expect(reproductionView(null)).toBeNull();
  });

  it('says Reproducing… while the run is queued or running, and where', () => {
    const run = { environment: 'TEST', current: true, result: null };
    expect(reproductionView({ ...run, status: 'queued' })).toEqual({
      label: 'Reproducing…',
      tone: 'busy',
      detail: 'On TEST, queued',
    });
    expect(reproductionView({ ...run, status: 'running' })).toEqual({
      label: 'Reproducing…',
      tone: 'busy',
      detail: 'On TEST',
    });
  });

  it('says the verdict, where and why', () => {
    expect(
      reproductionView(ended('reproduced', ' The export has 2 rows of 3. '))
    ).toEqual({
      label: 'Reproduced',
      tone: 'reproduced',
      detail: 'On TEST: The export has 2 rows of 3.',
    });
    expect(
      reproductionView(ended('not_reproduced', 'The export has all 3 rows.'))
    ).toEqual({
      label: 'Not reproduced',
      tone: 'not_reproduced',
      detail: 'On TEST: The export has all 3 rows.',
    });
    expect(reproductionView(ended('inconclusive', ''))).toEqual({
      label: 'Inconclusive',
      tone: 'inconclusive',
      detail: 'On TEST',
    });
  });

  it('says a verdict is for an older version of the defect', () => {
    expect(
      reproductionView(ended('reproduced', 'The export has 2 rows.', false))
    ).toEqual({
      label: 'Reproduced',
      tone: 'reproduced',
      detail:
        'On TEST: The export has 2 rows. · The defect changed in Jira since.',
    });
  });
});

describe('canReproduce', () => {
  const base = {
    key: 'PROJ-212',
    started: null,
    startError: null,
    voyage: null,
    ignored: null,
    reproduction: null,
  };

  it('lets a person reproduce a defect with no voyage that nobody ignored, again once a run ended', () => {
    expect(canReproduce(base)).toBe(true);
    expect(canReproduce({ ...base, reproduction: { status: 'failed' } })).toBe(
      true
    );
    expect(canReproduce({ ...base, key: 'MY_APP-12' })).toBe(true);
  });

  it('does not offer it while a run is queued or running, on a voyage or once ignored', () => {
    for (const status of ['queued', 'running']) {
      expect(reproductionInProgress({ status }), status).toBe(true);
      expect(canReproduce({ ...base, reproduction: { status } }), status).toBe(
        false
      );
    }
    expect(reproductionInProgress(null)).toBe(false);
    expect(canReproduce({ ...base, voyage: { status: 'ready' } })).toBe(false);
    expect(canReproduce({ ...base, ignored: { by: 'sam' } })).toBe(false);
  });
});
