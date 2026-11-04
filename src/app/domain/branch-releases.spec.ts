import {
  branchReleasesStateLabel,
  describeBranchReleaseEvent,
  inputsOf,
  inputsSummary,
  inputsText,
  latestReleaseOf,
  releaseStatusLabel,
  workflowFileOf,
} from './branch-releases';
import { describeSettingsEvent } from './settings';

describe('branchReleasesStateLabel', () => {
  it('counts the repositories, and says when this deployment cannot start a workflow', () => {
    expect(branchReleasesStateLabel(0, true)).toEqual({
      label: 'None',
      off: true,
    });
    expect(branchReleasesStateLabel(1, true)).toEqual({
      label: '1 repository',
      off: false,
    });
    expect(branchReleasesStateLabel(3, true)).toEqual({
      label: '3 repositories',
      off: false,
    });
    expect(branchReleasesStateLabel(3, false)).toEqual({
      label: 'Cannot start',
      off: true,
    });
  });
});

describe('inputsOf and inputsText', () => {
  it('reads one name=value per line, keeping the case of each value, and writes them back by name', () => {
    const read = inputsOf(' update-ops-tag = true \n\nenvironment=TEST\n');
    expect(read).toEqual({
      inputs: { 'update-ops-tag': 'true', environment: 'TEST' },
    });
    expect(inputsText({ 'update-ops-tag': 'true', environment: 'TEST' })).toBe(
      'environment=TEST\nupdate-ops-tag=true'
    );
    expect(inputsOf('')).toEqual({ inputs: {} });
    expect(inputsOf('note=a=b')).toEqual({ inputs: { note: 'a=b' } });
  });

  it('refuses a line without =, a name GitHub does not take, a name twice and too many inputs', () => {
    expect(inputsOf('environment')).toEqual({
      problem: 'Line 1: write name=value.',
    });
    expect(inputsOf('x=1\nbad name=2')).toEqual({
      problem: 'Line 2: “bad name” is not an input name GitHub takes.',
    });
    expect(inputsOf('a=1\na=2')).toEqual({
      problem: 'Line 2: a is given twice.',
    });
    expect(
      inputsOf(Array.from({ length: 26 }, (_, i) => `i${i}=x`).join('\n'))
    ).toEqual({ problem: 'A workflow takes at most 25 inputs.' });
    expect(inputsOf(`a=${'x'.repeat(501)}`)).toEqual({
      problem: 'Line 1: at most 500 characters.',
    });
  });

  it('summarises them on one line', () => {
    expect(inputsSummary({ b: '2', a: '1' })).toBe('a=1 · b=2');
    expect(inputsSummary({})).toBe('no inputs');
  });
});

describe('workflowFileOf', () => {
  it('takes a workflow file by name, with or without its folder', () => {
    expect(workflowFileOf('.github/workflows/branch-release.yaml')).toBe(
      'branch-release.yaml'
    );
    expect(workflowFileOf(' ci.yml ')).toBe('ci.yml');
    for (const typed of ['', 'deploy', 'a/b.yaml', '../x.yaml'])
      expect(workflowFileOf(typed)).toBeUndefined();
  });
});

describe('releaseStatusLabel and latestReleaseOf', () => {
  it('names each status and finds the newest release of a repository', () => {
    expect(releaseStatusLabel('queued')).toBe('Queued');
    expect(releaseStatusLabel('dispatched')).toBe('Started on GitHub');
    expect(releaseStatusLabel('failed')).toBe('Refused by GitHub');
    const releases = [
      { id: '2', repo: 'web' },
      { id: '1', repo: 'web' },
      { id: '0', repo: 'api' },
    ];
    expect(latestReleaseOf(releases, 'web')?.id).toBe('2');
    expect(latestReleaseOf(releases, 'importer')).toBeUndefined();
  });
});

describe('describeBranchReleaseEvent', () => {
  it('says what each change of the section did, through the settings history', () => {
    expect(
      describeSettingsEvent('branch_release_repository.created', {
        repository: 'sflp/r3da_cdm_backend',
        workflow: 'branch-release.yaml',
        inputs: { environment: 'TEST', 'update-ops-tag': 'true' },
      })
    ).toBe(
      'Gave sflp/r3da_cdm_backend the release workflow branch-release.yaml (environment=TEST · update-ops-tag=true)'
    );
    expect(
      describeBranchReleaseEvent('branch_release_repository.updated', {
        repository: 'api',
        changes: { inputs: { environment: { from: 'TEST', to: 'INT' } } },
      })
    ).toBe("Changed api's release workflow: environment: TEST → INT");
    expect(
      describeBranchReleaseEvent('branch_release_repository.deleted', {
        repository: 'api',
      })
    ).toBe("Took api's release workflow away");
    expect(describeBranchReleaseEvent('sonar_server.created', {})).toBe(
      undefined
    );
  });
});
