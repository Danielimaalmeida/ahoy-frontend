import {
  checkFollowUp,
  parseCriteria,
  type FollowUpInput,
} from './follow-up-input';

const input: FollowUpInput = {
  source: 'ahoy',
  issueType: 'Bug',
  jiraKey: '',
  title: '',
  text: 'The export drops the last row.',
  criteria: 'Last row is exported',
  route: 'planning',
  repo: '',
  budget: '30',
};

describe('parseCriteria', () => {
  it('takes one criterion per line, trimmed, without the empty lines', () => {
    expect(parseCriteria(' A \n\n  B\n   \nC')).toEqual(['A', 'B', 'C']);
    expect(parseCriteria('')).toEqual([]);
  });
});

describe('checkFollowUp', () => {
  it('accepts a complete Ahoy-only follow-up', () => {
    expect(checkFollowUp(input)).toEqual({});
  });

  it('needs the text and a criterion for an Ahoy-only follow-up, but not for a Jira one', () => {
    const empty = { ...input, text: ' ', criteria: '' };
    expect(Object.keys(checkFollowUp(empty)).sort()).toEqual([
      'criteria',
      'text',
    ]);
    expect(
      checkFollowUp({ ...empty, source: 'jira', jiraKey: 'PROJ-9' })
    ).toEqual({});
  });

  it('needs a title, the text and a criterion to create the Jira issue', () => {
    const create = { ...input, source: 'create' } as const;
    expect(checkFollowUp({ ...create, title: 'Export drops a row' })).toEqual(
      {}
    );
    expect(Object.keys(checkFollowUp(create))).toEqual(['title']);
    expect(
      Object.keys(
        checkFollowUp({ ...create, title: 'T', text: '', criteria: '' })
      ).sort()
    ).toEqual(['criteria', 'text']);
  });

  it('takes a Jira key, never a follow-up key', () => {
    const jira = { ...input, source: 'jira' } as const;
    expect(checkFollowUp({ ...jira, jiraKey: ' PROJ-12 ' })).toEqual({});
    expect(
      Object.keys(checkFollowUp({ ...jira, jiraKey: 'PROJ-12-FU1' }))
    ).toEqual(['jiraKey']);
    expect(Object.keys(checkFollowUp({ ...jira, jiraKey: '' }))).toEqual([
      'jiraKey',
    ]);
  });

  it('keeps to the limits of the brief', () => {
    expect(checkFollowUp({ ...input, text: 'x'.repeat(8001) }).text).toContain(
      '8000'
    );
    expect(
      checkFollowUp({ ...input, criteria: Array(31).fill('c').join('\n') })
        .criteria
    ).toContain('30');
    expect(
      checkFollowUp({ ...input, criteria: 'c'.repeat(1001) }).criteria
    ).toContain('1000');
  });

  it('needs a repository on the fast path and an amount of AIU as the budget', () => {
    expect(checkFollowUp({ ...input, route: 'fast_path' }).repo).toBeDefined();
    expect(
      checkFollowUp({ ...input, route: 'fast_path', repo: 'api' })
    ).toEqual({});
    expect(checkFollowUp({ ...input, budget: '' }).budget).toBeDefined();
    expect(checkFollowUp({ ...input, budget: 'lots' }).budget).toBeDefined();
    expect(checkFollowUp({ ...input, budget: '0' }).budget).toBeDefined();
  });
});
