/**
 * The plan panel of the mock (`ahoy-hosted` design §4, "Plan panel"): what a planning run of a story planned by panel
 * leaves, and how the ratings of a period are worked out from it. A simulated judge, as in the hosted stub: no model is
 * called, the drafts are stand-ins and the scores differ by seat (and by panel) so that the screens have something to
 * compare. The panel's models are the ones `GET /models` lists under `planPanel`.
 */
import type {
  PlanPanel,
  PlanPanelMember,
  PlanPanelMetrics,
  PlanPanelModelRatings,
  ReasoningEffort,
} from '@core/api/types';
import listModels from '@testing/fixtures/listModels.json';
import { iso } from './clock';
import type { Writable } from './voyage';

/** The names of the drafts the judge sees: it is not told which model wrote which. */
const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

/** The scores a simulated judge gives the seats of a panel, best first. */
const SCORES = [8, 6, 7, 5, 4] as const;

const EFFORTS: readonly ReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** What a simulated panel run spends: the cap of a panel run is the planning phase's times two. */
export const PANEL_RUN_COST_NANO_AIU = 4_200_000_000;

/** The most days a period of the ratings may span, as the real API allows. */
export const PANEL_METRICS_MAX_DAYS = 366;

/** A reasoning effort from the catalogue's text, null for none. */
function effortOf(value: string | null): ReasoningEffort | null {
  return EFFORTS.find((effort) => effort === value) ?? null;
}

/** The stand-in plan the planner in the seat labelled `label` drafted. */
function draftText(storyKey: string, label: string): string {
  return (
    `# Draft ${label} for ${storyKey} (simulated)\n\n` +
    'One work package per repository, in dependency order.\n\n' +
    '- **WP1**: the API.\n- **WP2**: the page. Depends on WP1.\n'
  );
}

/**
 * The panel a planning run left. `planned` is false while the planners only ask questions: no draft has a plan, a gate
 * verdict or a score, and the judge has nothing to rate. `earlier` is how many panels the story had before, which turns
 * the scores round so the best draft is not always the same seat.
 */
export function simulatedPanel(
  runId: string,
  storyKey: string,
  createdAt: number,
  planned: boolean,
  earlier: number
): PlanPanel {
  const config = listModels.planPanel;
  const members: PlanPanelMember[] = config.panelists.map((p, i) => {
    const label = LABELS[i] ?? 'E';
    const score = SCORES[(i + earlier) % SCORES.length] ?? 5;
    return {
      label,
      model: p.model,
      reasoningEffort: effortOf(p.reasoningEffort),
      status: 'completed',
      error: null,
      usage: {
        requests: 6 + i,
        nanoAiu: 250_000_000 + i * 50_000_000,
        inputTokens: 60_000 + i * 8_000,
        outputTokens: 5_000 + i * 600,
      },
      gate: planned
        ? { result: 'pass', message: 'The plan passes all checks.' }
        : null,
      questions: planned
        ? []
        : [
            {
              text: 'Which invoices does the due date apply to?',
              recommendation: 'All open invoices.',
            },
          ],
      score: planned ? score : null,
      rationale: planned
        ? `Simulated rating of draft ${label}: no model judged it.`
        : null,
      adopted: planned ? 'Its work package split (simulated).' : null,
      leftOut: planned ? 'Nothing of note (simulated).' : null,
      plan: planned ? draftText(storyKey, label) : null,
    };
  });
  return {
    runId,
    storyKey,
    createdAt: iso(createdAt),
    judge: {
      model: config.judge.models[0] ?? 'claude-opus-5.5',
      reasoningEffort: effortOf(config.judge.reasoningEffort),
      usage: {
        requests: 5,
        nanoAiu: 900_000_000,
        inputTokens: 120_000,
        outputTokens: 8_000,
      },
    },
    summary: planned
      ? 'Simulated judge: the final plan is the stand-in plan; no model was called.'
      : null,
    ratingsProblem: null,
    members,
  };
}

/** The panel as `listStoryPlanPanels` lists it: the same, without the drafts' plans. */
export function withoutPlans(panel: PlanPanel): PlanPanel {
  return {
    ...panel,
    members: panel.members.map((member) => {
      const copy: Writable<PlanPanelMember> = { ...member };
      delete copy.plan;
      return copy;
    }),
  };
}

/** A score average to two decimals, as the real API rounds it; null for no score. */
function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** One draft of a model, and whether it had the highest score of its panel. */
interface Seat {
  readonly member: PlanPanelMember;
  readonly best: boolean;
}

/**
 * The ratings of every panel with `createdAt` in `[from, to)`: per model and judge model (a judge's scores are its own,
 * so two judges' are never averaged together), best average first, and the panels each judge ran.
 */
export function planPanelMetrics(
  panels: readonly PlanPanel[],
  from: string,
  to: string
): PlanPanelMetrics {
  const inPeriod = panels.filter(
    (panel) => panel.createdAt >= from && panel.createdAt < to
  );
  const seatsOf = new Map<
    string,
    { model: string; judgeModel: string | null; seats: Seat[] }
  >();
  const judges = new Map<string, number>();
  for (const panel of inPeriod) {
    if (panel.judge !== null)
      judges.set(panel.judge.model, (judges.get(panel.judge.model) ?? 0) + 1);
    const top = Math.max(0, ...panel.members.map((m) => m.score ?? 0));
    const judgeModel = panel.judge?.model ?? null;
    for (const member of panel.members) {
      const key = `${member.model}\u0000${judgeModel ?? ''}`;
      const row = seatsOf.get(key) ?? {
        model: member.model,
        judgeModel,
        seats: [],
      };
      row.seats.push({ member, best: top > 0 && member.score === top });
      seatsOf.set(key, row);
    }
  }
  const models = [...seatsOf.values()].map(
    ({ model, judgeModel, seats }): PlanPanelModelRatings => {
      const members = seats.map((seat) => seat.member);
      const scores = members.flatMap((m) =>
        m.score === null ? [] : [m.score]
      );
      const gates = members.flatMap((m) => (m.gate === null ? [] : [m.gate]));
      return {
        model,
        judgeModel,
        plans: members.length,
        rated: scores.length,
        averageScore: average(scores),
        minScore: scores.length === 0 ? null : Math.min(...scores),
        maxScore: scores.length === 0 ? null : Math.max(...scores),
        best: seats.filter((seat) => seat.best).length,
        gatePassed: gates.filter((gate) => gate.result === 'pass').length,
        gateChecked: gates.length,
        unfinished: members.filter((m) => m.status !== 'completed').length,
        averageNanoAiu: Math.round(
          members.reduce((sum, m) => sum + m.usage.nanoAiu, 0) / members.length
        ),
      };
    }
  );
  models.sort(
    (a, b) =>
      (b.averageScore ?? 0) - (a.averageScore ?? 0) ||
      b.plans - a.plans ||
      a.model.localeCompare(b.model) ||
      (a.judgeModel ?? '\uffff').localeCompare(b.judgeModel ?? '\uffff')
  );
  return {
    from,
    to,
    panels: inPeriod.length,
    models,
    judges: [...judges.entries()]
      .map(([model, count]) => ({ model, panels: count }))
      .sort((a, b) => b.panels - a.panels || a.model.localeCompare(b.model)),
  };
}
