import {
  anyDrafting,
  chosenNoteIds,
  draftChip,
  isProjectKey,
  latestDraftByTopic,
  normaliseProjectKey,
  notesCount,
  storySentence,
  targetText,
  type DraftLike,
} from './story-drafts';

const draft = (
  id: string,
  topicId: string,
  status: DraftLike['status'],
  createdAt: string
): DraftLike => ({
  id,
  topicId,
  status,
  createdAt,
});

describe('story drafts', () => {
  it('shows each topic its newest draft', () => {
    const latest = latestDraftByTopic([
      draft('a', 't1', 'failed', '2026-10-15T09:00:00.000Z'),
      draft('b', 't1', 'ready', '2026-10-15T09:05:00.000Z'),
      draft('c', 't2', 'drafting', '2026-10-15T09:01:00.000Z'),
    ]);
    expect(latest.get('t1')?.id).toBe('b');
    expect(latest.get('t2')?.id).toBe('c');
    expect(latest.size).toBe(2);
  });

  it('keeps reading while a draft is being written, and stops once none is', () => {
    expect(
      anyDrafting([
        draft('a', 't', 'ready', 'x'),
        draft('b', 'u', 'drafting', 'x'),
      ])
    ).toBe(true);
    expect(
      anyDrafting([
        draft('a', 't', 'ready', 'x'),
        draft('b', 'u', 'created', 'x'),
      ])
    ).toBe(false);
    expect(anyDrafting([])).toBe(false);
  });

  it('labels each state of a draft in plain words', () => {
    expect(
      ['drafting', 'ready', 'failed', 'created'].map((s) =>
        draftChip(s as DraftLike['status'])
      )
    ).toEqual([
      'Writing the story…',
      'Story ready to check',
      'Story not written',
      'In Jira',
    ]);
  });

  it('writes the story as one sentence without doubled full stops', () => {
    expect(
      storySentence({
        role: 'a finance user',
        want: 'overdue invoices to carry a late fee.',
        soThat: ' customers pay on time. ',
      })
    ).toBe(
      'As a finance user, I want overdue invoices to carry a late fee, so that customers pay on time.'
    );
  });

  it('names the Jira target, or none when the series has no project', () => {
    expect(targetText({ projectKey: 'FIN', issueType: 'Task' })).toBe(
      'FIN · Task'
    );
    expect(targetText({ projectKey: 'FIN', issueType: null })).toBe(
      'FIN · Story'
    );
    expect(targetText({ projectKey: null, issueType: null })).toBeNull();
  });

  it('takes a project key in capitals and refuses one Jira would not have', () => {
    expect(normaliseProjectKey('  fin ')).toBe('FIN');
    expect(isProjectKey('FIN')).toBe(true);
    expect(isProjectKey('FIN_OPS2')).toBe(true);
    expect(isProjectKey('F')).toBe(false);
    expect(isProjectKey('2FIN')).toBe(false);
    expect(isProjectKey('FIN-1')).toBe(false);
    expect(isProjectKey('A'.repeat(51))).toBe(false);
  });

  it('counts notes in words', () => {
    expect([0, 1, 3].map(notesCount)).toEqual([
      'no notes',
      '1 note',
      '3 notes',
    ]);
  });

  it('sends no note ids when every note is ticked, else the ticked ones in order', () => {
    expect(chosenNoteIds(['a', 'b', 'c'], new Set(['c', 'a', 'b']))).toEqual(
      []
    );
    expect(chosenNoteIds(['a', 'b', 'c'], new Set(['c', 'a']))).toEqual([
      'a',
      'c',
    ]);
    expect(chosenNoteIds([], new Set())).toEqual([]);
  });

  it('refuses a choice of no notes when the topic has some, since the API reads it as all of them', () => {
    expect(chosenNoteIds(['a', 'b'], new Set())).toBeNull();
  });
});
