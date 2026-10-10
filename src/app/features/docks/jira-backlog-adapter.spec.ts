import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { JiraBacklog } from '@core/api/types';
import type { BacklogPage, BacklogQuery } from './backlog-port';
import {
  DEFAULT_JIRA_BACKLOG_PAGE_SIZE,
  JiraBacklogAdapter,
} from './jira-backlog-adapter';

const BACKLOG: JiraBacklog = {
  items: [
    {
      key: 'PROJ-145',
      issueType: 'Story',
      summary: 'Show the VAT number on exported invoices',
      status: 'Open',
      priority: 'High',
      updatedAt: '2026-10-06T08:00:00.000Z',
      sprint: null,
    },
    {
      key: 'PROJ-140',
      issueType: 'Bug',
      summary: 'Fix the audit trail',
      status: 'In Test',
      priority: null,
      updatedAt: '2026-10-06T07:00:00.000Z',
      sprint: { id: 12, name: 'Sprint 12', state: 'active' },
    },
  ],
  total: 2,
};

class FakeJiraApi {
  calls = 0;
  answer: ApiResult<JiraBacklog> = ok(BACKLOG);

  listJiraBacklog(): Promise<ApiResult<JiraBacklog>> {
    this.calls += 1;
    return Promise.resolve(this.answer);
  }
}

async function page(
  adapter: JiraBacklogAdapter,
  query: BacklogQuery = {}
): Promise<BacklogPage> {
  const result = await adapter.list(query);
  if (!result.ok) throw new Error('the fake Jira API should answer');
  return result.value;
}

describe('JiraBacklogAdapter', () => {
  it('maps the Jira contract and caches the complete result', async () => {
    const api = new FakeJiraApi();
    const adapter = new JiraBacklogAdapter(api);

    expect((await page(adapter)).items).toEqual([
      {
        key: 'PROJ-145',
        summary: 'Show the VAT number on exported invoices',
        type: 'Story',
        jiraStatus: 'Open',
        priority: 'High',
        assignee: null,
        updatedAt: '2026-10-06T08:00:00.000Z',
        sprint: null,
      },
      {
        key: 'PROJ-140',
        summary: 'Fix the audit trail',
        type: 'Bug',
        jiraStatus: 'In Test',
        priority: 'Not set',
        assignee: null,
        updatedAt: '2026-10-06T07:00:00.000Z',
        sprint: { id: 12, name: 'Sprint 12', state: 'active' },
      },
    ]);
    await page(adapter, { q: 'audit' });
    expect(api.calls).toBe(1);
  });

  it('filters and pages Jira items on the client because the endpoint has no query parameters', async () => {
    const adapter = new JiraBacklogAdapter(new FakeJiraApi());
    const first = await page(adapter, { jiraStatus: 'Open', limit: 1 });
    expect(first.total).toBe(1);
    expect(first.nextCursor).toBeNull();
    expect(first.facets).toEqual({
      jiraStatuses: ['Open', 'In Test'],
      assignees: [],
      sprints: [{ id: 12, name: 'Sprint 12', state: 'active' }],
    });
  });

  it('returns the API failure and can retry after a failed request', async () => {
    const api = new FakeJiraApi();
    api.answer = fail({ kind: 'network' });
    const adapter = new JiraBacklogAdapter(api);

    const failed = await adapter.list({});
    expect(failed).toEqual({ ok: false, error: { kind: 'network' } });
    api.answer = ok(BACKLOG);
    expect((await adapter.list({})).ok).toBe(true);
    expect(api.calls).toBe(2);
  });

  it('filters by sprint ID or no sprint, retaining the full sprint facets', async () => {
    const api = new FakeJiraApi();
    const adapter = new JiraBacklogAdapter(api);
    const active = await page(adapter, { sprintId: 12 });
    expect(active.items.map((item) => item.key)).toEqual(['PROJ-140']);
    expect(active.facets.sprints).toEqual([
      { id: 12, name: 'Sprint 12', state: 'active' },
    ]);
    expect(
      (await page(adapter, { sprintId: null })).items.map((item) => item.key)
    ).toEqual(['PROJ-145']);
    expect((await page(adapter, { sprintId: 99 })).total).toBe(0);
    expect(api.calls).toBe(1);
  });

  it('deduplicates sprint facets and preserves rank order inside a filtered sprint across pages', async () => {
    const api = new FakeJiraApi();
    const issue = BACKLOG.items[1]!;
    api.answer = ok({
      items: [issue, { ...issue, key: 'PROJ-141' }, BACKLOG.items[0]!],
      total: 3,
    });
    const adapter = new JiraBacklogAdapter(api);
    const first = await page(adapter, { sprintId: 12, limit: 1 });
    expect(first.items.map((item) => item.key)).toEqual(['PROJ-140']);
    expect(first.total).toBe(2);
    expect(first.facets.sprints).toHaveLength(1);
    const second = await page(adapter, {
      sprintId: 12,
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.key)).toEqual(['PROJ-141']);
    expect(second.nextCursor).toBeNull();
  });

  it('uses the adapter page default', async () => {
    const adapter = new JiraBacklogAdapter(new FakeJiraApi());
    expect((await page(adapter)).items).toHaveLength(2);
    expect(DEFAULT_JIRA_BACKLOG_PAGE_SIZE).toBe(50);
  });
});
