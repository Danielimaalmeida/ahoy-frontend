/**
 * Pull request comments as review input (`ahoy-hosted` design §4, "PR comments"): Copilot's are ruled on in every
 * review round by themselves; people's only when a person clicks Assess comments. Pure: what the page may offer and how
 * a ruling and its reply read. The shapes are the contract's `PrCommentRuling` and `PrCommentCount`, written out
 * because `domain/` may not import `core/`.
 */
import type { StoryStatus } from './types';

/** How the reviewer ruled on a comment. */
export type CommentRuling = 'accepted' | 'declined' | 'question';

/** Where Ahoy's reply to a ruled comment is. */
export type CommentReplyStatus =
  'awaiting_fix' | 'reply_pending' | 'replied' | 'no_reply';

/** What the page needs of the reconciler's last count. */
export interface CommentCountView {
  readonly waiting: number;
  readonly openPrs: number;
  readonly error: string | null;
}

/** Why Assess comments is not offered, or null when it is. */
export type AssessBlock =
  'not_at_delivery' | 'running' | 'no_open_pr' | 'no_budget';

/**
 * Whether Assess comments may be asked for, as `assessComments` allows (it refuses the rest with `409 invalid_state`):
 * at the delivery gate, or once done while a pull request is still open as last counted, with budget left.
 */
export function assessBlock(
  story: { readonly status: StoryStatus; readonly phase: string },
  gateKey: string | null,
  count: CommentCountView | null,
  remainingNanoAiu: number
): AssessBlock | null {
  const atDelivery =
    story.status === 'awaiting_decision' && gateKey === 'delivery_accepted';
  const done = story.status === 'terminal' && story.phase === 'done';
  if (story.status === 'running') return 'running';
  if (!atDelivery && !done) return 'not_at_delivery';
  if (done && (count?.openPrs ?? 0) === 0) return 'no_open_pr';
  if (remainingNanoAiu <= 0) return 'no_budget';
  return null;
}

/** The count beside the button: "3 comments to assess", "No comments to assess", or null before the first count. */
export function waitingLabel(count: CommentCountView | null): string | null {
  if (count === null) return null;
  if (count.waiting === 0) return 'No comments to assess';
  return `${count.waiting} comment${count.waiting === 1 ? '' : 's'} to assess`;
}

/** A ruling in words. */
export const RULING_LABELS: Readonly<Record<CommentRuling, string>> = {
  accepted: 'Accepted',
  declined: 'Declined',
  question: 'Question for a person',
};

/** Where a reply is, in words: what a person reading the page needs to know about GitHub. */
export function replyLabel(ruling: {
  readonly status: CommentReplyStatus;
  readonly replyError: string | null;
}): string {
  switch (ruling.status) {
    case 'awaiting_fix':
      return 'Waits for the fix to be reviewed';
    case 'reply_pending':
      return ruling.replyError === null
        ? 'Reply waiting to be posted'
        : 'Reply not posted yet: GitHub refused it';
    case 'replied':
      return 'Replied on GitHub';
    case 'no_reply':
      return 'No reply';
  }
}

/** Where a comment was written, for its row: "src/a.ts:12", the review, or the conversation. */
export function commentPlace(ruling: {
  readonly kind: 'thread' | 'review' | 'conversation';
  readonly path: string | null;
  readonly line: number | null;
}): string {
  if (ruling.kind === 'review') return 'Review';
  if (ruling.kind === 'conversation') return 'Conversation';
  if (ruling.path === null) return 'Thread';
  return ruling.line === null ? ruling.path : `${ruling.path}:${ruling.line}`;
}
