import {
  PANELIST_STATUSES,
  PANELIST_STATUS_LABELS,
  bestMembers,
  catalogModelLabel,
  formatAverageScore,
  formatGateRatio,
  formatScore,
  formatScoreRange,
  judgeModelsLine,
  panelSummaryLine,
  panelistStatusModifier,
  rankMembers,
  scoreBarPercent,
  unfinishedMembers,
  type PanelMemberView,
  type PanelView,
} from './plan-panel';

function member(
  label: string,
  score: number | null,
  status: PanelMemberView['status'] = 'completed'
): PanelMemberView {
  return { label, model: `model-${label.toLowerCase()}`, status, score };
}

describe('formatScore', () => {
  it('writes a score out of ten, and says when there is none', () => {
    expect(formatScore(8)).toBe('8/10');
    expect(formatScore(10)).toBe('10/10');
    expect(formatScore(null)).toBe('Not rated');
  });
});

describe('scoreBarPercent', () => {
  it('fills a tenth of the bar for each point, and none for a draft that was not rated', () => {
    expect(scoreBarPercent(1)).toBe(10);
    expect(scoreBarPercent(7)).toBe(70);
    expect(scoreBarPercent(10)).toBe(100);
    expect(scoreBarPercent(null)).toBe(0);
  });

  it('never leaves the bar, whatever a newer API sends', () => {
    expect(scoreBarPercent(14)).toBe(100);
    expect(scoreBarPercent(-3)).toBe(0);
  });
});

describe('rankMembers', () => {
  it('puts the best draft first and the unrated ones last, with equal scores in label order', () => {
    const ranked = rankMembers([
      member('A', 6),
      member('B', null),
      member('C', 9),
      member('D', 6),
    ]);
    expect(ranked.map((m) => m.label)).toEqual(['C', 'A', 'D', 'B']);
  });

  it('does not reorder the list it is given', () => {
    const members = [member('A', 3), member('B', 9)];
    rankMembers(members);
    expect(members.map((m) => m.label)).toEqual(['A', 'B']);
  });
});

describe('bestMembers', () => {
  it('gives the drafts with the highest score, ties included', () => {
    expect(
      bestMembers([member('A', 8), member('B', 8), member('C', 5)]).map(
        (m) => m.label
      )
    ).toEqual(['A', 'B']);
  });

  it('gives none when no draft was rated', () => {
    expect(bestMembers([member('A', null), member('B', null)])).toEqual([]);
    expect(bestMembers([])).toEqual([]);
  });
});

describe('unfinishedMembers', () => {
  it('gives the planners whose session did not end completed', () => {
    const found = unfinishedMembers([
      member('A', 7),
      member('B', null, 'timed_out'),
      member('C', null, 'failed'),
    ]);
    expect(found.map((m) => m.label)).toEqual(['B', 'C']);
  });
});

describe('panelistStatusModifier', () => {
  it('colours a finished draft as done and every other end as halted, and has words for all of them', () => {
    expect(panelistStatusModifier('completed')).toBe('done');
    for (const status of PANELIST_STATUSES.filter((s) => s !== 'completed'))
      expect(panelistStatusModifier(status)).toBe('halted');
    expect(Object.keys(PANELIST_STATUS_LABELS).sort()).toEqual(
      [...PANELIST_STATUSES].sort()
    );
  });
});

describe('panelSummaryLine', () => {
  const rated: PanelView = {
    judge: { model: 'claude-opus-5.5' },
    ratingsProblem: null,
    members: [member('A', 8), member('B', 6), member('C', 7)],
  };

  it('names the judge and the best draft', () => {
    expect(panelSummaryLine(rated)).toBe(
      '3 of 3 planners finished, judged by claude-opus-5.5. Best draft: A, 8/10.'
    );
  });

  it('names every draft of a tie', () => {
    const tied = {
      ...rated,
      members: [member('A', 8), member('B', 8), member('C', 2)],
    };
    expect(panelSummaryLine(tied)).toContain('Best draft: A and B, 8/10.');
  });

  it("shows the model the way the page's name function says", () => {
    expect(
      panelSummaryLine(rated, (id) => (id === 'claude-opus-5.5' ? 'Opus' : id))
    ).toContain('judged by Opus.');
  });

  it('counts the planners that did not finish', () => {
    const partial = {
      ...rated,
      members: [member('A', 8), member('B', null, 'timed_out')],
    };
    expect(panelSummaryLine(partial)).toContain('1 of 2 planners finished');
  });

  it('says that the ratings could not be used rather than naming a best draft', () => {
    const line = panelSummaryLine({
      ...rated,
      ratingsProblem: 'The judge wrote no ratings.',
      members: [member('A', null), member('B', null)],
    });
    expect(line).toBe(
      '2 of 2 planners finished, judged by claude-opus-5.5. The ratings could not be used.'
    );
  });

  it('says that no judge ran when no planner finished', () => {
    expect(
      panelSummaryLine({
        judge: null,
        ratingsProblem: null,
        members: [member('A', null, 'failed')],
      })
    ).toBe('0 of 1 planner finished, so no judge ran.');
  });

  it('says that nothing was rated when the judge rated nothing and gave no reason', () => {
    expect(
      panelSummaryLine({ ...rated, members: [member('A', null)] })
    ).toContain('No draft was rated.');
  });
});

describe('the ratings table words', () => {
  it('writes an average with one decimal and a dash for none', () => {
    expect(formatAverageScore(7.25)).toBe('7.3');
    expect(formatAverageScore(8)).toBe('8.0');
    expect(formatAverageScore(null)).toBe('—');
  });

  it('writes the lowest and highest score as a range', () => {
    expect(formatScoreRange(6, 9)).toBe('6–9');
    expect(formatScoreRange(7, 7)).toBe('7');
    expect(formatScoreRange(null, null)).toBe('—');
  });

  it('writes the plan gate as passed of checked, and a dash when it checked none', () => {
    expect(formatGateRatio(2, 3)).toBe('2/3');
    expect(formatGateRatio(0, 0)).toBe('—');
  });
});

describe('catalogModelLabel', () => {
  const models = [{ id: 'claude-haiku-5.5', label: 'Claude Haiku 5.5' }];

  it("uses the catalogue's label for a model it lists", () => {
    expect(catalogModelLabel(models, 'claude-haiku-5.5')).toBe(
      'Claude Haiku 5.5'
    );
  });

  it('falls back to the id for a model it does not list', () => {
    expect(catalogModelLabel(models, 'gpt-6-luna')).toBe('gpt-6-luna');
    expect(catalogModelLabel([], 'gpt-6-luna')).toBe('gpt-6-luna');
  });
});

describe('judgeModelsLine', () => {
  it('names the one model, or the first with the ones the judge falls back to', () => {
    expect(judgeModelsLine(['Claude Opus 5.5'])).toBe('Claude Opus 5.5');
    expect(judgeModelsLine(['Claude Opus 5.5', 'Claude Sonnet 5.5'])).toBe(
      'Claude Opus 5.5, or Claude Sonnet 5.5 if your Copilot account may not use it'
    );
    expect(judgeModelsLine(['A', 'B', 'C'])).toBe(
      'A, or B or C if your Copilot account may not use it'
    );
  });

  it('shows a dash when there is no judge model', () => {
    expect(judgeModelsLine([])).toBe('—');
  });
});
