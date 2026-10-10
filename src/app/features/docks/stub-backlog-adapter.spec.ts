import type { BacklogPage, BacklogQuery } from './backlog-port';
import {
  DEFAULT_BACKLOG_PAGE_SIZE,
  StubBacklogAdapter,
} from './stub-backlog-adapter';

const NOW = new Date('2026-10-06T10:00:00.000Z');

/** The page the stub gives for a query; the stub never fails. */
async function page(
  adapter: StubBacklogAdapter,
  query: BacklogQuery = {}
): Promise<BacklogPage> {
  const result = await adapter.list(query);
  if (!result.ok) throw new Error('the stub does not fail');
  return result.value;
}

const keys = (p: BacklogPage): string[] => p.items.map((i) => i.key);

describe('StubBacklogAdapter', () => {
  let adapter: StubBacklogAdapter;

  beforeEach(() => {
    adapter = new StubBacklogAdapter(NOW);
  });

  it('says it is planned data, not Jira', () => {
    expect(adapter.planned).toBe(true);
  });

  it('serves the nine stories of the wireframe, newest first', async () => {
    const all = await page(adapter);
    expect(keys(all)).toEqual([
      'PROJ-145',
      'PROJ-140',
      'PROJ-144',
      'PROJ-131',
      'PROJ-123',
      'PROJ-142',
      'PROJ-118',
      'PROJ-138',
      'PROJ-097',
    ]);
    expect(all.total).toBe(9);
    expect(all.nextCursor).toBeNull();
    expect(all.items[0]).toEqual({
      key: 'PROJ-145',
      summary: 'Show the VAT number on exported invoices',
      type: 'Story',
      jiraStatus: 'To Do',
      priority: 'High',
      assignee: null,
      updatedAt: '2026-10-06T08:00:00.000Z',
      sprint: null,
    });
  });

  it('counts the updated times back from the instant it was given', async () => {
    const later = new StubBacklogAdapter(new Date(NOW.getTime() + 3_600_000));
    const [a, b] = [await page(adapter), await page(later)];
    expect(
      Date.parse(b.items[0]!.updatedAt) - Date.parse(a.items[0]!.updatedAt)
    ).toBe(3_600_000);
  });

  it('searches the key and the summary, ignoring case and surrounding spaces', async () => {
    expect(keys(await page(adapter, { q: ' proj-14' }))).toEqual([
      'PROJ-145',
      'PROJ-140',
      'PROJ-144',
      'PROJ-142',
    ]);
    expect(keys(await page(adapter, { q: 'CSV' }))).toEqual(['PROJ-144']);
    expect((await page(adapter, { q: 'nothing like this' })).total).toBe(0);
  });

  it('filters by Jira status', async () => {
    expect(keys(await page(adapter, { jiraStatus: 'Done' }))).toEqual([
      'PROJ-097',
    ]);
    expect((await page(adapter, { jiraStatus: 'In Progress' })).total).toBe(4);
  });

  it('filters by assignee, and null means unassigned', async () => {
    expect(keys(await page(adapter, { assignee: 'sam@example.com' }))).toEqual([
      'PROJ-144',
      'PROJ-131',
      'PROJ-118',
    ]);
    expect(keys(await page(adapter, { assignee: null }))).toEqual([
      'PROJ-145',
      'PROJ-142',
    ]);
  });

  it('filters by scope with the keys of the voyages that exist in Ahoy', async () => {
    const ahoyKeys = ['PROJ-140', 'PROJ-097', 'PROJ-999'];
    expect(keys(await page(adapter, { scope: 'in_ahoy', ahoyKeys }))).toEqual([
      'PROJ-140',
      'PROJ-097',
    ]);
    expect(
      (await page(adapter, { scope: 'not_started', ahoyKeys })).total
    ).toBe(7);
    expect((await page(adapter, { scope: 'all', ahoyKeys })).total).toBe(9);
  });

  it('treats a scope without keys as no voyage in Ahoy', async () => {
    expect((await page(adapter, { scope: 'in_ahoy' })).total).toBe(0);
    expect((await page(adapter, { scope: 'not_started' })).total).toBe(9);
  });

  it('combines the filters', async () => {
    const p = await page(adapter, {
      jiraStatus: 'To Do',
      assignee: null,
      q: 'vat',
    });
    expect(keys(p)).toEqual(['PROJ-145']);
  });

  it('pages with limit and cursor, and the last page has no cursor', async () => {
    const first = await page(adapter, { limit: 4 });
    expect(keys(first)).toEqual([
      'PROJ-145',
      'PROJ-140',
      'PROJ-144',
      'PROJ-131',
    ]);
    expect(first.total).toBe(9);
    expect(first.nextCursor).toBe('4');
    const second = await page(adapter, { limit: 4, cursor: first.nextCursor! });
    expect(keys(second)).toEqual([
      'PROJ-123',
      'PROJ-142',
      'PROJ-118',
      'PROJ-138',
    ]);
    const last = await page(adapter, { limit: 4, cursor: second.nextCursor! });
    expect(keys(last)).toEqual(['PROJ-097']);
    expect(last.nextCursor).toBeNull();
  });

  it('starts from the beginning for a cursor it did not give', async () => {
    for (const cursor of ['abc', '-3', '1.5', '9007199254740993']) {
      expect(keys(await page(adapter, { cursor, limit: 2 }))).toEqual([
        'PROJ-145',
        'PROJ-140',
      ]);
    }
  });

  it('always returns at least one item per page, even for a limit of zero', async () => {
    expect((await page(adapter, { limit: 0 })).items).toHaveLength(1);
    expect(DEFAULT_BACKLOG_PAGE_SIZE).toBeGreaterThan(9);
  });

  it('offers the filters of the whole backlog, not narrowed by the query', async () => {
    const narrowed = await page(adapter, {
      jiraStatus: 'Done',
      assignee: 'alex@example.com',
    });
    expect(narrowed.facets).toEqual({
      sprints: [],
      jiraStatuses: ['To Do', 'In Progress', 'Done'],
      assignees: [
        'alex@example.com',
        'jordan@example.com',
        'priya@example.com',
        'sam@example.com',
      ],
    });
  });
});
