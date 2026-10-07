import { STORY_STATUSES, type Story } from "@core/api/types";
import type { StatusCounts, StatusFilter } from "@ui/filter-chips/filter-chips";

/** Reads the `?status=` of the address bar, which is untrusted: one of the six statuses, or All. */
export function filterOf(raw: unknown): StatusFilter {
  return STORY_STATUSES.find((status) => status === raw) ?? "all";
}

/** Whether a voyage's key or title holds the text typed in the search, as plain text and ignoring case. */
export function matchesQuery(story: Story, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return story.key.toLowerCase().includes(needle) || (story.title ?? "").toLowerCase().includes(needle);
}

/** How many voyages each chip holds once the search is applied: All, and one count per status. */
export function chipCounts(stories: readonly Story[], query: string): StatusCounts {
  const counts: Record<StatusFilter, number> = {
    all: 0,
    ready: 0,
    running: 0,
    awaiting_input: 0,
    awaiting_decision: 0,
    halted: 0,
    terminal: 0,
  };
  for (const story of stories) {
    if (!matchesQuery(story, query)) continue;
    counts.all++;
    counts[story.status]++;
  }
  return counts;
}
