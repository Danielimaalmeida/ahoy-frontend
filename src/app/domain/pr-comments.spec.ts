import {
  assessBlock,
  commentPlace,
  replyLabel,
  RULING_LABELS,
  waitingLabel,
} from './pr-comments';

const counted = (waiting: number, openPrs = 1) => ({
  waiting,
  openPrs,
  error: null,
});

describe('assessBlock', () => {
  it('offers Assess comments at the delivery gate, with budget left', () => {
    const atGate = {
      status: 'awaiting_decision',
      phase: 'delivery_gate',
    } as const;
    expect(assessBlock(atGate, 'delivery_accepted', null, 1)).toBeNull();
    expect(
      assessBlock(atGate, 'delivery_accepted', counted(0, 0), 1)
    ).toBeNull();
    expect(assessBlock(atGate, 'delivery_accepted', counted(2), 0)).toBe(
      'no_budget'
    );
  });

  it('offers it on a done voyage only while a pull request is open as last counted', () => {
    const done = { status: 'terminal', phase: 'done' } as const;
    expect(assessBlock(done, null, counted(3), 1)).toBeNull();
    expect(assessBlock(done, null, counted(0, 0), 1)).toBe('no_open_pr');
    expect(assessBlock(done, null, null, 1)).toBe('not_counted');
  });

  it('refuses another gate, a voyage under way and a running one, as the API does', () => {
    expect(
      assessBlock(
        { status: 'awaiting_decision', phase: 'plan_review' },
        'plan_accepted',
        counted(1),
        1
      )
    ).toBe('not_at_delivery');
    expect(
      assessBlock({ status: 'ready', phase: 'pr_review' }, null, counted(1), 1)
    ).toBe('not_at_delivery');
    expect(
      assessBlock(
        { status: 'running', phase: 'pr_review' },
        null,
        counted(1),
        1
      )
    ).toBe('running');
    expect(
      assessBlock({ status: 'terminal', phase: 'blocked' }, null, counted(1), 1)
    ).toBe('not_at_delivery');
  });
});

describe('waitingLabel', () => {
  it('counts the comments waiting, and says nothing before the first count', () => {
    expect(waitingLabel(null)).toBeNull();
    expect(waitingLabel(counted(0))).toBe('No comments to assess');
    expect(waitingLabel(counted(1))).toBe('1 comment to assess');
    expect(waitingLabel(counted(3))).toBe('3 comments to assess');
  });
});

describe('replyLabel', () => {
  it('says where each reply is, and that GitHub refused one not posted yet', () => {
    expect(replyLabel({ status: 'awaiting_fix', replyError: null })).toBe(
      'Waits for the fix to be reviewed'
    );
    expect(replyLabel({ status: 'reply_pending', replyError: null })).toBe(
      'Reply waiting to be posted'
    );
    expect(
      replyLabel({ status: 'reply_pending', replyError: 'HTTP 403' })
    ).toBe('Reply not posted yet: GitHub refused it');
    expect(replyLabel({ status: 'replied', replyError: null })).toBe(
      'Replied on GitHub'
    );
    expect(replyLabel({ status: 'no_reply', replyError: null })).toBe(
      'No reply'
    );
  });
});

describe('commentPlace and RULING_LABELS', () => {
  it('names where a comment was written', () => {
    expect(commentPlace({ kind: 'thread', path: 'src/a.ts', line: 12 })).toBe(
      'src/a.ts:12'
    );
    expect(commentPlace({ kind: 'thread', path: 'src/a.ts', line: null })).toBe(
      'src/a.ts'
    );
    expect(commentPlace({ kind: 'thread', path: null, line: null })).toBe(
      'Thread'
    );
    expect(commentPlace({ kind: 'review', path: null, line: null })).toBe(
      'Review'
    );
    expect(commentPlace({ kind: 'conversation', path: null, line: null })).toBe(
      'Conversation'
    );
  });

  it('words every ruling', () => {
    expect(RULING_LABELS).toEqual({
      accepted: 'Accepted',
      declined: 'Declined',
      question: 'Question for a person',
    });
  });
});
