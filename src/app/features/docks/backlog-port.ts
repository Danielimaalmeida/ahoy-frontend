import { InjectionToken } from "@angular/core";
import type { ApiResult } from "@core/api/api-error";
import { StubBacklogAdapter } from "./stub-backlog-adapter";

/** One user story of the team's Jira backlog. */
export interface BacklogItem {
  /** The Jira key, such as `PROJ-123`. */
  readonly key: string;
  readonly summary: string;
  /** The Jira issue type ("Story"). */
  readonly type: string;
  /** The Jira status, in Jira's own words ("To Do", "In Progress"). */
  readonly jiraStatus: string;
  /** The Jira priority ("High", "Medium", "Low"). */
  readonly priority: string;
  /** The assignee's e-mail, or `null` when nobody has it. */
  readonly assignee: string | null;
  /** When Jira last changed it (ISO 8601). */
  readonly updatedAt: string;
}

/** Which backlog items to list: all of them, the ones with no voyage in Ahoy, or the ones that have one. */
export type BacklogScope = "all" | "not_started" | "in_ahoy";

/** What to list. Every field narrows the result; absent means "no restriction". */
export interface BacklogQuery {
  /** Text to look for in the key and the summary, ignoring case. */
  readonly q?: string;
  readonly jiraStatus?: string;
  /** An assignee's e-mail; `null` lists the unassigned ones. */
  readonly assignee?: string | null;
  readonly scope?: BacklogScope;
  /**
   * The keys of the voyages that exist in Ahoy, sent with `not_started` and `in_ahoy` so that an adapter that cannot
   * know Ahoy's state can still filter by scope. A backend that tracks it may ignore this.
   */
  readonly ahoyKeys?: readonly string[];
  /** The `nextCursor` of the previous page. */
  readonly cursor?: string;
  /** The most items to return. */
  readonly limit?: number;
}

/** What a backlog offers to filter by, taken from the whole backlog and not narrowed by the other filters. */
export interface BacklogFacets {
  readonly jiraStatuses: readonly string[];
  /** The e-mails of everyone who has an item. */
  readonly assignees: readonly string[];
}

/** One page of the backlog. */
export interface BacklogPage {
  readonly items: readonly BacklogItem[];
  /** How many items match the query, across all pages. */
  readonly total: number;
  /** The cursor for the next page, or `null` on the last one. */
  readonly nextCursor: string | null;
  readonly facets: BacklogFacets;
}

/**
 * Where The Docks reads the backlog from (plan G3). The API has no backlog endpoint yet, so the screen depends on this
 * interface and not on any source: the day the API gets one, an adapter for it replaces {@link StubBacklogAdapter} in
 * `BACKLOG_PORT` and no component changes.
 */
export interface BacklogPort {
  /** Whether the data is a plan and not real Jira data. The screen says so in a banner for as long as this is true. */
  readonly planned: boolean;
  /** One page of the backlog. A failure is a value, as everywhere in `core`. */
  list(query: BacklogQuery): Promise<ApiResult<BacklogPage>>;
}

/** The backlog source. Today the planned stub; provide another adapter here (or in a test) to swap it. */
export const BACKLOG_PORT = new InjectionToken<BacklogPort>("BACKLOG_PORT", {
  providedIn: "root",
  factory: () => new StubBacklogAdapter(),
});
