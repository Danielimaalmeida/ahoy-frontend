import { STORY_STATUSES, type Story } from '@core/api/types';
import { AGROUND, boardStatus } from '@domain/status';
import type { StatusCounts, StatusFilter } from '@ui/filter-chips/filter-chips';

/** Reads the `?status=` of the address bar, which is untrusted: one of the six statuses, `blocked`, or All. */
export function filterOf(raw: unknown): StatusFilter {
  if (raw === AGROUND) return AGROUND;
  return STORY_STATUSES.find((status) => status === raw) ?? 'all';
}

/** Whether a voyage's key or title holds the text typed in the search, as plain text and ignoring case. */
export function matchesQuery(story: Story, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    story.key.toLowerCase().includes(needle) ||
    (story.title ?? '').toLowerCase().includes(needle)
  );
}

/** Whether a voyage is under the pressed chip: a blocked voyage is under Blocked, never under Ended. */
export function matchesFilter(story: Story, filter: StatusFilter): boolean {
  return filter === 'all' || boardStatus(story.status, story.phase) === filter;
}

/** How many voyages each chip holds once the search is applied: All, and one count per board status. */
export function chipCounts(
  stories: readonly Story[],
  query: string
): StatusCounts {
  const counts: Record<StatusFilter, number> = {
    all: 0,
    ready: 0,
    running: 0,
    awaiting_input: 0,
    awaiting_decision: 0,
    halted: 0,
    blocked: 0,
    terminal: 0,
  };
  for (const story of stories) {
    if (!matchesQuery(story, query)) continue;
    counts.all++;
    counts[boardStatus(story.status, story.phase)]++;
  }
  return counts;
}
