import {
  planFitPresentation,
  readinessPresentation,
  readinessSummary,
} from './harness-fit';

describe('harness fit', () => {
  it('words and tones each readiness verdict', () => {
    expect(readinessPresentation('ready')).toEqual({
      label: 'Ready',
      tone: 'good',
    });
    expect(readinessPresentation('attention')).toEqual({
      label: 'Check fit',
      tone: 'warn',
    });
    expect(readinessPresentation('missing')).toEqual({
      label: 'Not ready',
      tone: 'bad',
    });
  });

  it('words and tones each plan-fit verdict', () => {
    expect(planFitPresentation('fits').tone).toBe('good');
    expect(planFitPresentation('attention').label).toBe(
      'Weigh before accepting'
    );
    expect(planFitPresentation('poor')).toEqual({
      label: 'Poor fit for the harness',
      tone: 'bad',
    });
  });

  it('joins the reasons into one line, and says why a ready item is ready', () => {
    expect(readinessSummary({ verdict: 'ready', reasons: [] })).toBe(
      'Ready: nothing in the issue stops intake.'
    );
    expect(
      readinessSummary({
        verdict: 'missing',
        reasons: [
          { code: 'no_description', message: 'The issue has no description.' },
          { code: 'blocked', message: 'Blocked by unresolved PROJ-9.' },
        ],
      })
    ).toBe(
      'Not ready: The issue has no description. Blocked by unresolved PROJ-9.'
    );
  });
});
