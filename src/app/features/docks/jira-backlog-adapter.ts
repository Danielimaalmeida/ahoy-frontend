import { inject } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { JiraBacklog, JiraBacklogIssue } from '@core/api/types';
import type {
  BacklogFacets,
  BacklogItem,
  BacklogPage,
  BacklogPort,
  BacklogQuery,
} from './backlog-port';

/** The default page size used when the Docks query does not specify one. */
export const DEFAULT_JIRA_BACKLOG_PAGE_SIZE = 50;

interface JiraBacklogSource {
  listJiraBacklog(): Promise<ApiResult<JiraBacklog>>;
}

/** Reads and filters the configured Jira backlog returned by Ahoy. */
export class JiraBacklogAdapter implements BacklogPort {
  readonly planned = false;
  private readonly api: JiraBacklogSource;
  private items: readonly BacklogItem[] | null = null;
  private request: Promise<ApiResult<readonly BacklogItem[]>> | null = null;

  constructor(api: JiraBacklogSource = inject(ApiClient)) {
    this.api = api;
  }

  list(query: BacklogQuery): Promise<ApiResult<BacklogPage>> {
    return this.load().then((result) => {
      if (!result.ok) return fail(result.error);
      const matching = result.value.filter((item) => matches(item, query));
      const from = offsetOf(query.cursor);
      const to =
        from + Math.max(1, query.limit ?? DEFAULT_JIRA_BACKLOG_PAGE_SIZE);
      return ok({
        items: matching.slice(from, to),
        total: matching.length,
        nextCursor: to < matching.length ? String(to) : null,
        facets: facetsOf(result.value),
      });
    });
  }

  private load(): Promise<ApiResult<readonly BacklogItem[]>> {
    if (this.items !== null) return Promise.resolve(ok(this.items));
    if (this.request !== null) return this.request;
    this.request = this.api.listJiraBacklog().then((result) => {
      if (result.ok) {
        this.items = result.value.items.map(toBacklogItem);
        return ok(this.items);
      }
      this.request = null;
      return fail(result.error);
    });
    return this.request;
  }
}

function toBacklogItem(item: JiraBacklogIssue): BacklogItem {
  return {
    key: item.key,
    summary: item.summary,
    type: item.issueType,
    jiraStatus: item.status,
    priority: item.priority ?? 'Not set',
    assignee: null,
    updatedAt: item.updatedAt,
    sprint: item.sprint,
  };
}

function matches(item: BacklogItem, query: BacklogQuery): boolean {
  const q = query.q?.trim().toLowerCase() ?? '';
  if (
    q !== '' &&
    !item.key.toLowerCase().includes(q) &&
    !item.summary.toLowerCase().includes(q)
  )
    return false;
  if (query.jiraStatus !== undefined && item.jiraStatus !== query.jiraStatus)
    return false;
  if (
    query.sprintId !== undefined &&
    (item.sprint?.id ?? null) !== query.sprintId
  )
    return false;
  if (query.assignee !== undefined && item.assignee !== query.assignee)
    return false;
  if (query.scope === 'not_started')
    return !(query.ahoyKeys ?? []).includes(item.key);
  if (query.scope === 'in_ahoy')
    return (query.ahoyKeys ?? []).includes(item.key);
  return true;
}

function offsetOf(cursor: string | undefined): number {
  const offset = cursor === undefined ? 0 : Number(cursor);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

function facetsOf(items: readonly BacklogItem[]): BacklogFacets {
  return {
    jiraStatuses: [...new Set(items.map((item) => item.jiraStatus))],
    sprints: [
      ...new Map(
        items.flatMap((item) =>
          item.sprint === null ? [] : [[item.sprint.id, item.sprint] as const]
        )
      ).values(),
    ],
    assignees: [],
  };
}
