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

/** The API status that groups Done and Blocked ("Finished" filter). */
export const IN_PORT: StoryStatus = 'terminal';

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
