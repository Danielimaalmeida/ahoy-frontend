import { isPlanPanel } from '@core/api/guards';
import getRunPlanPanel from '@testing/fixtures/getRunPlanPanel.json';
import { panelView } from './plan-panel-view';

/** The fixture's panel, as the API's own type: it is checked by the guard that checks the API's answers. */
function fixturePanel() {
  const fixture: unknown = getRunPlanPanel;
  if (!isPlanPanel(fixture))
    throw new Error('getRunPlanPanel.json is no panel');
  return fixture;
}

const panel = fixturePanel();

describe('panelView', () => {
  const view = panelView(panel);

  it('puts the best draft first and the unrated one last, with the words the card shows', () => {
    expect(view.cards.map((c) => c.label)).toEqual(['A', 'B', 'C']);
    expect(view.cards.map((c) => c.scoreText)).toEqual([
      '8/10',
      '5/10',
      'Not rated',
    ]);
    expect(view.cards.map((c) => c.scoreBar)).toEqual([80, 50, 0]);
  });

  it('marks only the draft with the highest score as best', () => {
    expect(view.cards.map((c) => c.best)).toEqual([true, false, false]);
  });

  it('marks every draft of a tie as best', () => {
    const tied = panelView({
      ...panel,
      members: panel.members.map((m) => ({ ...m, score: 7 })),
    });
    expect(tied.cards.filter((c) => c.best).map((c) => c.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('marks nothing as best when no draft was rated', () => {
    const unrated = panelView({
      ...panel,
      ratingsProblem: 'No ratings.',
      members: panel.members.map((m) => ({ ...m, score: null })),
    });
    expect(unrated.cards.some((c) => c.best)).toBe(false);
  });

  it('says how each planner ended, and keeps the planner that did not finish apart', () => {
    expect(view.cards.map((c) => c.statusLabel)).toEqual([
      'Finished',
      'Finished',
      'Ran out of time',
    ]);
    expect(view.cards.map((c) => c.statusModifier)).toEqual([
      'done',
      'done',
      'halted',
    ]);
    expect(view.unfinished.map((c) => c.label)).toEqual(['C']);
    expect(view.unfinished[0]?.error).toBe(
      "The planner did not finish within its share of the run's time."
    );
    expect(view.unfinished[0]?.questions).toHaveLength(1);
  });

  it("writes each cost in AIU with two decimals, the judge's too, and the effort or the model's default", () => {
    expect(view.cards.map((c) => c.cost)).toEqual([
      '0.41 AIU',
      '0.23 AIU',
      '0.09 AIU',
    ]);
    expect(view.cards.map((c) => c.effort)).toEqual([
      'low',
      'default',
      'default',
    ]);
    expect(view.judge).toEqual({
      model: 'claude-opus-5.5',
      effort: 'high',
      cost: '1.15 AIU',
    });
  });

  it('gives the gate verdict as the API words it, and none for a draft the gate did not check', () => {
    expect(view.cards.map((c) => c.gate?.result ?? null)).toEqual([
      'pass',
      'fail',
      null,
    ]);
  });

  it('gives each card a unique id across panel runs, so two panels can both have a draft A', () => {
    const other = panelView({ ...panel, runId: 'r-09' });
    const ids = [...view.cards, ...other.cards].map((c) => c.id);
    expect(new Set(ids).size).toBe(6);
    expect(view.cards[0]?.id).toBe('r-04/A');
  });

  it('has no judge when none ran, and carries the summary and the ratings problem as written', () => {
    const none = panelView({
      ...panel,
      judge: null,
      summary: null,
      ratingsProblem: 'Why.',
    });
    expect(none.judge).toBeNull();
    expect(none.summary).toBeNull();
    expect(none.ratingsProblem).toBe('Why.');
    expect(view.summary).toContain('Took the work package split of A');
  });

  it('sums the panel up in one line', () => {
    expect(view.line).toBe(
      '2 of 3 planners finished, judged by claude-opus-5.5. Best draft: A, 8/10.'
    );
  });
});
