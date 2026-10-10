import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { Refinement, Story } from '@core/api/types';
import { AppConfigStore } from '@core/config/app-config';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { StoriesStore } from '@core/stores/stories-store';
import { CLOCK as UI_CLOCK } from '@ui/pipes/clock';
import {
  BACKLOG_PORT,
  type BacklogItem,
  type BacklogPage,
  type BacklogPort,
  type BacklogQuery,
} from './backlog-port';
import { REFINEMENT_POLL_MS } from './backlog-refinements';
import { Docks, priorityTrend } from './docks';
import { StubBacklogAdapter } from './stub-backlog-adapter';

/** An item for specs; fictional data. */
function anItem(key: string, changes: Partial<BacklogItem> = {}): BacklogItem {
  return {
    key,
    summary: `Summary of ${key}`,
    type: 'Story',
    jiraStatus: 'To Do',
    priority: 'Medium',
    assignee: null,
    updatedAt: '2026-10-06T09:00:00.000Z',
    sprint: null,
    ...changes,
  };
}

/** A refinement for specs, succeeded unless changed; fictional data. */
function aRefinement(
  key: string,
  changes: Partial<Refinement> = {}
): Refinement {
  const status = changes.status ?? 'succeeded';
  return {
    id: `${key.toLowerCase()}-refinement-001-abcd`,
    key,
    status,
    notes: null,
    requestedBy: 'alex@example.com',
    agent: 'quartermaster',
    model: null,
    reasoningEffort: null,
    runtime: 'k8s',
    controlSha: 'a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302',
    budgetNanoAiu: 10_000_000_000,
    usage: {
      requests: 6,
      nanoAiu: 2_400_000_000,
      inputTokens: 48_210,
      outputTokens: 3_120,
    },
    exitReason: null,
    cancelRequested: false,
    createdAt: '2026-10-06T09:30:00.000Z',
    startedAt: '2026-10-06T09:30:05.000Z',
    endedAt:
      status === 'queued' || status === 'running'
        ? null
        : '2026-10-06T09:34:00.000Z',
    content:
      status === 'succeeded'
        ? '## Verdict\nNEEDS WORK. No limit on export size.'
        : null,
    ...changes,
  };
}

/** A backlog written by the spec: it answers with `items` in pages of `size` and records every query. */
class FakeBacklog implements BacklogPort {
  readonly queries: BacklogQuery[] = [];
  /** What the next call answers instead, if set. */
  next: (() => Promise<ApiResult<BacklogPage>>) | null = null;

  constructor(
    private readonly items: readonly BacklogItem[],
    readonly planned = true,
    private readonly size = 100
  ) {}

  list(query: BacklogQuery): Promise<ApiResult<BacklogPage>> {
    this.queries.push(query);
    const override = this.next;
    this.next = null;
    if (override !== null) return override();
    const from = query.cursor === undefined ? 0 : Number(query.cursor);
    const to = from + this.size;
    return Promise.resolve(
      ok({
        items: this.items.slice(from, to),
        total: this.items.length,
        nextCursor: to < this.items.length ? String(to) : null,
        facets: {
          jiraStatuses: ['To Do', 'Done'],
          sprints: [
            ...new Map(
              this.items.flatMap((item) =>
                item.sprint === null
                  ? []
                  : [[item.sprint.id, item.sprint] as const]
              )
            ).values(),
          ],
          assignees: ['sam@example.com'],
        },
      })
    );
  }
}

describe('priorityTrend', () => {
  it('points up for urgent priorities, down for minor ones and flat for the rest, ignoring case', () => {
    expect(priorityTrend('High')).toBe('up');
    expect(priorityTrend(' HIGHEST ')).toBe('up');
    expect(priorityTrend('low')).toBe('down');
    expect(priorityTrend('Lowest')).toBe('down');
    expect(priorityTrend('Medium')).toBe('flat');
    expect(priorityTrend('P2')).toBe('flat');
    expect(priorityTrend('')).toBe('flat');
  });
});

