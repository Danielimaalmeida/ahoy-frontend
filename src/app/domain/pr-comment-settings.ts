/**
 * Team settings › Pull request comments in words (`ahoy-hosted` design §4 "PR comments", §5 "Team settings"): whether
 * Ahoy posts its replies to the comments the reviewer ruled on, how many comments a review round is given, the state the
 * side navigation shows, and what one entry of the section's history says. Pure.
 */

import { isRecord } from './records';

/** What the section keeps, as the API names it. */
export interface PrCommentChoice {
  readonly repliesOn: boolean;
  readonly commentsPerRound: number;
}

/** The side navigation's word for the section: "Replies on", "Replies off", or that this deployment cannot post. */
export function prCommentsStateLabel(
  settings: PrCommentChoice,
  repliesPostable: boolean
): { readonly label: string; readonly off: boolean } {
  if (!settings.repliesOn) return { label: 'Replies off', off: true };
  return repliesPostable
    ? { label: 'Replies on', off: false }
    : { label: 'Cannot post', off: true };
}

/** "10 comments", "1 comment". */
export function commentsLabel(n: number): string {
  return `${n} comment${n === 1 ? '' : 's'}`;
}

/**
 * The comments per round as typed: a whole number from 1 to `max`, or why it is refused. Read without floats: only
 * digits are taken.
 */
export function commentsPerRoundOf(
  typed: string,
  max: number
): { readonly value: number } | { readonly problem: string } {
  const trimmed = typed.trim();
  const range = `Give a whole number from 1 to ${max}.`;
  if (!/^\d{1,3}$/.test(trimmed)) return { problem: range };
  const value = Number.parseInt(trimmed, 10);
  return value >= 1 && value <= max ? { value } : { problem: range };
}

/** A field in words, for the history. */
function fieldWords(field: string, value: unknown): string {
  if (field === 'repliesOn') return value === true ? 'on' : 'off';
  return typeof value === 'number' ? String(value) : '?';
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  repliesOn: 'Replies',
  commentsPerRound: 'Comments per round',
};

/** What one Pull request comments entry of the settings history says happened, or undefined for another section's. */
export function describePrCommentEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'pr_comment_settings.updated') return undefined;
  const p = isRecord(payload) ? payload : {};
  const changes = p['changes'];
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([field, change]) =>
        isRecord(change)
          ? [
              `${FIELD_NAMES[field] ?? field}: ${fieldWords(field, change['from'])} → ${fieldWords(field, change['to'])}`,
            ]
          : []
      )
    : [];
  const text =
    words.length === 0
      ? 'Saved the pull request comment settings'
      : words.join('; ');
  return p['confirmReplies'] === true
    ? `${text} (confirmed replies are posted on pull requests)`
    : text;
}
