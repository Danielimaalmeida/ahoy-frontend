import { ok, type ApiResult } from '@core/api/api-error';
import type {
  BacklogFacets,
  BacklogItem,
  BacklogPage,
  BacklogPort,
  BacklogQuery,
} from './backlog-port';

/** How many items a page has when the query does not say. */
export const DEFAULT_BACKLOG_PAGE_SIZE = 50;

const HOUR_MS = 3_600_000;

/** The nine rows of the Docks wireframe: `[key, summary, jiraStatus, priority, assignee, hours since it changed]`. */
const SAMPLE: readonly (readonly [
  string,
  string,
  string,
  string,
  string | null,
  number,
])[] = [
  [
    'PROJ-145',
    'Show the VAT number on exported invoices',
    'To Do',
    'High',
    null,
    2,
  ],
  [
    'PROJ-140',
    'Add audit trail to admin role changes',
    'In Progress',
    'High',
    'jordan@example.com',
    5,
  ],
  [
    'PROJ-144',
    'Let admins export the user list as CSV',
    'To Do',
    'Medium',
    'sam@example.com',
    26,
  ],
  [
    'PROJ-131',
    'Let customers download receipts as PDF',
    'In Progress',
    'Medium',
    'sam@example.com',
    30,
  ],
  [
    'PROJ-123',
    'Show invoice due date on the billing page',
    'In Progress',
    'High',
    'alex@example.com',
    50,
  ],
  [
    'PROJ-142',
    'Remember the last-used filter on the orders page',
    'To Do',
    'Low',
    null,
    74,
  ],
  [
    'PROJ-118',
    'Rate-limit the public search endpoint',
    'In Progress',
    'High',
    'sam@example.com',
    98,
  ],
  [
    'PROJ-138',
    'Translate the onboarding emails into Portuguese',
    'To Do',
    'Medium',
    'priya@example.com',
    122,
  ],
  [
    'PROJ-097',
    'Fix the timezone in the weekly report',
    'Done',
    'Medium',
    'alex@example.com',
    192,
  ],
];

/** The items of {@link StubBacklogAdapter}, with their times counted back from `now`. */
function sampleItems(now: Date): readonly BacklogItem[] {
  return SAMPLE.map(
    ([key, summary, jiraStatus, priority, assignee, hours]) => ({
      key,
      summary,
      type: 'Story',
      jiraStatus,
      priority,
      assignee,
      updatedAt: new Date(now.getTime() - hours * HOUR_MS).toISOString(),
      sprint: null,
    })
  );
}

/** Whether an item passes every restriction of the query. */
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

/** The position a cursor stands for: the cursors of this adapter are plain offsets, anything else means the start. */
function offsetOf(cursor: string | undefined): number {
  const offset = cursor === undefined ? 0 : Number(cursor);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

/** What the backlog can be filtered by. */
function facetsOf(items: readonly BacklogItem[]): BacklogFacets {
  const assignees = new Set<string>();
  for (const item of items)
    if (item.assignee !== null) assignees.add(item.assignee);
  return {
    jiraStatuses: [...new Set(items.map((i) => i.jiraStatus))],
    sprints: [],
    assignees: [...assignees].sort(),
  };
}

/**
 * **Planned data, not Jira.** The API has no backlog yet (plan G3), so this adapter serves the nine fictional stories of
 * the Docks wireframe and applies the filters on the client. It stays until an adapter for a real endpoint takes its place
 * in `BACKLOG_PORT`. `now` is where the "updated" times count back from, so a spec can fix them.
 */
export class StubBacklogAdapter implements BacklogPort {
  readonly planned = true;
  private readonly all: readonly BacklogItem[];

  constructor(now: Date = new Date()) {
    this.all = sampleItems(now);
  }

  list(query: BacklogQuery): Promise<ApiResult<BacklogPage>> {
    const matching = this.all.filter((item) => matches(item, query));
    const from = offsetOf(query.cursor);
    const to = from + Math.max(1, query.limit ?? DEFAULT_BACKLOG_PAGE_SIZE);
    return Promise.resolve(
      ok({
        items: matching.slice(from, to),
        total: matching.length,
        nextCursor: to < matching.length ? String(to) : null,
        facets: facetsOf(this.all),
      })
    );
  }
}
