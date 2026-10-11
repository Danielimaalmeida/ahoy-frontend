import {
  DIAGNOSIS_ACTOR_LABELS,
  diagnosisLine,
  shownFindings,
  type FindingSummary,
} from './diagnosis';

const finding = (
  kind: FindingSummary['kind'],
  title = 'A cause.',
  actor: FindingSummary['actor'] = 'operator'
): FindingSummary => ({ kind, title, actor });

describe('shownFindings', () => {
  it('shows every finding of a diagnosis that explains something', () => {
    const findings = [finding('cluster_capacity'), finding('run_lost')];
    expect(shownFindings(findings)).toEqual(findings);
  });

  it("shows nothing for a person's stop alone, which the screens already say", () => {
    expect(shownFindings([finding('stopped_by_user')])).toEqual([]);
    expect(shownFindings([])).toEqual([]);
  });
});

describe('diagnosisLine', () => {
  it('names the first cause and who acts on it', () => {
    expect(
      diagnosisLine([
        finding(
          'copilot_auth',
          "Copilot did not accept the worker's token, so the agent never started."
        ),
      ])
    ).toBe(
      "Copilot did not accept the worker's token, so the agent never started. · For the Ahoy operators"
    );
  });

  it('counts the other causes rather than listing them', () => {
    expect(
      diagnosisLine([
        finding('cluster_capacity', 'No node.', 'operator'),
        finding('run_lost', 'Lost.', 'story_owner'),
        finding('other', 'Else.', 'story_owner'),
      ])
    ).toBe('No node. · For the Ahoy operators (+2 more)');
  });

  it("is null when there is nothing to show, or only a person's stop", () => {
    expect(diagnosisLine([])).toBeNull();
    expect(diagnosisLine([finding('stopped_by_user')])).toBeNull();
  });

  it('has words for every actor', () => {
    expect(Object.keys(DIAGNOSIS_ACTOR_LABELS).sort()).toEqual([
      'agent_maintainer',
      'operator',
      'story_owner',
    ]);
  });
});
