/**
 * Pure rules for "Grill me" on a follow-up's brief: how often the answer is read again, and the block of decisions that
 * goes into the brief once the person has answered. No Angular, no clock.
 */
import {
  pickComplete,
  pickSummary,
  type GrillPick,
  type GrillQuestionLike,
} from './story-drafts';

/** How often the dialog reads the grill again while the agent is asking, in milliseconds. */
export const FOLLOW_UP_GRILL_POLL_MS = 3000;

/** The heading of the block of decisions in the brief. */
export const DECISIONS_HEADING = "Decisions from Ahoy's questions:";

/**
 * The decisions as text for the end of the brief: one line per question with a complete pick, an open one saying so.
 * Empty when no question was answered.
 */
export function decisionsBlock(
  questions: readonly GrillQuestionLike[],
  picks: ReadonlyMap<string, GrillPick>
): string {
  const lines: string[] = [];
  for (const question of questions) {
    const pick = picks.get(question.id);
    if (pick === undefined || !pickComplete(question, pick)) continue;
    const answer =
      pick.choice === 'open'
        ? 'Not decided yet; the crew should treat it as open.'
        : pickSummary(question, pick);
    lines.push(`- ${question.text} ${answer}`);
  }
  return lines.length === 0 ? '' : [DECISIONS_HEADING, ...lines].join('\n');
}

/** The brief with the block after it, a blank line between; the brief as it was when there is no block. */
export function appendDecisions(brief: string, block: string): string {
  if (block === '') return brief;
  const text = brief.trimEnd();
  return text === '' ? block : `${text}\n\n${block}`;
}
