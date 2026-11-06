import type { PlanPanel, PlanPanelMember } from '@core/api/types';
import { formatAiu } from '@domain/aiu';
import type { OutcomeModifier } from '@domain/outcome';
import {
  PANELIST_STATUS_LABELS,
  bestMembers,
  formatScore,
  panelSummaryLine,
  panelistStatusModifier,
  rankMembers,
  scoreBarPercent,
  unfinishedMembers,
} from '@domain/plan-panel';

/** One draft of a panel as its card shows it. Every text in it was written by an agent: show it as text. */
export interface DraftCard {
  /** Unique across panels: the run and the label. */
  readonly id: string;
  readonly label: string;
  readonly model: string;
  /** "low", or "default" when the planner ran at the model's own effort. */
  readonly effort: string;
  readonly statusLabel: string;
  readonly statusModifier: OutcomeModifier;
  /** Whether the planner finished: only then did it leave a draft for the judge. */
  readonly finished: boolean;
  readonly error: string | null;
  readonly gate: { readonly result: string; readonly message: string } | null;
  /** "0.41 AIU". */
  readonly cost: string;
  readonly score: number | null;
  /** "8/10", or "Not rated". */
  readonly scoreText: string;
  /** How much of the bar the score fills, 0 to 100. */
  readonly scoreBar: number;
  /** The draft had the highest score of its panel (ties included). */
  readonly best: boolean;
  readonly rationale: string | null;
  readonly adopted: string | null;
  readonly leftOut: string | null;
  readonly questions: readonly {
    readonly text: string;
    readonly recommendation: string;
  }[];
}

/** One panel run as the Plan panel section shows it. */
export interface PanelView {
  readonly runId: string;
  readonly createdAt: string;
  readonly judge: {
    readonly model: string;
    readonly effort: string;
    readonly cost: string;
  } | null;
  readonly summary: string | null;
  readonly ratingsProblem: string | null;
  /** The drafts, best first. */
  readonly cards: readonly DraftCard[];
  /** The planners that did not finish. */
  readonly unfinished: readonly DraftCard[];
  /** One line on the whole panel. */
  readonly line: string;
}

const EFFORT_DEFAULT = 'default';

/** "0.41 AIU" for an amount of nano-AIU. */
function aiu(nanoAiu: number): string {
  return `${formatAiu(nanoAiu, 2)} AIU`;
}

/** The card of one planner of the panel `runId`. */
function card(
  runId: string,
  member: PlanPanelMember,
  best: ReadonlySet<string>
): DraftCard {
  return {
    id: `${runId}/${member.label}`,
    label: member.label,
    model: member.model,
    effort: member.reasoningEffort ?? EFFORT_DEFAULT,
    statusLabel: PANELIST_STATUS_LABELS[member.status],
    statusModifier: panelistStatusModifier(member.status),
    finished: member.status === 'completed',
    error: member.error,
    gate: member.gate,
    cost: aiu(member.usage.nanoAiu),
    score: member.score,
    scoreText: formatScore(member.score),
    scoreBar: scoreBarPercent(member.score),
    best: best.has(member.label),
    rationale: member.rationale,
    adopted: member.adopted,
    leftOut: member.leftOut,
    questions: member.questions,
  };
}

/** A panel run as the section shows it: the drafts best first, the judge, and what did not go to plan. */
export function panelView(panel: PlanPanel): PanelView {
  const best = new Set(bestMembers(panel.members).map((m) => m.label));
  const cards = rankMembers(panel.members).map((m) =>
    card(panel.runId, m, best)
  );
  const unfinished = new Set(
    unfinishedMembers(panel.members).map((m) => m.label)
  );
  return {
    runId: panel.runId,
    createdAt: panel.createdAt,
    judge:
      panel.judge === null
        ? null
        : {
            model: panel.judge.model,
            effort: panel.judge.reasoningEffort ?? EFFORT_DEFAULT,
            cost: aiu(panel.judge.usage.nanoAiu),
          },
    summary: panel.summary,
    ratingsProblem: panel.ratingsProblem,
    cards,
    unfinished: cards.filter((c) => unfinished.has(c.label)),
    line: panelSummaryLine(panel),
  };
}
