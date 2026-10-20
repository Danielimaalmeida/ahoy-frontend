import {
  anyDrafting,
  chosenNoteIds,
  draftChip,
  firstUnanswered,
  grillAnswerBodies,
  grillProgress,
  isProjectKey,
  latestDraftByTopic,
  normaliseProjectKey,
  notesCount,
  optionLetter,
  pickComplete,
  pickSummary,
  storySentence,
  targetText,
  type DraftLike,
  type GrillPick,
  type GrillQuestionLike,
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
      ['drafting', 'asking', 'ready', 'failed', 'created'].map((s) =>
        draftChip(s as DraftLike['status'])
      )
    ).toEqual([
      'Writing the story…',
      'Questions to answer',
      'Story ready to check',
      'Story not written',
      'In Jira',
    ]);
    expect(draftChip('drafting', true)).toBe('Finding questions…');
  });

  it('does not keep reading while a grill waits for answers', () => {
    expect(anyDrafting([draft('a', 't', 'asking', 'x')])).toBe(false);
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

  describe('a grill', () => {
    const questions: GrillQuestionLike[] = [
      {
        id: 'Q1',
        text: 'Who approves each fee?',
        options: [
          { label: 'Finance', detail: 'Fewer disputes.', recommended: true },
          {
            label: 'Nobody',
            detail: 'Added automatically.',
            recommended: false,
          },
        ],
      },
      {
        id: 'Q2',
        text: 'When does the fee start?',
        options: [
          {
            label: '30 days late',
            detail: 'Matches the reminders.',
            recommended: true,
          },
          { label: 'On the due date', detail: 'Stricter.', recommended: false },
        ],
      },
      {
        id: 'Q3',
        text: 'Which currency?',
        options: [
          { label: 'EUR', detail: 'Only euros.', recommended: true },
          { label: 'Any', detail: 'The invoice currency.', recommended: false },
        ],
      },
    ];
    const q1 = questions[0]!;

    it('letters the options A, B, C', () => {
      expect([0, 1, 2].map(optionLetter)).toEqual(['A', 'B', 'C']);
    });

    it('takes an option the question offers, an open answer, or own words that are not blank', () => {
      expect(pickComplete(q1, { choice: 'option', option: 1 })).toBe(true);
      expect(pickComplete(q1, { choice: 'option', option: 2 })).toBe(false);
      expect(pickComplete(q1, { choice: 'open' })).toBe(true);
      expect(pickComplete(q1, { choice: 'own', text: '  ' })).toBe(false);
      expect(pickComplete(q1, { choice: 'own', text: 'x'.repeat(2001) })).toBe(
        false
      );
      expect(
        pickComplete(q1, { choice: 'own', text: ' Finance, over 500 EUR ' })
      ).toBe(true);
    });

    it('sums up each answer in a few words', () => {
      expect(pickSummary(q1, { choice: 'option', option: 0 })).toBe('Finance');
      expect(pickSummary(q1, { choice: 'open' })).toBe(
        'Left open in the story'
      );
      expect(
        pickSummary(q1, { choice: 'own', text: ' Finance, over 500 EUR ' })
      ).toBe('Finance, over 500 EUR');
    });

    it('sends the answers in the order asked, trimmed, and leaves out questions not answered', () => {
      const picks = new Map<string, GrillPick>([
        ['Q3', { choice: 'own', text: ' Any currency ' }],
        ['Q1', { choice: 'option', option: 1 }],
        ['Q2', { choice: 'own', text: '   ' }],
      ]);
      expect(grillAnswerBodies(questions, picks)).toEqual([
        { questionId: 'Q1', choice: 'option', option: 1 },
        { questionId: 'Q3', choice: 'own', text: 'Any currency' },
      ]);
      expect(
        grillAnswerBodies(questions, new Map([['Q2', { choice: 'open' }]]))
      ).toEqual([{ questionId: 'Q2', choice: 'open' }]);
    });

    it('starts at the first question not yet answered, and stays on the last once all are', () => {
      expect(firstUnanswered(questions, new Map())).toBe(0);
      expect(
        firstUnanswered(questions, new Map([['Q1', { choice: 'open' }]]))
      ).toBe(1);
      const all = new Map<string, GrillPick>(
        questions.map((q) => [q.id, { choice: 'open' }])
      );
      expect(firstUnanswered(questions, all)).toBe(2);
      expect(firstUnanswered([], new Map())).toBe(0);
    });

    it('counts the questions from one', () => {
      expect(grillProgress(2, 4)).toBe('Question 3 of 4');
    });
  });
});
