import fixture from '@testing/fixtures/getStoryPrComments.json';
import { isStoryPrComments } from './guards';

describe('isStoryPrComments', () => {
  it('takes the fixture, and a story never counted with nothing ruled', () => {
    expect(isStoryPrComments.explain(fixture)).toBeNull();
    expect(
      isStoryPrComments({ key: 'PROJ-123', count: null, rulings: [] })
    ).toBe(true);
  });

  it('refuses a reply shown as posted without a time, or waiting without its text', () => {
    const [replied, pending] = fixture.rulings;
    expect(
      isStoryPrComments.explain({
        ...fixture,
        rulings: [{ ...replied, repliedAt: null }],
      })
    ).toBe(
      'StoryPrComments.rulings[0].repliedAt must be set exactly when the reply was posted'
    );
    expect(
      isStoryPrComments.explain({
        ...fixture,
        rulings: [{ ...pending, replyBody: null }],
      })
    ).toBe(
      'StoryPrComments.rulings[0].replyBody must be set while the reply waits to be posted'
    );
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
