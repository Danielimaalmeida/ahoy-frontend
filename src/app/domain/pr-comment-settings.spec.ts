import {
  commentsLabel,
  commentsPerRoundOf,
  describePrCommentEvent,
  prCommentsStateLabel,
} from './pr-comment-settings';
import { describeSettingsEvent } from './settings';

describe('prCommentsStateLabel', () => {
  it('says whether replies are on, and when this deployment cannot post them', () => {
    const at = (repliesOn: boolean) => ({ repliesOn, commentsPerRound: 10 });
    expect(prCommentsStateLabel(at(false), true)).toEqual({
      label: 'Replies off',
      off: true,
    });
    expect(prCommentsStateLabel(at(true), true)).toEqual({
      label: 'Replies on',
      off: false,
    });
    expect(prCommentsStateLabel(at(true), false)).toEqual({
      label: 'Cannot post',
      off: true,
    });
  });
});

describe('commentsPerRoundOf', () => {
  it('takes a whole number from 1 to the maximum, without floats', () => {
    expect(commentsPerRoundOf(' 6 ', 10)).toEqual({ value: 6 });
    expect(commentsPerRoundOf('10', 10)).toEqual({ value: 10 });
    for (const typed of ['0', '11', '2.5', '1e1', '', '-1', 'six'])
      expect(commentsPerRoundOf(typed, 10)).toEqual({
        problem: 'Give a whole number from 1 to 10.',
      });
  });

  it('words a count', () => {
    expect(commentsLabel(1)).toBe('1 comment');
    expect(commentsLabel(10)).toBe('10 comments');
  });
});

describe('the Pull request comments entries of the settings history', () => {
  it('name each change and say when replies were confirmed', () => {
    expect(
      describeSettingsEvent('pr_comment_settings.updated', {
        changes: {
          repliesOn: { from: false, to: true },
          commentsPerRound: { from: 10, to: 6 },
        },
        confirmReplies: true,
      })
    ).toBe(
      'Replies: off → on; Comments per round: 10 → 6 (confirmed replies are posted on pull requests)'
    );
  });

  it('read a broken payload as a plain sentence, and leave other sections alone', () => {
    expect(describePrCommentEvent('pr_comment_settings.updated', [])).toBe(
      'Saved the pull request comment settings'
    );
    expect(
      describePrCommentEvent('agent_settings.updated', {})
    ).toBeUndefined();
  });
});
