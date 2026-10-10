import type { Diagnosis, DiagnosisFinding } from '@core/api/types';
import { DIAGNOSIS_ACTORS } from '@core/api/types';
import { DIAGNOSIS_ACTOR_LABELS, shownFindings } from './halt-diagnosis';

function finding(kind: DiagnosisFinding['kind']): DiagnosisFinding {
  return {
    kind,
    title: 'A cause.',
    evidence: [],
    action: 'Fix it.',
    actor: 'story_owner',
    resumable: true,
    runId: null,
  };
}

const diagnosis = (findings: DiagnosisFinding[]): Diagnosis => ({
  key: 'PROJ-1',
  status: 'halted',
  phase: 'planning',
  haltReason: 'run_failed',
  findings,
});

describe('shownFindings', () => {
  it('shows every finding of a diagnosis that explains something', () => {
    const findings = [finding('cluster_capacity'), finding('run_lost')];
    expect(shownFindings(diagnosis(findings))).toEqual(findings);
  });

  it("shows nothing for a person's stop alone, which the banner already says, nor before the diagnosis is read", () => {
    expect(shownFindings(diagnosis([finding('stopped_by_user')]))).toEqual([]);
    expect(shownFindings(null)).toEqual([]);
  });
});

describe('DIAGNOSIS_ACTOR_LABELS', () => {
  it('has words for every actor of the contract', () => {
    expect(Object.keys(DIAGNOSIS_ACTOR_LABELS).sort()).toEqual(
      [...DIAGNOSIS_ACTORS].sort()
    );
  });
});
