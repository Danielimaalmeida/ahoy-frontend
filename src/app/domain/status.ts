import type { Phase, StoryStatus } from './types';

/** Badge modifiers of the design system (`ah-badge--<modifier>`). */
export type StatusModifier =
  'queued' | 'running' | 'input' | 'decision' | 'halted' | 'done' | 'blocked';

/** What a status badge shows: the crew's words, the CSS modifier and the API status word. */
export interface StatusPresentation {
  readonly label: string;
  readonly modifier: StatusModifier;
  readonly api: string;
}

/**
 * The API status `terminal`: a voyage that is done or blocked. The "Ended" filter is the Done part only; a blocked one
 * has its own board status (see {@link boardStatus}).
 */
export const IN_PORT: StoryStatus = 'terminal';

/**
 * Where a voyage stands on the boards: its API status, except that a `terminal` voyage in phase `blocked` is `blocked`.
 * The API calls it terminal, but it is not delivered: it ran out of rework rounds or CI fixes (a person may Unblock it)
 * or a person rejected it at a human gate (final), so it is never counted with the Done ones.
 */
export type BoardStatus = StoryStatus | 'blocked';

/** The board status of an aground voyage: terminal at phase `blocked`. */
export const AGROUND = 'blocked' satisfies BoardStatus;

/** A voyage's board status, from its API status and phase. */
export function boardStatus(
  status: StoryStatus,
  phase?: Phase | null
): BoardStatus {
  return status === 'terminal' && phase === 'blocked' ? AGROUND : status;
}

/** Whether a voyage is aground: terminal at phase `blocked`, not delivered. Whether it can be unblocked is in its events. */
export function isAground(story: {
  readonly status: StoryStatus;
  readonly phase: Phase;
}): boolean {
  return boardStatus(story.status, story.phase) === AGROUND;
}

const BY_STATUS: Readonly<
  Record<Exclude<StoryStatus, 'terminal'>, StatusPresentation>
> = {
  ready: { label: 'Queued', modifier: 'queued', api: 'ready' },
  running: { label: 'Running', modifier: 'running', api: 'running' },
  awaiting_input: {
    label: 'Needs answers',
    modifier: 'input',
    api: 'awaiting_input',
  },
  awaiting_decision: {
    label: 'Needs decision',
    modifier: 'decision',
    api: 'awaiting_decision',
  },
  halted: { label: 'Halted', modifier: 'halted', api: 'halted' },
};

/** Maps a story's status (and, for `terminal`, its phase) to the badge in `vocabulary.md`. */
export function statusPresentation(
  status: StoryStatus,
  phase?: Phase | null
): StatusPresentation {
  if (status === 'terminal') {
    return phase === 'blocked'
      ? { label: 'Blocked', modifier: 'blocked', api: 'terminal' }
      : { label: 'Done', modifier: 'done', api: 'terminal' };
  }
  return BY_STATUS[status];
}
