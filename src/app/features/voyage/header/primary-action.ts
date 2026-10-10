import type { StoryStatus } from '@core/api/types';
import type { VoyageTab } from '../context/default-tab';

/** The header's primary action: a link to a tab, or the Resume dialog. */
export type PrimaryAction =
  | { readonly kind: 'tab'; readonly label: string; readonly tab: VoyageTab }
  | { readonly kind: 'resume'; readonly label: string };

/**
 * The one primary action of the voyage header, by status (plan, lane 4A, deliverable 4): Answer questions, Decide on the
 * plan (or Decide, for a gate other than the plan's), Resume…, or none while it sails, waits in the queue or is done.
 */
export function primaryAction(
  status: StoryStatus,
  gateKey: string | null
): PrimaryAction | null {
  switch (status) {
    case 'awaiting_input':
      return { kind: 'tab', label: 'Answer questions', tab: 'questions' };
    case 'awaiting_decision':
      return {
        kind: 'tab',
        label: gateKey === 'plan_accepted' ? 'Decide on the plan' : 'Decide',
        tab: 'plan',
      };
    case 'halted':
      return { kind: 'resume', label: 'Resume…' };
    case 'running':
    case 'ready':
    case 'terminal':
      return null;
  }
}

/** Which of the secondary actions the header offers: Stop while the voyage is moving, Budget until it is done. */
export interface HeaderActions {
  readonly stop: boolean;
  readonly budget: boolean;
}

/** Stop is for a voyage that is not anchored or done; Budget for any voyage that is not done (plan, deliverable 4). */
export function headerActions(status: StoryStatus): HeaderActions {
  return {
    stop: status !== 'halted' && status !== 'terminal',
    budget: status !== 'terminal',
  };
}
