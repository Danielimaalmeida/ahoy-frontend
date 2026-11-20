import {
  DECISIONS_HEADING,
  appendDecisions,
  decisionsBlock,
} from './follow-up-grill';
import type { GrillPick, GrillQuestionLike } from './story-drafts';

const questions: readonly GrillQuestionLike[] = [
  {
    id: 'Q1',
    text: 'Which invoices?',
    options: [
      { label: 'Every invoice', detail: 'All of them.', recommended: true },
      { label: 'Enterprise only', detail: 'Some.', recommended: false },
    ],
  },
  {
    id: 'Q2',
    text: 'Reissue old ones?',
    options: [
      { label: 'No', detail: 'Leave them.', recommended: true },
      { label: 'Yes', detail: 'Fix them.', recommended: false },
    ],
  },
  {
    id: 'Q3',
    text: 'Any deadline?',
    options: [
      { label: 'No', detail: 'None.', recommended: true },
      { label: 'Yes', detail: 'There is.', recommended: false },
    ],
  },
];

describe('decisionsBlock', () => {
  it('lists the options chosen, own words and what was left open, in the questions order', () => {
    const picks = new Map<string, GrillPick>([
      ['Q3', { choice: 'own', text: '  Before the audit.  ' }],
      ['Q1', { choice: 'option', option: 1 }],
      ['Q2', { choice: 'open' }],
    ]);
    expect(decisionsBlock(questions, picks).split('\n')).toEqual([
      DECISIONS_HEADING,
      '- Which invoices? Enterprise only',
      '- Reissue old ones? Not decided yet; the crew should treat it as open.',
      '- Any deadline? Before the audit.',
    ]);
  });

  it('skips questions with no usable pick, and is empty when none has one', () => {
    const picks = new Map<string, GrillPick>([
      ['Q1', { choice: 'option', option: 9 }],
      ['Q2', { choice: 'own', text: '   ' }],
    ]);
    expect(decisionsBlock(questions, picks)).toBe('');
  });
});

describe('appendDecisions', () => {
  it('puts the block after the brief with a blank line, or alone for an empty brief', () => {
    expect(appendDecisions('Totals are wrong.\n\n', 'Block')).toBe(
      'Totals are wrong.\n\nBlock'
    );
    expect(appendDecisions('  ', 'Block')).toBe('Block');
  });

  it('leaves the brief alone when there is nothing to add', () => {
    expect(appendDecisions('Totals are wrong.\n', '')).toBe(
      'Totals are wrong.\n'
    );
  });
});
