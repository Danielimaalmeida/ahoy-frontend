/**
 * The plan panel (`ahoy-hosted` design §4, "Plan panel"): planners each draft a plan, a judge writes the final plan from
 * them and rates every draft from 1 to 10. Pure: how the drafts are ordered, how a score and a panel read, and what
 * the ratings table shows. The shapes are the part of the contract these functions read, written out because `domain/`
 * may not import `core/`; the contract's `PlanPanel` and `PlanPanelMember` are assignable to them.
 */
import type { OutcomeModifier } from './outcome';

/** How a planner's session ended. Only `completed` leaves a draft for the judge. */
export const PANELIST_STATUSES = [
  'completed',
  'failed',
  'budget_exceeded',
  'timed_out',
  'output_violation',
] as const;
export type PanelistStatus = (typeof PANELIST_STATUSES)[number];

/** A planner's end in words. */
export const PANELIST_STATUS_LABELS: Readonly<Record<PanelistStatus, string>> =
  {
    completed: 'Finished',
    failed: 'Failed',
    budget_exceeded: 'Ran out of budget',
    timed_out: 'Ran out of time',
    output_violation: 'Broke the output rules',
  };

/** The pill colour of a planner's end: done for a finished draft, halted for any other end. */
export function panelistStatusModifier(
  status: PanelistStatus
): OutcomeModifier {
  return status === 'completed' ? 'done' : 'halted';
}

/** The lowest and the highest score the judge gives a draft. */
export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

/** What the functions below read of one planner of a panel. */
export interface PanelMemberView {
  readonly label: string;
  readonly model: string;
  readonly status: PanelistStatus;
  /** The judge's score from 1 to 10; null when the draft was not rated. */
  readonly score: number | null;
}

/** What the functions below read of a panel run. */
export interface PanelView {
  readonly judge: { readonly model: string } | null;
  readonly ratingsProblem: string | null;
  readonly members: readonly PanelMemberView[];
}

/** "8/10", or "Not rated". */
export function formatScore(score: number | null): string {
  return score === null ? 'Not rated' : `${score}/${MAX_SCORE}`;
}

/** The share of a bar a score fills, 0 to 100: 7 fills 70, and no score fills none. */
export function scoreBarPercent(score: number | null): number {
  if (score === null) return 0;
  return Math.min(100, Math.max(0, Math.round((score / MAX_SCORE) * 100)));
}

/** The drafts best first: rated ones by score, then the unrated; equal scores keep the order of their labels. */
export function rankMembers<M extends PanelMemberView>(
  members: readonly M[]
): M[] {
  return [...members].sort((a, b) => {
    if (a.score !== b.score) {
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    }
    return a.label.localeCompare(b.label);
  });
}

/** The drafts that had the highest score, ties included; none when no draft was rated. */
export function bestMembers<M extends PanelMemberView>(
  members: readonly M[]
): M[] {
  const top = Math.max(0, ...members.map((m) => m.score ?? 0));
  return top === 0 ? [] : members.filter((m) => m.score === top);
}

/** The planners that did not finish: they left no draft for the judge. */
export function unfinishedMembers<M extends PanelMemberView>(
  members: readonly M[]
): M[] {
  return members.filter((m) => m.status !== 'completed');
}

/**
 * One line on a panel: how many planners finished, who judged and which draft was best, or why nobody was rated.
 * `modelName` turns a model id into what the page shows for it.
 */
export function panelSummaryLine(
  panel: PanelView,
  modelName: (id: string) => string = (id) => id
): string {
  const total = panel.members.length;
  const finished = total - unfinishedMembers(panel.members).length;
  const planners = `${finished} of ${total} ${total === 1 ? 'planner' : 'planners'} finished`;
  if (panel.judge === null) return `${planners}, so no judge ran.`;
  const judged = `${planners}, judged by ${modelName(panel.judge.model)}.`;
  if (panel.ratingsProblem !== null)
    return `${judged} The ratings could not be used.`;
  const best = bestMembers(panel.members);
  const first = best[0];
  if (first === undefined) return `${judged} No draft was rated.`;
  const labels = best.map((m) => m.label).join(' and ');
  return `${judged} Best draft: ${labels}, ${formatScore(first.score)}.`;
}

/** An average score with one decimal ("7.3"), or "—" when nothing was rated. */
export function formatAverageScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(1);
}

/** The lowest and highest score as "6–9" ("7" when they are equal), or "—" when nothing was rated. */
export function formatScoreRange(
  min: number | null,
  max: number | null
): string {
  if (min === null || max === null) return '—';
  return min === max ? String(min) : `${min}–${max}`;
}

/** "2/3": how many drafts the plan gate passed of those it checked, or "—" when it checked none. */
export function formatGateRatio(passed: number, checked: number): string {
  return checked === 0 ? '—' : `${passed}/${checked}`;
}

/** A model's name in the catalogue's words when the catalogue lists it, else the id itself. */
export function catalogModelLabel(
  models: readonly { readonly id: string; readonly label: string }[],
  id: string
): string {
  return models.find((model) => model.id === id)?.label ?? id;
}

/**
 * Who judges, from the judge's models, best first: it runs on the first one the owner's Copilot account may use.
 * "Claude Opus 5.5, or Claude Sonnet 5.5 if your Copilot account may not use it".
 */
export function judgeModelsLine(names: readonly string[]): string {
  const [first, ...rest] = names;
  if (first === undefined) return '—';
  return rest.length === 0
    ? first
    : `${first}, or ${rest.join(' or ')} if your Copilot account may not use it`;
}
