import type { Run, Story, StoryStatus } from '@core/api/types';
import { isOver } from '@domain/status';
import type { VoyageTab } from '../context/default-tab';

/**
 * The header's primary action: a link to a tab, a jump to the open gate's decision above the tabs, the Resume dialog, or
 * the Start again dialog.
 */
export type PrimaryAction =
  | { readonly kind: 'tab'; readonly label: string; readonly tab: VoyageTab }
  | { readonly kind: 'decide'; readonly label: string }
  | { readonly kind: 'resume'; readonly label: string }
  | { readonly kind: 'restart'; readonly label: string };

/**
 * The one primary action of the voyage header, by status (plan, lane 4A, deliverable 4): Answer questions, Decide on the
 * plan (the Plan tab), Decide (for a gate other than the plan's, whose decision sits above the tabs), Resume…, Start
 * again… once cancelled, or none while it sails, waits in the queue or is done.
 */
export function primaryAction(
  status: StoryStatus,
  gateKey: string | null
): PrimaryAction | null {
  switch (status) {
    case 'awaiting_input':
      return { kind: 'tab', label: 'Answer questions', tab: 'questions' };
    case 'awaiting_decision':
      if (gateKey === 'plan_accepted')
        return { kind: 'tab', label: 'Decide on the plan', tab: 'plan' };
      // Until the gate is known, the Plan tab; the decision of another gate sits above the tabs.
      return gateKey === null
        ? { kind: 'tab', label: 'Decide', tab: 'plan' }
        : { kind: 'decide', label: 'Decide' };
    case 'halted':
      return { kind: 'resume', label: 'Resume…' };
    case 'cancelled':
      return { kind: 'restart', label: 'Start again…' };
    case 'running':
    case 'ready':
    case 'terminal':
      return null;
  }
}

/**
 * Which of the secondary actions the header offers: Stop while the voyage is moving, Budget until it is over, and Cancel
 * voyage until it is over.
 */
export interface HeaderActions {
  readonly stop: boolean;
  readonly budget: boolean;
  readonly cancel: boolean;
}

/**
 * Stop is for a voyage that is not anchored or over; Budget and Cancel voyage for any voyage that is not over (plan,
 * deliverable 4).
 */
export function headerActions(status: StoryStatus): HeaderActions {
  return {
    stop: status !== 'halted' && !isOver(status),
    budget: !isOver(status),
    cancel: !isOver(status),
  };
}

/** The phases a voyage can be sent back to intake from: before any implementation, as `refreshIntake` allows. */
const REFRESHABLE_PHASES: readonly string[] = ['planning', 'plan_review'];

/**
 * Whether the header offers Back to intake: in planning or plan review, with no run under way or queued, and no
 * implementation run ever (the API refuses the rest with `409 invalid_state`). `runs` is null until they are read: with
 * an unread list nobody knows there was no implementation yet, so nothing is offered.
 */
export function canRefreshIntake(
  story: Pick<Story, 'phase' | 'status' | 'currentRunId'>,
  runs: readonly Pick<Run, 'phase'>[] | null
): boolean {
  return (
    runs !== null &&
    REFRESHABLE_PHASES.includes(story.phase) &&
    story.status !== 'running' &&
    !isOver(story.status) &&
    story.currentRunId === null &&
    !runs.some((run) => run.phase === 'implementation')
  );
}

/** The phases a voyage's design can be refreshed from while it is halted, as `refreshDesign` allows. */
const DESIGN_REFRESH_HALTS: readonly string[] = ['implementation', 'pr_review'];

/**
 * Whether the header offers Refresh design, as `refreshDesign` allows (it refuses the rest with `409 invalid_state`): no
 * run is under way, and either a design was read and the voyage is halted in implementation or review or waits at the
 * delivery gate, or an earlier refresh's links stopped it in the design phase (they could not be read), which only
 * another refresh can correct.
 */
export function canRefreshDesign(
  story: Pick<Story, 'phase' | 'status' | 'currentRunId'>,
  design: { readonly read: boolean; readonly refreshed: boolean }
): boolean {
  if (story.currentRunId !== null) return false;
  if (story.status === 'halted' && story.phase === 'design')
    return design.refreshed;
  if (!design.read) return false;
  return story.status === 'halted'
    ? DESIGN_REFRESH_HALTS.includes(story.phase)
    : story.status === 'awaiting_decision' && story.phase === 'delivery_gate';
}

/** An action of the header's More menu. */
export type MenuItemId =
  | 'budget'
  | 'models'
  | 'intake'
  | 'design'
  | 'followUp'
  | 'raiseCeiling'
  | 'stop'
  | 'cancel';

/** One item of the More menu. */
export interface MenuItem {
  readonly id: MenuItemId;
  readonly label: string;
  /** Stop and Cancel voyage: red, at the end. */
  readonly danger: boolean;
  /** The first danger item after others: a rule above it keeps it apart. */
  readonly separated: boolean;
  readonly disabled: boolean;
}

/** What {@link menuItems} needs: which actions apply now. */
export interface MenuInput extends HeaderActions {
  readonly halted: boolean;
  /** Models is disabled until the voyage's models are read. */
  readonly modelsReady: boolean;
  readonly intake: boolean;
  readonly design: boolean;
  /** The voyage is done and can be continued by a follow-up voyage. */
  readonly startFollowUp: boolean;
  /** The lineage has used all its revision rounds, so more need a raise of the ceiling. */
  readonly raiseCeiling: boolean;
}

/**
 * The More menu of the voyage header, in order: Budget, Models ("Change models" when anchored), Back to intake, Refresh
 * design, Start follow-up, Raise revision ceiling, then Stop and Cancel voyage apart at the end. Only those that apply now are listed.
 */
export function menuItems(input: MenuInput): readonly MenuItem[] {
  const items: Omit<MenuItem, 'separated'>[] = [];
  const add = (
    id: MenuItemId,
    label: string,
    danger = false,
    disabled = false
  ): void => {
    items.push({ id, label, danger, disabled });
  };
  if (input.budget) add('budget', 'Budget');
  add(
    'models',
    input.halted ? 'Change models' : 'Models',
    false,
    !input.modelsReady
  );
  if (input.intake) add('intake', 'Back to intake');
  if (input.design) add('design', 'Refresh design');
  if (input.startFollowUp) add('followUp', 'Start follow-up');
  if (input.raiseCeiling) add('raiseCeiling', 'Raise revision ceiling');
  if (input.stop) add('stop', 'Stop', true);
  if (input.cancel) add('cancel', 'Cancel voyage', true);
  return items.map((item, i) => ({
    ...item,
    separated: item.danger && i > 0 && items[i - 1]?.danger === false,
  }));
}
