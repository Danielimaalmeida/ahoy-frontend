import fixture from '@testing/fixtures/getStoryPrComments.json';
import { isStoryPrComments } from './guards';

describe('isStoryPrComments', () => {
  it('takes the fixture, and a story never counted with nothing ruled', () => {
    expect(isStoryPrComments.explain(fixture)).toBeNull();
    expect(
      isStoryPrComments({ key: 'PROJ-123', count: null, rulings: [] })
    ).toBe(true);
  });

  it('takes every ruling the contract allows, a reply posted without its time too', () => {
    const [replied, pending] = fixture.rulings;
    expect(
      isStoryPrComments({
        ...fixture,
        rulings: [
          { ...replied, repliedAt: null, line: 0, repo: '' },
          { ...pending, replyBody: null },
        ],
      })
    ).toBe(true);
  });

  it('refuses an unknown ruling, a negative count and a pull request number of 0', () => {
    const [first] = fixture.rulings;
    expect(
      isStoryPrComments({
        ...fixture,
        rulings: [{ ...first, ruling: 'maybe' }],
      })
    ).toBe(false);
    expect(
      isStoryPrComments({
        ...fixture,
        count: { ...fixture.count, waiting: -1 },
      })
    ).toBe(false);
    expect(
      isStoryPrComments({ ...fixture, rulings: [{ ...first, prNumber: 0 }] })
    ).toBe(false);
  });
});
