import type { RefinementStatus } from './types';

/** The most an agent run (a refinement or an agent diagnosis) may be capped at, in nano-AIU: 20 AIU, as the contract says. */
export const AGENT_RUN_MAX_NANO_AIU = 20_000_000_000;

/** What each status means for the screens: the word they show, and whether the run is still in progress. */
const STATUSES: Readonly<
  Record<RefinementStatus, { readonly label: string; readonly active: boolean }>
> = {
  queued: { label: 'Queued', active: true },
  running: { label: 'Refining', active: true },
  succeeded: { label: 'Refined', active: false },
  cancelled: { label: 'Cancelled', active: false },
  failed: { label: 'Failed', active: false },
  budget_exceeded: { label: 'Failed', active: false },
  timed_out: { label: 'Failed', active: false },
  output_violation: { label: 'Failed', active: false },
  auth_failed: { label: 'Failed', active: false },
  lost: { label: 'Failed', active: false },
};

/** Whether the run is still in progress: queued for a run slot, or running. */
export function isActiveRefinement(status: RefinementStatus): boolean {
  return STATUSES[status].active;
}

/** The word a screen shows for a run's status ("Refinement · Refined"). */
export function refinementLabel(status: RefinementStatus): string {
  return STATUSES[status].label;
}

/** The word for a run as it stands: "Cancelling" once a cancel was asked for and the run has not ended yet. */
export function refinementStateLabel(refinement: {
  readonly status: RefinementStatus;
  readonly cancelRequested: boolean;
}): string {
  return refinement.cancelRequested && isActiveRefinement(refinement.status)
    ? 'Cancelling'
    : refinementLabel(refinement.status);
}
