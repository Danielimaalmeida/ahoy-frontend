import type { BacklogReadiness, PlanFit } from './types';

/** How a verdict reads on a screen: its words and its tone. */
export interface FitPresentation {
  readonly label: string;
  readonly tone: 'good' | 'warn' | 'bad';
}

const READINESS: Readonly<
  Record<BacklogReadiness['verdict'], FitPresentation>
> = {
  ready: { label: 'Ready', tone: 'good' },
  attention: { label: 'Check fit', tone: 'warn' },
  missing: { label: 'Not ready', tone: 'bad' },
};

const PLAN_FIT: Readonly<Record<PlanFit['verdict'], FitPresentation>> = {
  fits: { label: 'Fits the harness', tone: 'good' },
  attention: { label: 'Weigh before accepting', tone: 'warn' },
  poor: { label: 'Poor fit for the harness', tone: 'bad' },
};

/** The words and tone of a backlog item's readiness ("Not ready"). */
export function readinessPresentation(
  verdict: BacklogReadiness['verdict']
): FitPresentation {
  return READINESS[verdict];
}

/** The words and tone of a plan's fit ("Weigh before accepting"). */
export function planFitPresentation(
  verdict: PlanFit['verdict']
): FitPresentation {
  return PLAN_FIT[verdict];
}

/** The reasons as one line for a tooltip or a screen reader: "Not ready: no description. Blocked by PROJ-9." */
export function readinessSummary(readiness: BacklogReadiness): string {
  const label = READINESS[readiness.verdict].label;
  if (readiness.reasons.length === 0)
    return `${label}: nothing in the issue stops intake.`;
  return `${label}: ${readiness.reasons.map((r) => r.message).join(' ')}`;
}