describe('Docks', () => {
  let api: FakeApi;
  let clock: FakeClock;
  let stories: readonly Story[];
  /** Every refinement the fake API holds, newest first per key. */
  let refinements: Refinement[];
  let refinementsAnswer:
    (() => Promise<ApiResult<readonly Refinement[]>>) | null;
  let storiesAnswer:
    | (() => Promise<
        ApiResult<{ items: readonly Story[]; nextCursor: string | null }>
      >)
    | null;

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock('2026-10-06T10:00:00.000Z');
    stories = [];
    storiesAnswer = null;
    refinements = [];
    refinementsAnswer = null;
    api.on('listRefinements', () => {
      if (refinementsAnswer !== null) return refinementsAnswer();
      const newest = new Map<string, Refinement>();
      for (const r of refinements) if (!newest.has(r.key)) newest.set(r.key, r);
      return Promise.resolve(ok([...newest.values()]));
    });
    api.on('getRefinements', (key) =>
      Promise.resolve(
        ok({ key, items: refinements.filter((r) => r.key === key) })
      )
    );
    api.on(
      'listStories',
      () =>
        storiesAnswer?.() ??
        Promise.resolve(ok({ items: stories, nextCursor: null }))
    );
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({
          api,
          clock,
          net: new FakeFetch(),
        }),
        // The relative times of the pipes read the kit's own clock, not the realtime one.
        {
          provide: UI_CLOCK,
          useValue: () => new Date('2026-10-06T10:00:00.000Z'),
        },
        provideRouter([]),
      ],
    });
  });

  /** Opens the screen and waits for the backlog and the voyages to arrive. */
  async function mount(
    backlog: BacklogPort | null = null,
    jiraBaseUrl: string | null = null
  ): Promise<ComponentFixture<Docks>> {
    if (backlog !== null)
      TestBed.overrideProvider(BACKLOG_PORT, { useValue: backlog });
    if (jiraBaseUrl !== null) {
      TestBed.inject(AppConfigStore).set({
        apiBase: '/api/v1',
        actor: 'alex@example.com',
        jiraBaseUrl,
      });
    }
    const fixture = TestBed.createComponent(Docks);
    await refresh(fixture);
    return fixture;
  }

  async function refresh(fixture: ComponentFixture<Docks>): Promise<void> {
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  const root = (f: ComponentFixture<Docks>): HTMLElement =>
    f.nativeElement as HTMLElement;
  const rows = (f: ComponentFixture<Docks>): HTMLTableRowElement[] =>
    [...root(f).querySelectorAll('tbody tr')] as HTMLTableRowElement[];
  const text = (el: Element | null | undefined): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const cell = (
    row: HTMLTableRowElement,
    index: number
  ): HTMLTableCellElement => row.cells[index]!;
  const rowOf = (
    f: ComponentFixture<Docks>,
    key: string
  ): HTMLTableRowElement => {
    const row = rows(f).find((r) => text(cell(r, 0)) === key);
    if (row === undefined) throw new Error(`no row for ${key}`);
    return row;
  };
  const byLabel = <T extends Element>(
    f: ComponentFixture<Docks>,
    label: string
  ): T => root(f).querySelector<T>(`[aria-label="${label}"]`)!;
  const pill = (f: ComponentFixture<Docks>, name: string): HTMLButtonElement =>
    [
      ...root(f).querySelectorAll<HTMLButtonElement>(
        '[aria-label="Ahoy state"] button'
      ),
    ].find((b) => text(b) === name)!;

  async function type(
    f: ComponentFixture<Docks>,
    value: string
  ): Promise<void> {
    const input = byLabel<HTMLInputElement>(f, 'Search the backlog');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await refresh(f);
  }

  async function choose(
    f: ComponentFixture<Docks>,
    label: string,
    value: string
  ): Promise<void> {
    const select = byLabel<HTMLSelectElement>(f, label);
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await refresh(f);
  }

  describe('with the planned stub', () => {
    beforeEach(() => {
      TestBed.overrideProvider(BACKLOG_PORT, {
        useValue: new StubBacklogAdapter(new Date('2026-10-06T10:00:00.000Z')),
      });
      stories = [
        aStory('PROJ-140', { status: 'running', phase: 'planning' }),
        aStory('PROJ-131', { status: 'awaiting_input', phase: 'planning' }),
        aStory('PROJ-123', {
          status: 'awaiting_decision',
          phase: 'plan_review',
        }),
        aStory('PROJ-118', { status: 'halted', phase: 'planning' }),
        aStory('PROJ-097', { status: 'terminal', phase: 'done' }),
        aStory('PROJ-102', { status: 'terminal', phase: 'blocked' }),
      ];
    });

    it('says in plain sight that the screen is planned and the backlog is not in the API', async () => {
      const f = await mount();
      expect(text(root(f).querySelector('h1'))).toBe('Backlog');
      expect(text(root(f))).toContain('Planned screen.');
      expect(text(root(f))).toContain('The backlog is not in the API yet.');
    });

    it('shows the nine stories of the wireframe in its columns', async () => {
      const f = await mount();
      const heads = [...root(f).querySelectorAll('thead th')].map((th) =>
        text(th)
      );
      expect(heads).toEqual([
        'Key',
        'Summary',
        'Type',
        'Jira status',
        'Priority',
        'Assignee',
        'Updated',
        'Ahoy',
        'Actions',
      ]);
      expect(rows(f)).toHaveLength(9);
      const first = rows(f)[0]!;
      expect(text(cell(first, 0))).toBe('PROJ-145');
      expect(text(cell(first, 1))).toBe(
        'Show the VAT number on exported invoices'
      );
      expect(text(cell(first, 2))).toBe('Story');
      expect(text(cell(first, 3))).toBe('To Do');
      expect(text(cell(first, 4))).toBe('High');
      expect(text(cell(first, 5))).toBe('Unassigned');
      expect(text(cell(first, 6))).toBe('2 h ago');
      expect(text(root(f))).toContain(
        'Showing 9 of 9 · no bulk start: every voyage needs its own budget'
      );
    });

    it('joins the Ahoy column with the real voyages: not started, under way, and docked', async () => {
      const f = await mount();
      expect(text(cell(rowOf(f, 'PROJ-145'), 7))).toBe('Not started');
      const underWay = cell(rowOf(f, 'PROJ-140'), 7);
      expect(text(underWay)).toBe('Running planning');
      expect(underWay.querySelector('a')?.getAttribute('href')).toBe(
        '/voyages/PROJ-140'
      );
      expect(text(cell(rowOf(f, 'PROJ-131'), 7))).toBe(
        'Needs answers planning'
      );
      expect(text(cell(rowOf(f, 'PROJ-123'), 7))).toBe(
        'Needs decision plan_review'
      );
      expect(text(cell(rowOf(f, 'PROJ-118'), 7))).toBe('Halted planning');
      expect(text(cell(rowOf(f, 'PROJ-097'), 7))).toBe('Done done');
    });

    it('offers Set sail with the key and the summary for a story that is not started', async () => {
      const f = await mount();
      const link = cell(rowOf(f, 'PROJ-145'), 8).querySelector('a')!;
      expect(text(link)).toBe('Start voyage');
      expect(link.getAttribute('href')).toBe(
        '/voyages/new?key=PROJ-145&title=Show%20the%20VAT%20number%20on%20exported%20invoices'
      );
    });

    it('offers Open voyage, not Set sail, for a story that already has a voyage', async () => {
      const f = await mount();
      const actions = cell(rowOf(f, 'PROJ-123'), 8);
      expect(text(actions)).toBe('Refine Open voyage');
      expect(actions.querySelector('a')?.getAttribute('href')).toBe(
        '/voyages/PROJ-123'
      );
    });

    it('never offers a bulk start', async () => {
      const f = await mount();
      expect(text(root(f)).toLowerCase()).not.toContain('start all');
      expect(text(root(f))).toContain('no bulk start');
    });

    it('counts the stories and the voyages in Ahoy', async () => {
      const f = await mount();
      expect(text(root(f))).toContain('9 stories · 6 in Ahoy');
    });

    it('follows the voyages as they change, without reading the backlog again', async () => {
      const f = await mount();
      expect(text(cell(rowOf(f, 'PROJ-145'), 7))).toBe('Not started');
      TestBed.inject(StoriesStore).upsert(
        aStory('PROJ-145', { status: 'running', phase: 'planning' })
      );
      await refresh(f);
      expect(text(cell(rowOf(f, 'PROJ-145'), 7))).toBe('Running planning');
      expect(text(cell(rowOf(f, 'PROJ-145'), 8))).toBe('Refine Open voyage');
    });

    it('shows only the stories with no voyage under Not started', async () => {
      const f = await mount();
      pill(f, 'Not started').click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual([
        'PROJ-145',
        'PROJ-144',
        'PROJ-142',
        'PROJ-138',
      ]);
      expect(pill(f, 'Not started').getAttribute('aria-pressed')).toBe('true');
    });

    it('shows only the stories that have a voyage under In Ahoy', async () => {
      const f = await mount();
      pill(f, 'In Ahoy').click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual([
        'PROJ-140',
        'PROJ-131',
        'PROJ-123',
        'PROJ-118',
        'PROJ-097',
      ]);
      pill(f, 'All').click();
      await refresh(f);
      expect(rows(f)).toHaveLength(9);
    });

    it('searches by key or text', async () => {
      const f = await mount();
      await type(f, 'csv');
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(['PROJ-144']);
      expect(text(root(f))).toContain('1 story ·');
    });

    it('filters by Jira status and by assignee, and offers the values the backlog has', async () => {
      const f = await mount();
      const statuses = [
        ...byLabel<HTMLSelectElement>(f, 'Jira status').options,
      ].map((o) => o.text);
      expect(statuses).toEqual([
        'Jira status: all',
        'To Do',
        'In Progress',
        'Done',
      ]);
      const assignees = [
        ...byLabel<HTMLSelectElement>(f, 'Assignee').options,
      ].map((o) => o.text);
      expect(assignees).toEqual([
        'Assignee: anyone',
        'alex@example.com',
        'jordan@example.com',
        'priya@example.com',
        'sam@example.com',
        'Unassigned',
      ]);
      await choose(f, 'Jira status', 'Done');
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(['PROJ-097']);
      // The options do not shrink with the filter.
      expect(byLabel<HTMLSelectElement>(f, 'Jira status').options).toHaveLength(
        4
      );
      await choose(f, 'Jira status', '');
      await choose(f, 'Assignee', 'unassigned');
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual([
        'PROJ-145',
        'PROJ-142',
      ]);
      await choose(f, 'Assignee', 'sam@example.com');
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual([
        'PROJ-144',
        'PROJ-131',
        'PROJ-118',
      ]);
    });

    it('says which filter found nothing and clears every filter on request', async () => {
      const f = await mount();
      await type(f, 'no such story');
      pill(f, 'In Ahoy').click();
      await refresh(f);
      expect(rows(f)).toHaveLength(0);
      expect(text(root(f))).toContain('No stories match');
      const clear = [...root(f).querySelectorAll('button')].find(
        (b) => text(b) === 'Clear filters'
      )!;
      clear.click();
      await refresh(f);
      expect(rows(f)).toHaveLength(9);
      expect(byLabel<HTMLInputElement>(f, 'Search the backlog').value).toBe('');
      expect(pill(f, 'All').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('Jira links', () => {
    it('are not shown when no jiraBaseUrl is configured', async () => {
      const f = await mount(new FakeBacklog([anItem('PROJ-145')]));
      expect(text(root(f))).not.toContain('Jira ↗');
      expect(root(f).querySelector('a[title="Open in Jira"]')).toBeNull();
    });

    describe('sprint groups', () => {
      it('keeps every field and action available with labels for the stacked responsive layout', async () => {
        const f = await mount(
          new FakeBacklog([anItem('PROJ-1')], false),
          'https://jira.example.com'
        );
        const row = rowOf(f, 'PROJ-1');
        expect(
          [...row.querySelectorAll('td[data-label]')].map((cell) =>
            cell.getAttribute('data-label')
          )
        ).toEqual([
          'Type',
          'Jira status',
          'Priority',
          'Assignee',
          'Updated',
          'Ahoy',
        ]);
        expect(row.cells).toHaveLength(9);
        expect(
          [...row.cells[8]!.querySelectorAll('a')].map((link) => text(link))
        ).toEqual(['Jira ↗', 'Start voyage']);
      });

      const active = { id: 24, name: 'Sprint 24', state: 'active' } as const;
      const future = { id: 25, name: 'Sprint 25', state: 'future' } as const;
      const later = { id: 26, name: 'Sprint 26', state: 'future' } as const;
      const closed = { id: 23, name: 'Sprint 23', state: 'closed' } as const;
      const groups = (f: ComponentFixture<Docks>): HTMLDetailsElement[] => [
        ...root(f).querySelectorAll<HTMLDetailsElement>('details'),
      ];

      it('groups by sprint ID, orders active, future, closed and no sprint, and keeps row rank within each group', async () => {
        stories = [aStory('PROJ-2')];
        const f = await mount(
          new FakeBacklog(
            [
              anItem('PROJ-1'),
              anItem('PROJ-2', { sprint: active }),
              anItem('PROJ-3', { sprint: future }),
              anItem('PROJ-4', { sprint: active, jiraStatus: 'Done' }),
              anItem('PROJ-5', { sprint: later }),
              anItem('PROJ-6', { sprint: closed }),
            ],
            false
          )
        );
        expect(
          groups(f).map((group) =>
            text(group.querySelector('.docks__sprint-name'))
          )
        ).toEqual([
          'Sprint 24',
          'Sprint 25',
          'Sprint 26',
          'Sprint 23',
          'No sprint',
        ]);
        expect(groups(f).map((group) => group.open)).toEqual([
          true,
          true,
          false,
          false,
          true,
        ]);
        expect(text(groups(f)[0]!.querySelector('summary'))).toContain(
          '2 stories · 1 in Ahoy · 1 done in Jira'
        );
        expect(
          [
            ...groups(f)[0]!.querySelectorAll<HTMLTableRowElement>('tbody tr'),
          ].map((row) => text(row.cells[0]))
        ).toEqual(['PROJ-2', 'PROJ-4']);
        expect(text(groups(f)[4]!.querySelector('summary'))).toContain(
          'no sprint has picked up yet'
        );
      });

      it('collapses and expands all groups, and preserves an individually opened group after loading more', async () => {
        const f = await mount(
          new FakeBacklog(
            [
              anItem('PROJ-1', { sprint: active }),
              anItem('PROJ-2', { sprint: future }),
              anItem('PROJ-3', { sprint: active }),
            ],
            false,
            2
          )
        );
        const button = (label: string): HTMLButtonElement =>
          [...root(f).querySelectorAll('button')].find(
            (button) => text(button) === label
          )!;
        button('Collapse all').click();
        await refresh(f);
        expect(groups(f).every((group) => !group.open)).toBe(true);
        button('Expand all').click();
        await refresh(f);
        expect(groups(f).every((group) => group.open)).toBe(true);
        groups(f)[0]!.open = false;
        groups(f)[0]!.dispatchEvent(new Event('toggle'));
        await refresh(f);
        button('Load more').click();
        await refresh(f);
        expect(groups(f)[0]!.open).toBe(false);
        expect(groups(f)[0]!.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(groups(f)[1]!.open).toBe(true);
      });

      it('sends a validated sprint filter or no-sprint filter and clears it with the other filters', async () => {
        const backlog = new FakeBacklog(
          [anItem('PROJ-1', { sprint: active })],
          false
        );
        const f = await mount(backlog);
        await choose(f, 'Sprint', '24');
        expect(backlog.queries.at(-1)).toMatchObject({ sprintId: 24 });
        await choose(f, 'Sprint', 'no_sprint');
        expect(backlog.queries.at(-1)).toMatchObject({ sprintId: null });
        await type(f, 'no matches');
        // The fake records requests; use an empty answer to exercise Clear filters.
        backlog.next = () =>
          Promise.resolve(
            ok({
              items: [],
              total: 0,
              nextCursor: null,
              facets: { jiraStatuses: [], assignees: [], sprints: [active] },
            })
          );
        await type(f, 'another query');
        [...root(f).querySelectorAll('button')]
          .find((button) => text(button) === 'Clear filters')!
          .click();
        await refresh(f);
        expect(byLabel<HTMLSelectElement>(f, 'Sprint').value).toBe('');
        expect(backlog.queries.at(-1)).not.toHaveProperty('sprintId');
      });

      it('does not claim a group has zero voyages while the Ahoy store is unavailable', async () => {
        storiesAnswer = () => new Promise(() => undefined);
        const f = await mount(
          new FakeBacklog([anItem('PROJ-1', { sprint: active })], false)
        );
        expect(text(groups(f)[0]!.querySelector('summary'))).not.toContain(
          'in Ahoy'
        );
      });
    });

    it('open the story in Jira in a new tab when it is configured', async () => {
      const f = await mount(
        new FakeBacklog([anItem('PROJ-145'), anItem('A B/C-1')]),
        'https://jira.example.com'
      );
      const links = [
        ...root(f).querySelectorAll<HTMLAnchorElement>(
          'a[title="Open in Jira"]'
        ),
      ];
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        'https://jira.example.com/browse/PROJ-145',
        'https://jira.example.com/browse/A%20B%2FC-1',
      ]);
      expect(links[0]!.target).toBe('_blank');
      expect(links[0]!.rel).toBe('noopener noreferrer');
      expect(text(links[0])).toBe('Jira ↗');
    });
  });

  describe('with another backlog', () => {
    it('renders whatever adapter is provided, and drops the planned banner when it is not planned', async () => {
      const f = await mount(
        new FakeBacklog([anItem('REAL-1', { priority: 'Low' })], false)
      );
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(['REAL-1']);
      expect(text(root(f))).not.toContain('Planned screen.');
    });

    it('asks for the first page, with the page size and the scope, and no empty filters', async () => {
      const backlog = new FakeBacklog([anItem('PROJ-1')]);
      await mount(backlog);
      expect(backlog.queries).toEqual([{ scope: 'all', limit: 25 }]);
    });

    it('asks with each filter the person sets, and with the keys of the voyages for a scope', async () => {
      stories = [aStory('PROJ-2'), aStory('PROJ-1')];
      const backlog = new FakeBacklog([anItem('PROJ-1')]);
      const f = await mount(backlog);
      await type(f, ' vat ');
      await choose(f, 'Jira status', 'Done');
      await choose(f, 'Assignee', 'unassigned');
      pill(f, 'In Ahoy').click();
      await refresh(f);
      expect(backlog.queries.at(-1)).toEqual({
        q: 'vat',
        jiraStatus: 'Done',
        assignee: null,
        scope: 'in_ahoy',
        ahoyKeys: ['PROJ-1', 'PROJ-2'],
        limit: 25,
      });
    });

    it('loads more pages and appends them until there are no more', async () => {
      const items = ['PROJ-1', 'PROJ-2', 'PROJ-3', 'PROJ-4', 'PROJ-5'].map(
        (k) => anItem(k)
      );
      const backlog = new FakeBacklog(items, true, 2);
      const f = await mount(backlog);
      expect(rows(f)).toHaveLength(2);
      expect(text(root(f))).toContain('Showing 2 of 5');
      const more = (): HTMLButtonElement =>
        [...root(f).querySelectorAll('button')].find(
          (b) => text(b) === 'Load more'
        )!;
      more().click();
      await refresh(f);
      expect(rows(f)).toHaveLength(4);
      expect(backlog.queries.at(-1)).toMatchObject({ cursor: '2' });
      more().click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(
        items.map((i) => i.key)
      );
      expect(text(root(f))).toContain('Showing 5 of 5');
      expect(root(f).textContent).not.toContain('Load more');
    });

    it('shows an empty backlog as empty and not as a filter with no matches', async () => {
      const f = await mount(new FakeBacklog([]));
      expect(text(root(f))).toContain('The backlog is empty');
      expect(text(root(f))).not.toContain('Clear filters');
    });

    it('shows an error with Try again when the backlog cannot be read, and recovers', async () => {
      const backlog = new FakeBacklog([anItem('PROJ-1')]);
      backlog.next = () => Promise.resolve(fail({ kind: 'network' }));
      const f = await mount(backlog);
      expect(text(root(f))).toContain('Could not read the backlog');
      expect(rows(f)).toHaveLength(0);
      [...root(f).querySelectorAll('button')]
        .find((b) => text(b) === 'Try again')!
        .click();
      await refresh(f);
      expect(rows(f)).toHaveLength(1);
      expect(text(root(f))).not.toContain('Could not read the backlog');
    });

    it('shows placeholder rows until the first page arrives', async () => {
      const backlog = new FakeBacklog([anItem('PROJ-1')]);
      backlog.next = () => new Promise(() => undefined);
      const f = await mount(backlog);
      expect(root(f).querySelector('.ah-skeleton-rows')).not.toBeNull();
      expect(root(f).querySelector('section')?.getAttribute('aria-busy')).toBe(
        'true'
      );
      expect(rows(f)).toHaveLength(0);
    });

    it('drops the answer to a query that was replaced while it was in flight', async () => {
      const backlog = new FakeBacklog([anItem('PROJ-1')]);
      let release: (value: ApiResult<BacklogPage>) => void = () => undefined;
      backlog.next = () => new Promise((resolve) => (release = resolve));
      const f = await mount(backlog);
      await type(f, 'fresh');
      expect(rows(f)).toHaveLength(1);
      release(
        ok({
          items: [anItem('OLD-1')],
          total: 1,
          nextCursor: null,
          facets: { jiraStatuses: [], assignees: [], sprints: [] },
        })
      );
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(['PROJ-1']);
    });
  });

  describe('while the voyages are not known', () => {
    it('does not claim that a story is not started, and offers no Set sail, until the voyages are read', async () => {
      storiesAnswer = () => new Promise(() => undefined);
      const f = await mount(new FakeBacklog([anItem('PROJ-145')]));
      expect(text(cell(rowOf(f, 'PROJ-145'), 7))).toBe('');
      expect(root(f).querySelector('tbody ah-skeleton')).not.toBeNull();
      // Refining does not need a voyage, so only the voyage actions wait.
      expect(text(cell(rowOf(f, 'PROJ-145'), 8))).toBe('Refine');
    });

    it('does not read the backlog for Not started or In Ahoy until the voyages are read', async () => {
      storiesAnswer = () => new Promise(() => undefined);
      const backlog = new FakeBacklog([anItem('PROJ-145')]);
      const f = await mount(backlog);
      expect(backlog.queries).toHaveLength(1);
      pill(f, 'Not started').click();
      await refresh(f);
      expect(backlog.queries).toHaveLength(1);
      expect(rows(f)).toHaveLength(0);
      expect(root(f).querySelector('.ah-skeleton-rows')).not.toBeNull();
    });

    it('says so when the voyages cannot be read, and the scope filters wait for them', async () => {
      storiesAnswer = () => Promise.resolve(fail({ kind: 'network' }));
      const f = await mount(new FakeBacklog([anItem('PROJ-145')]));
      expect(text(root(f))).toContain('Could not read the voyages in Ahoy');
      expect(text(cell(rowOf(f, 'PROJ-145'), 7))).toBe('Unknown');
      expect(text(cell(rowOf(f, 'PROJ-145'), 8))).toBe('Refine');
      pill(f, 'In Ahoy').click();
      await refresh(f);
      expect(text(root(f))).toContain(
        'These filters need the voyages from Ahoy'
      );
      storiesAnswer = null;
      stories = [aStory('PROJ-145')];
      [...root(f).querySelectorAll('button')]
        .find((b) => text(b) === 'Try again')!
        .click();
      await refresh(f);
      expect(rows(f).map((r) => text(cell(r, 0)))).toEqual(['PROJ-145']);
    });
  });

  describe('refinements', () => {
    afterEach(() => {
      document.querySelector('.cdk-overlay-container')?.replaceChildren();
    });

    /** The open dialog (the CDK puts it in an overlay under `body`). */
    function dialog(): HTMLElement {
      const element = document.querySelector<HTMLElement>(
        '.cdk-overlay-container .ah-dialog'
      );
      if (element === null) throw new Error('no dialog open');
      return element;
    }

    const hasDialog = (): boolean =>
      document.querySelector('.cdk-overlay-container .ah-dialog') !== null;

    function buttonNamed(
      container: Element,
      label: string | RegExp
    ): HTMLButtonElement {
      const found = [...container.querySelectorAll('button')].find((b) =>
        typeof label === 'string' ? text(b) === label : label.test(text(b))
      );
      if (found === undefined) throw new Error(`no button ${String(label)}`);
      return found;
    }

    function fill(
      field: HTMLInputElement | HTMLTextAreaElement | null,
      value: string
    ): void {
      if (field === null) throw new Error('no field');
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }

    const detail = (
      f: ComponentFixture<Docks>,
      key: string
    ): HTMLElement | null =>
      root(f).querySelector<HTMLElement>(`#refinement-${key}`);

    /** The value of one fact of a detail row ("Spent" → "2.4 of 10 AIU"). */
    const fact = (row: HTMLElement, term: string): string =>
      text(
        [...row.querySelectorAll('dt')].find((dt) => text(dt) === term)
          ?.nextElementSibling
      );

    /** Clicks a row's "Refinement · …" toggle. */
    async function toggle(
      f: ComponentFixture<Docks>,
      key: string
    ): Promise<HTMLButtonElement> {
      const button = buttonNamed(cell(rowOf(f, key), 8), /^Refinement · /);
      button.click();
      await refresh(f);
      return button;
    }

    it('offers Refine on an item never refined and shows the state of the newest refinement of the others', async () => {
      refinements = [
        aRefinement('PROJ-2', { status: 'running' }),
        aRefinement('PROJ-3'),
        aRefinement('PROJ-4', { status: 'budget_exceeded' }),
        aRefinement('PROJ-5', { status: 'running', cancelRequested: true }),
      ];
      const f = await mount(
        new FakeBacklog(
          ['PROJ-1', 'PROJ-2', 'PROJ-3', 'PROJ-4', 'PROJ-5'].map((k) =>
            anItem(k)
          )
        )
      );
      const refineButton = buttonNamed(cell(rowOf(f, 'PROJ-1'), 8), 'Refine');
      expect(refineButton.getAttribute('aria-label')).toBe('Refine PROJ-1');
      expect(text(cell(rowOf(f, 'PROJ-2'), 8))).toContain(
        'Refinement · Refining'
      );
      expect(text(cell(rowOf(f, 'PROJ-3'), 8))).toContain(
        'Refinement · Refined'
      );
      expect(text(cell(rowOf(f, 'PROJ-4'), 8))).toContain(
        'Refinement · Failed'
      );
      expect(text(cell(rowOf(f, 'PROJ-5'), 8))).toContain(
        'Refinement · Cancelling'
      );
      expect(api.callsOf('listRefinements')).toHaveLength(1);
    });

    it('names every Refine and Refinement button by its item, so rows in the same state do not sound alike', async () => {
      refinements = [
        aRefinement('PROJ-2', { status: 'running' }),
        aRefinement('PROJ-3'),
        aRefinement('PROJ-4'),
      ];
      const f = await mount(
        new FakeBacklog(
          ['PROJ-1', 'PROJ-2', 'PROJ-3', 'PROJ-4'].map((k) => anItem(k))
        )
      );
      const names = ['PROJ-1', 'PROJ-2', 'PROJ-3', 'PROJ-4'].map((key) => {
        const button = cell(rowOf(f, key), 8).querySelector('button');
        return [
          button?.getAttribute('aria-label') ?? text(button),
          text(button),
        ];
      });
      expect(names).toEqual([
        ['Refine PROJ-1', 'Refine'],
        ['Refinement · Refining for PROJ-2', 'Refinement · Refining'],
        ['Refinement · Refined for PROJ-3', 'Refinement · Refined'],
        ['Refinement · Refined for PROJ-4', 'Refinement · Refined'],
      ]);
      // The visible words stay at the start of the name (WCAG 2.5.3, Label in Name).
      for (const [name, visible] of names)
        expect(name?.startsWith(visible ?? '\0')).toBe(true);
    });

    it('offers no Refine until the refinements are read, so a refinement in progress is never hidden', async () => {
      refinementsAnswer = () => new Promise(() => undefined);
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).not.toContain('Refine');
    });

    it('says when the refinements cannot be read, still offers Refine, and recovers with Try again', async () => {
      refinementsAnswer = () => Promise.resolve(fail({ kind: 'network' }));
      refinements = [aRefinement('PROJ-1')];
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      expect(text(root(f))).toContain('Could not read the refinements');
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toBe('Refine Start voyage');
      refinementsAnswer = null;
      buttonNamed(root(f), 'Try again').click();
      await refresh(f);
      expect(text(root(f))).not.toContain('Could not read the refinements');
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toBe(
        'Refinement · Refined Start voyage'
      );
    });

    it('opens and closes the detail row of a succeeded refinement, with its facts and the Markdown', async () => {
      refinements = [
        aRefinement('PROJ-1', { notes: 'Check the export limits' }),
      ];
      const f = await mount(
        new FakeBacklog([anItem('PROJ-1'), anItem('PROJ-2')])
      );
      expect(detail(f, 'PROJ-1')).toBeNull();
      const button = await toggle(f, 'PROJ-1');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(button.getAttribute('aria-controls')).toBe('refinement-PROJ-1');
      const row = detail(f, 'PROJ-1')!;
      expect(row.previousElementSibling).toBe(rowOf(f, 'PROJ-1'));
      expect(row.querySelector('td')?.getAttribute('colspan')).toBe('9');
      expect(fact(row, 'State')).toBe('Refined succeeded');
      expect(fact(row, 'Requested by')).toBe('alex@example.com · 30 m ago');
      expect(fact(row, 'Spent')).toBe('2.4 of 10 AIU');
      expect(fact(row, 'Notes')).toBe('Check the export limits');
      expect(text(row.querySelector('ah-markdown h2'))).toBe('Verdict');
      expect(text(row.querySelector('ah-markdown'))).toContain(
        'NEEDS WORK. No limit on export size.'
      );
      expect(buttonNamed(row, 'Refine again')).toBeDefined();
      expect(text(row)).not.toContain('Cancel refinement');
      expect(api.callsOf('getRefinements').map((c) => c.args)).toEqual([
        ['PROJ-1'],
      ]);
      await toggle(f, 'PROJ-1');
      expect(detail(f, 'PROJ-1')).toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.hasAttribute('aria-controls')).toBe(false);
    });

    it('shows why a refinement ended without content, and offers to refine again', async () => {
      refinements = [
        aRefinement('PROJ-1', {
          status: 'cancelled',
          exitReason: 'cancelled by sam@example.com: Asked for the wrong story',
          usage: { requests: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0 },
        }),
      ];
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      await toggle(f, 'PROJ-1');
      const row = detail(f, 'PROJ-1')!;
      expect(fact(row, 'State')).toBe('Cancelled cancelled');
      expect(fact(row, 'Spent')).toBe('0 of 10 AIU');
      expect(fact(row, 'Exit reason')).toBe(
        'cancelled by sam@example.com: Asked for the wrong story'
      );
      expect(row.querySelector('ah-markdown')).toBeNull();
      expect(buttonNamed(row, 'Refine again')).toBeDefined();
    });

    it('says when the refinement cannot be read and reads it again on Try again', async () => {
      refinements = [aRefinement('PROJ-1')];
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      api.on('getRefinements', () =>
        Promise.resolve(fail({ kind: 'network' }))
      );
      await toggle(f, 'PROJ-1');
      expect(text(detail(f, 'PROJ-1'))).toContain(
        'Could not read the refinement'
      );
      expect(detail(f, 'PROJ-1')!.querySelector('ah-markdown')).toBeNull();
      api.on('getRefinements', (key) =>
        Promise.resolve(
          ok({ key, items: refinements.filter((r) => r.key === key) })
        )
      );
      buttonNamed(detail(f, 'PROJ-1')!, 'Try again').click();
      await refresh(f);
      expect(text(detail(f, 'PROJ-1')!.querySelector('ah-markdown'))).toContain(
        'NEEDS WORK'
      );
    });

    it('reads a refinement in progress again every few seconds until it ends, then stops', async () => {
      refinements = [
        aRefinement('PROJ-1', {
          status: 'running',
          usage: {
            requests: 1,
            nanoAiu: 300_000_000,
            inputTokens: 1,
            outputTokens: 1,
          },
        }),
      ];
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      await toggle(f, 'PROJ-1');
      expect(text(detail(f, 'PROJ-1'))).toContain(
        'The agent is refining it; checked again every 5 s.'
      );
      expect(fact(detail(f, 'PROJ-1')!, 'Spent')).toBe('0.3 of 10 AIU');
      expect(clock.delays).toEqual([REFINEMENT_POLL_MS]);
      await clock.advance(REFINEMENT_POLL_MS);
      await refresh(f);
      expect(api.callsOf('listRefinements')).toHaveLength(2);
      // Nothing moved, so the open row's history is not read again.
      expect(api.callsOf('getRefinements')).toHaveLength(1);
      refinements = [aRefinement('PROJ-1')];
      await clock.advance(REFINEMENT_POLL_MS);
      await refresh(f);
      expect(api.callsOf('listRefinements')).toHaveLength(3);
      expect(api.callsOf('getRefinements')).toHaveLength(2);
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toContain(
        'Refinement · Refined'
      );
      expect(text(detail(f, 'PROJ-1')!.querySelector('ah-markdown'))).toContain(
        'NEEDS WORK'
      );
      expect(clock.pending).toBe(0);
    });

    it('polls nothing when no refinement is in progress, and stops polling when the page closes', async () => {
      refinements = [aRefinement('PROJ-1')];
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      expect(clock.pending).toBe(0);
      refinements = [aRefinement('PROJ-1', { status: 'queued' })];
      buttonNamed(root(f), /^Refinement · /).click();
      await refresh(f);
      expect(clock.pending).toBe(1);
      f.destroy();
      expect(clock.pending).toBe(0);
    });

    it('asks for a refinement with the notes and the AIU limit, confirms the spend and opens the queued row', async () => {
      api.on('requestRefinement', (key, body) => {
        const queued = aRefinement(key, {
          status: 'queued',
          notes: body.notes ?? null,
          budgetNanoAiu: body.budgetNanoAiu ?? 10_000_000_000,
          usage: { requests: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0 },
          startedAt: null,
        });
        refinements = [queued];
        return Promise.resolve(ok(queued));
      });
      const f = await mount(
        new FakeBacklog([
          anItem('PROJ-1', { summary: 'Export invoices as CSV' }),
        ])
      );
      buttonNamed(cell(rowOf(f, 'PROJ-1'), 8), 'Refine').click();
      await refresh(f);
      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe('Refine PROJ-1?');
      expect(text(d)).toContain('(Export invoices as CSV)');
      expect(text(d)).toContain('Nothing is written to Jira.');
      expect(text(d.querySelector('ah-banner'))).toContain(
        "This may spend AIU, up to the server's refinement cap"
      );
      expect(text(d.querySelector('ah-banner'))).toContain(
        "not charged to any voyage's budget"
      );
      expect(buttonNamed(d, 'Refine')).toBeDefined();
      fill(d.querySelector('textarea'), '  Check the export limits  ');
      fill(d.querySelector('input'), '2.5');
      await refresh(f);
      expect(text(d.querySelector('ah-banner'))).toContain(
        'This may spend up to 2.5 AIU'
      );
      buttonNamed(d, 'Refine · up to 2.5 AIU').click();
      await refresh(f);
      expect(api.callsOf('requestRefinement').map((c) => c.args)).toEqual([
        [
          'PROJ-1',
          {
            confirmSpend: true,
            notes: 'Check the export limits',
            budgetNanoAiu: 2_500_000_000,
          },
        ],
      ]);
      expect(hasDialog()).toBe(false);
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toContain(
        'Refinement · Queued'
      );
      const row = detail(f, 'PROJ-1')!;
      expect(fact(row, 'Spent')).toBe('0 of 2.5 AIU');
      expect(text(row)).toContain(
        'Waiting for a run slot; checked again every 5 s.'
      );
      expect(buttonNamed(row, 'Cancel refinement')).toBeDefined();
      expect(clock.delays).toEqual([REFINEMENT_POLL_MS]);
    });

    it('sends only confirmSpend when the notes and the limit are left empty', async () => {
      api.on('requestRefinement', (key) =>
        Promise.resolve(ok(aRefinement(key, { status: 'queued' })))
      );
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      buttonNamed(cell(rowOf(f, 'PROJ-1'), 8), 'Refine').click();
      await refresh(f);
      fill(dialog().querySelector('textarea'), '   ');
      buttonNamed(dialog(), 'Refine').click();
      await refresh(f);
      expect(api.callsOf('requestRefinement').map((c) => c.args)).toEqual([
        ['PROJ-1', { confirmSpend: true }],
      ]);
    });

    it('refuses an AIU limit that is not an amount above zero and at most 20, without a request', async () => {
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      buttonNamed(cell(rowOf(f, 'PROJ-1'), 8), 'Refine').click();
      await refresh(f);
      fill(dialog().querySelector('input'), '1e3');
      buttonNamed(dialog(), 'Refine').click();
      await refresh(f);
      expect(text(dialog().querySelector('.ah-field__error'))).toBe(
        'Type an amount in AIU, such as 5 or 2.5.'
      );
      fill(dialog().querySelector('input'), '0');
      await refresh(f);
      expect(text(dialog().querySelector('.ah-field__error'))).toBe(
        'The limit must be above 0 AIU.'
      );
      fill(dialog().querySelector('input'), '20.5');
      await refresh(f);
      expect(text(dialog().querySelector('.ah-field__error'))).toBe(
        'The limit may be at most 20 AIU.'
      );
      expect(api.callsOf('requestRefinement')).toHaveLength(0);
    });

    it('keeps the dialog open with a notice when a refinement is already in progress, and reads the refinements again', async () => {
      api.on('requestRefinement', () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 409,
            code: 'invalid_state',
            title: 'Invalid state',
            detail: 'PROJ-1 already has a refinement in progress',
          })
        )
      );
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      buttonNamed(cell(rowOf(f, 'PROJ-1'), 8), 'Refine').click();
      await refresh(f);
      refinements = [
        aRefinement('PROJ-1', {
          status: 'running',
          requestedBy: 'sam@example.com',
        }),
      ];
      fill(dialog().querySelector('textarea'), 'Look at the limits');
      buttonNamed(dialog(), 'Refine').click();
      await refresh(f);
      const banner = text(dialog().querySelector('ah-banner'));
      expect(banner).toContain(
        'This item already has a refinement in progress'
      );
      expect(banner).toContain('PROJ-1 already has a refinement in progress');
      expect(dialog().querySelector('textarea')?.value).toBe(
        'Look at the limits'
      );
      expect(api.callsOf('listRefinements')).toHaveLength(2);
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toContain(
        'Refinement · Refining'
      );
    });

    it('says refinement is not available when the server has none configured', async () => {
      api.on('requestRefinement', () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 503,
            code: 'unavailable',
            title: 'Unavailable',
          })
        )
      );
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      buttonNamed(cell(rowOf(f, 'PROJ-1'), 8), 'Refine').click();
      await refresh(f);
      buttonNamed(dialog(), 'Refine').click();
      await refresh(f);
      expect(text(dialog().querySelector('ah-banner'))).toContain(
        "Refinement isn't available"
      );
    });

    it('asks again from the detail row of an ended refinement', async () => {
      refinements = [aRefinement('PROJ-1')];
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      await toggle(f, 'PROJ-1');
      buttonNamed(detail(f, 'PROJ-1')!, 'Refine again').click();
      await refresh(f);
      expect(text(dialog().querySelector('.ah-dialog__title'))).toBe(
        'Refine PROJ-1?'
      );
    });

    it('cancels a refinement in progress with a required reason and shows it cancelled', async () => {
      refinements = [
        aRefinement('PROJ-1', { status: 'queued', startedAt: null }),
      ];
      api.on('cancelRefinement', (key, body) => {
        const cancelled = aRefinement(key, {
          status: 'cancelled',
          cancelRequested: true,
          exitReason: `cancelled by alex@example.com: ${body.reason}`,
          usage: { requests: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0 },
        });
        refinements = [cancelled];
        return Promise.resolve(ok(cancelled));
      });
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      await toggle(f, 'PROJ-1');
      buttonNamed(detail(f, 'PROJ-1')!, 'Cancel refinement').click();
      await refresh(f);
      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe(
        'Cancel the refinement of PROJ-1?'
      );
      expect(text(d)).toContain('it ends at once and spends nothing');
      fill(d.querySelector('textarea'), '   ');
      buttonNamed(d, 'Cancel refinement').click();
      await refresh(f);
      expect(text(d.querySelector('.ah-field__error'))).toBe(
        'A reason is required.'
      );
      expect(api.callsOf('cancelRefinement')).toHaveLength(0);
      fill(d.querySelector('textarea'), ' Asked for the wrong story ');
      buttonNamed(d, 'Cancel refinement').click();
      await refresh(f);
      expect(api.callsOf('cancelRefinement').map((c) => c.args)).toEqual([
        ['PROJ-1', { reason: 'Asked for the wrong story' }],
      ]);
      expect(hasDialog()).toBe(false);
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toContain(
        'Refinement · Cancelled'
      );
      expect(fact(detail(f, 'PROJ-1')!, 'Exit reason')).toBe(
        'cancelled by alex@example.com: Asked for the wrong story'
      );
      expect(clock.pending).toBe(0);
    });

    it('shows a running refinement as cancelling until it ends, without a second Cancel', async () => {
      refinements = [aRefinement('PROJ-1', { status: 'running' })];
      api.on('cancelRefinement', (key) =>
        Promise.resolve(
          ok(aRefinement(key, { status: 'running', cancelRequested: true }))
        )
      );
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      await toggle(f, 'PROJ-1');
      buttonNamed(detail(f, 'PROJ-1')!, 'Cancel refinement').click();
      await refresh(f);
      expect(text(dialog())).toContain('What it spent so far stays spent');
      fill(dialog().querySelector('textarea'), 'Not needed');
      buttonNamed(dialog(), 'Cancel refinement').click();
      await refresh(f);
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toContain(
        'Refinement · Cancelling'
      );
      expect(text(detail(f, 'PROJ-1'))).toContain('Stopping the agent');
      expect(text(detail(f, 'PROJ-1'))).not.toContain('Cancel refinement');
    });

    it('tells a cancel that comes too late that nothing is left to cancel', async () => {
      refinements = [aRefinement('PROJ-1', { status: 'running' })];
      api.on('cancelRefinement', () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 409,
            code: 'invalid_state',
            title: 'Invalid state',
          })
        )
      );
      const f = await mount(new FakeBacklog([anItem('PROJ-1')]));
      await toggle(f, 'PROJ-1');
      buttonNamed(detail(f, 'PROJ-1')!, 'Cancel refinement').click();
      await refresh(f);
      refinements = [aRefinement('PROJ-1')];
      fill(dialog().querySelector('textarea'), 'Not needed');
      buttonNamed(dialog(), 'Cancel refinement').click();
      await refresh(f);
      expect(text(dialog().querySelector('ah-banner'))).toContain(
        'Nothing to cancel any more'
      );
      expect(text(cell(rowOf(f, 'PROJ-1'), 8))).toContain(
        'Refinement · Refined'
      );
      expect(text(detail(f, 'PROJ-1')!.querySelector('ah-markdown'))).toContain(
        'NEEDS WORK'
      );
    });
  });
});
