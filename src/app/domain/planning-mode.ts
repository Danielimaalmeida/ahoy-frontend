/**
 * How a story is planned (`ahoy-hosted` design §4, "Plan panel"): by one planner, the default, or by a panel of planners
 * and a judge. The union is written out because `domain/` may not import `core/`; `domain-types.spec.ts` checks it
 * against the contract's `PlanningMode`.
 */

/** The ways a story can be planned, in the order the choices are shown. */
export const PLANNING_MODES = ['standard', 'panel'] as const;

/** `standard`: one planner writes the plan. `panel`: planners write drafts on their own and a judge writes the plan. */
export type PlanningMode = (typeof PLANNING_MODES)[number];

/** What a story without a planning mode is planned by: a server older than the plan panel sends none. */
export const DEFAULT_PLANNING_MODE: PlanningMode = 'standard';

/** The mode in words. */
export const PLANNING_MODE_LABELS: Readonly<Record<PlanningMode, string>> = {
  standard: 'Standard',
  panel: 'Panel',
};

/** Whether a value is one of {@link PLANNING_MODES}. */
export function isPlanningMode(value: unknown): value is PlanningMode {
  return PLANNING_MODES.some((mode) => mode === value);
}

/** The story's planning mode; an absent one is `standard`. */
export function planningModeOf(story: {
  readonly planningMode?: PlanningMode;
}): PlanningMode {
  return story.planningMode ?? DEFAULT_PLANNING_MODE;
}

const COUNT_WORDS: Readonly<Record<number, string>> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
};

/** "Three planners": how many planners a panel has, in words; "Several planners" while that is not known. */
export function plannersLabel(count: number | null): string {
  if (count === null) return 'Several planners';
  return `${COUNT_WORDS[count] ?? String(count)} planners`;
}

/** One choice of the planning mode, as the cards of Set sail and the change dialog show it. */
export interface PlanningModeChoice {
  readonly value: PlanningMode;
  readonly title: string;
  readonly description: string;
}

/**
 * The two choices with what each does and costs. `planners` is how many planners the server's panel has, or null when the
 * model catalogue is not read (or an older server sends no panel).
 */
export function planningModeChoices(
  planners: number | null
): readonly PlanningModeChoice[] {
  return [
    {
      value: 'standard',
      title: 'Standard · one planner',
      description:
        'One planner writes the plan, as before. The default, and the cheapest.',
    },
    {
      value: 'panel',
      title: `Panel · ${plannersLabel(planners).toLowerCase()} and a judge`,
      description:
        `${plannersLabel(planners)} each write their own plan in parallel; then a judge writes the final plan from the ` +
        'best of each and rates every draft from 1 to 10. A panel costs more AIU than one planner.',
    },
  ];
}
