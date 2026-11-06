import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import type { PlanPanel, PlanPanelMember } from '@core/api/types';
import { isPlanPanelList } from '@core/api/guards';
import { CLOCK, type Clock } from '@core/realtime/clock';
import { StoryStore } from '@core/stores/story-store';
import listStoryPlanPanels from '@testing/fixtures/listStoryPlanPanels.json';
import type { ManualClock } from '@testing/mock-backend/clock';
import type { MockRequest } from '@testing/mock-backend/http';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import {
  call,
  settle,
  testServer,
  type TestServer,
} from '@testing/mock-backend/spec-helpers';
import { CLOCK as UI_CLOCK } from '@ui/pipes/clock';
import { VOYAGE_ROUTES } from '../../voyage.routes';

const AIU = 1_000_000_000;

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return {
    now: () => new Date(manual.now()),
    schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }),
  };
}

interface Page {
  readonly mock: TestServer;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  /** Every request the mock answered, in order. */
  readonly requests: MockRequest[];
}

/** The voyage routes on the mock, opened at `url`. */
async function open(url: string, mock: TestServer): Promise<Page> {
  const { server, clock } = mock;
  const requests: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request) => {
    requests.push(request);
    return handle(request);
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [{ path: 'voyages/:key', children: VOYAGE_ROUTES }],
        withComponentInputBinding()
      ),
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(server),
      { provide: CLOCK, useValue: asClock(clock) },
      { provide: UI_CLOCK, useValue: () => new Date(clock.now()) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const page = {
    mock,
    harness,
    root: harness.fixture.nativeElement as HTMLElement,
    requests,
  };
  await flush(page);
  return page;
}

/** Lets requests, signals and navigations settle. */
async function flush(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
    page.harness.detectChanges();
    await page.harness.fixture.whenStable();
  }
}

/** The text of an element as a reader sees it: text nodes joined with a space, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  if (element === null || element === undefined) return '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    parts.push(node.textContent ?? '');
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)”])/g, '$1')
    .trim();
}

function story(server: MockAhoyServer, key: string): Record<string, unknown> {
  return call(server, 'GET', `/stories/${key}`).body as Record<string, unknown>;
}

/** Lets the simulated reconciler work, a second at a time, until `done` holds. */
function advanceUntil(
  { server, clock }: TestServer,
  key: string,
  done: (story: Record<string, unknown>) => boolean
): void {
  for (let i = 0; i < 120 && !done(story(server, key)); i++)
    clock.advance(1_000);
  if (!done(story(server, key))) throw new Error(`${key} never got there`);
}

/** A story planned by `mode`, started and brought to the point `until` names. */
function planned(
  mock: TestServer,
  key: string,
  mode: 'panel' | 'standard',
  until: 'asked' | 'review'
): void {
  const { server } = mock;
  call(server, 'POST', '/stories', {
    key,
    title: 'Show the due date',
    budgetNanoAiu: 40 * AIU,
    planningMode: mode,
  });
  advanceUntil(mock, key, (s) => s['status'] === 'awaiting_input');
  if (until === 'asked') return;
  const questions = call(server, 'GET', `/stories/${key}/questions`).body as {
    items: { id: string }[];
  };
  for (const q of questions.items)
    call(server, 'POST', `/stories/${key}/questions/${q.id}/answer`, {
      answer: 'POC test answer, not a product decision',
      expectedVersion: story(server, key)['version'],
    });
  advanceUntil(
    mock,
    key,
    (s) => s['phase'] === 'plan_review' && s['status'] === 'awaiting_decision'
  );
}

/** The section's panel, or null when the tab shows none. */
function section(page: Page): HTMLElement | null {
  const title = [...page.root.querySelectorAll('.ah-panel__title')].find(
    (h) => text(h) === 'Plan panel'
  );
  return title?.closest('section') ?? null;
}

/** The drafts' cards, best first. */
function cards(page: Page): HTMLElement[] {
  return [...(section(page)?.querySelectorAll<HTMLElement>('li.draft') ?? [])];
}

function showPlan(card: HTMLElement): HTMLButtonElement {
  const button = [...card.querySelectorAll('button')].find((b) =>
    /draft plan$/.test(text(b))
  );
  if (!button) throw new Error('no plan button');
  return button;
}

function panelPlanRequests(page: Page): MockRequest[] {
  return page.requests.filter((r) =>
    /^\/runs\/[^/]+\/plan-panel$/.test(r.path)
  );
}

/** Puts the fixture's panels on PROJ-123's runs, so a page can show a rated panel, an unrated one and a missing judge. */
function seedFixturePanels(
  server: MockAhoyServer,
  extra: PlanPanel[] = []
): void {
  const runs = (
    call(server, 'GET', '/stories/PROJ-123/runs').body as {
      items: { id: string; phase: string }[];
    }
  ).items.filter((r) => r.phase === 'planning');
  const voyage = server.state.voyages.get('PROJ-123')!;
  voyage.panels.length = 0;
  const list: unknown = listStoryPlanPanels;
  if (!isPlanPanelList(list))
    throw new Error('listStoryPlanPanels.json is no list');
  const fixtures = [...list.items].reverse();
  [...fixtures, ...extra].forEach((p, i) => {
    voyage.panels.push({ ...p, runId: runs[i]!.id, storyKey: 'PROJ-123' });
  });
}

afterEach(() => {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
});

describe('the Plan tab: Plan panel', () => {
  it('shows nothing new for a voyage planned by one planner, and does not read a draft', async () => {
    const page = await open('/voyages/PROJ-123/plan', testServer());
    expect(section(page)).toBeNull();
    expect(text(page.root)).not.toContain('Plan panel');
    expect(
      page.requests.filter((r) => r.path === '/stories/PROJ-123/plan-panels')
    ).not.toHaveLength(0);
    expect(panelPlanRequests(page)).toHaveLength(0);
  });

  it('shows the latest panel of a panel voyage: the judge, and the drafts best first with their scores', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'review');
    const page = await open('/voyages/PANEL-1/plan', mock);

    const panel = section(page)!;
    expect(panel).not.toBeNull();
    expect(text(panel.querySelector('.panel__judge'))).toContain(
      'Judge claude-opus-5.5 · high · 0.90 AIU'
    );
    expect(text(panel.querySelector('ah-panel-head'))).toContain(
      '3 of 3 planners finished, judged by claude-opus-5.5. Best draft: A, 8/10.'
    );
    expect(
      cards(page).map((c) => text(c.querySelector('.draft__head')))
    ).toEqual([
      'Draft A claude-haiku-4.5 · default Best draft',
      'Draft C gemini-3.8-flash · default',
      'Draft B gpt-5.6-terra · low',
    ]);
    expect(
      cards(page).map((c) => text(c.querySelector('.draft__score b')))
    ).toEqual(['8/10', '7/10', '6/10']);
    expect(text(panel.querySelector('.panel__summary'))).toContain(
      'Simulated judge'
    );
  });

  it('shows each draft with its end, its plan gate, its cost and what the judge said, as text', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'review');
    const page = await open('/voyages/PANEL-1/plan', mock);
    const first = text(cards(page)[0]);
    expect(first).toContain('Ended Finished');
    expect(first).toContain('Plan gate pass The plan passes all checks.');
    expect(first).toContain('Cost 0.25 AIU');
    expect(first).toContain(
      "Judge's reasons Simulated rating of draft A: no model judged it."
    );
    expect(first).toContain('Adopted Its work package split (simulated).');
    expect(first).toContain('Left out Nothing of note (simulated).');
  });

  it('shows the score as text and as a bar that a screen reader skips, so colour alone says nothing', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'review');
    const page = await open('/voyages/PANEL-1/plan', mock);
    const card = cards(page)[0]!;
    expect(text(card.querySelector('.draft__score b'))).toBe('8/10');
    const bar = card.querySelector<HTMLElement>('.draft__bar');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    expect(bar?.querySelector<HTMLElement>('i')?.style.width).toBe('80%');
  });

  it('reads a draft only when it is opened, once for the run, and shows it through the markdown component', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'review');
    const page = await open('/voyages/PANEL-1/plan', mock);
    expect(panelPlanRequests(page)).toHaveLength(0);

    const [a, c] = cards(page);
    expect(showPlan(a!).getAttribute('aria-expanded')).toBe('false');
    showPlan(a!).click();
    await flush(page);

    expect(panelPlanRequests(page)).toHaveLength(1);
    expect(showPlan(a!).getAttribute('aria-expanded')).toBe('true');
    expect(text(showPlan(a!))).toBe('Hide draft plan');
    expect(a!.querySelector('.ah-markdown h1')?.textContent).toBe(
      'Draft A for PANEL-1 (simulated)'
    );
    const controlled = showPlan(a!).getAttribute('aria-controls');
    expect(a!.querySelector(`#${controlled}`)).not.toBeNull();

    // Another draft of the same run does not read the run again.
    showPlan(c!).click();
    await flush(page);
    expect(panelPlanRequests(page)).toHaveLength(1);
    expect(c!.querySelector('.ah-markdown h1')?.textContent).toContain(
      'Draft C for PANEL-1'
    );

    showPlan(a!).click();
    await flush(page);
    expect(a!.querySelector('.ah-markdown')).toBeNull();
    expect(text(showPlan(a!))).toBe('Show draft plan');
  });

  it('lists earlier panel runs in a selector and shows the planners’ questions of the one chosen', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'review');
    const page = await open('/voyages/PANEL-1/plan', mock);
    const select = section(page)!.querySelector<HTMLSelectElement>(
      'select[aria-label="Panel run"]'
    )!;
    expect([...select.options].map((o) => text(o))).toEqual([
      expect.stringMatching(/^Latest · run panel-1-planning-/i),
      expect.stringMatching(/^Earlier · run panel-1-planning-/i),
    ]);

    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change'));
    await flush(page);

    const earlier = cards(page);
    expect(earlier).toHaveLength(3);
    expect(
      earlier.map((c) => text(c.querySelector('.draft__score b')))
    ).toEqual(['Not rated', 'Not rated', 'Not rated']);
    expect(text(earlier[0])).toContain('Questions the planner asked');
    expect(text(earlier[0])).toContain(
      'Which invoices does the due date apply to? Recommended: All open invoices.'
    );
    expect(text(section(page)!.querySelector('ah-panel-head'))).toContain(
      '3 of 3 planners finished'
    );
  });

  it('has no selector for a voyage with one panel run', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'asked');
    const page = await open('/voyages/PANEL-1/plan', mock);
    expect(cards(page)).toHaveLength(3);
    expect(section(page)!.querySelector('select')).toBeNull();
  });

  it('shows a panel when its planning run finishes, without the page being reloaded', async () => {
    const mock = testServer();
    call(mock.server, 'POST', '/stories', {
      key: 'PANEL-2',
      budgetNanoAiu: 40 * AIU,
      planningMode: 'panel',
    });
    advanceUntil(
      mock,
      'PANEL-2',
      (s) => s['phase'] === 'planning' && s['status'] === 'running'
    );
    const page = await open('/voyages/PANEL-2/plan', mock);
    expect(section(page)).toBeNull();

    for (let i = 0; i < 40 && section(page) === null; i++) {
      mock.clock.advance(1_000);
      await flush(page);
    }

    expect(section(page)).not.toBeNull();
    expect(cards(page)).toHaveLength(3);
  });

  it('keeps what it shows when a later read fails, and shows no error for it', async () => {
    const mock = testServer();
    planned(mock, 'PANEL-1', 'panel', 'asked');
    const page = await open('/voyages/PANEL-1/plan', mock);
    expect(cards(page)).toHaveLength(3);

    const handle = mock.server.handle.bind(mock.server);
    mock.server.handle = (request) => {
      if (request.path === '/stories/PANEL-1/plan-panels')
        mock.server.switches.failNext = 503;
      return handle(request);
    };
    const before = page.requests.length;
    answerAll(mock.server, 'PANEL-1');
    advanceUntil(mock, 'PANEL-1', (s) => s['status'] === 'awaiting_decision');
    // The event stream is not wired in this spec: read the runs, as an event would.
    await TestBed.inject(StoryStore).for('PANEL-1').runs.refresh();
    await flush(page);

    expect(
      page.requests
        .slice(before)
        .filter((r) => r.path === '/stories/PANEL-1/plan-panels')
    ).not.toHaveLength(0);
    expect(cards(page)).toHaveLength(3);
    expect(section(page)!.querySelector('select')).toBeNull();
    expect(section(page)!.querySelector('.ah-banner')).toBeNull();
  });

  describe('what did not go to plan', () => {
    it('says that the ratings could not be used, with the judge’s own words, and that no draft has a score', async () => {
      const mock = testServer();
      seedFixturePanels(mock.server);
      const page = await open('/voyages/PROJ-123/plan', mock);
      // The fixture's older panel has the problem; choose it.
      const select = section(page)!.querySelector<HTMLSelectElement>('select')!;
      select.value = [...select.options][1]!.value;
      select.dispatchEvent(new Event('change'));
      await flush(page);

      const panel = section(page)!;
      const banner = text(panel.querySelector('.ah-banner'));
      expect(banner).toContain("The judge's ratings could not be used");
      expect(banner).toContain(
        "The judge's ratings were not valid JSON, so no draft has a score."
      );
      expect(
        cards(page).map((c) => text(c.querySelector('.draft__score b')))
      ).toEqual(['Not rated', 'Not rated']);
      expect(text(panel.querySelector('ah-panel-head'))).toContain(
        'The ratings could not be used.'
      );
    });

    it('says which planner did not finish, how it ended and why, and what it asked', async () => {
      const mock = testServer();
      seedFixturePanels(mock.server);
      const page = await open('/voyages/PROJ-123/plan', mock);
      const panel = section(page)!;
      expect(text(panel.querySelector('.ah-banner'))).toContain(
        '1 planner did not finish'
      );
      const last = cards(page).at(-1)!;
      const words = text(last);
      expect(words).toContain('Draft C gemini-3.8-flash');
      expect(words).toContain('Not rated');
      expect(words).toContain(
        "Ended Ran out of time The planner did not finish within its share of the run's time."
      );
      expect(words).toContain('Plan gate Not checked');
      expect(words).toContain(
        "Questions the planner asked Should the due date follow the customer's time zone? Recommended: Use the billing account's time zone."
      );
    });

    it('says that a planner wrote no plan when it opens its draft', async () => {
      const mock = testServer();
      seedFixturePanels(mock.server);
      // The fixture panel's third planner has no plan: the API gives null.
      const page = await open('/voyages/PROJ-123/plan', mock);
      const last = cards(page).at(-1)!;
      showPlan(last).click();
      await flush(page);
      expect(text(last)).toContain('Planner C wrote no plan.');
      expect(last.querySelector('.ah-markdown')).toBeNull();
    });

    it('says that no judge ran when no planner finished, and that nothing was rated', async () => {
      const mock = testServer();
      seedFixturePanels(mock.server);
      const voyage = mock.server.state.voyages.get('PROJ-123')!;
      const latest = voyage.panels.at(-1)!;
      voyage.panels[voyage.panels.length - 1] = {
        ...latest,
        judge: null,
        summary: null,
        members: latest.members.map((m): PlanPanelMember => ({
          ...m,
          status: 'failed',
          error: 'The model is not enabled for this account.',
          gate: null,
          score: null,
        })),
      };
      const page = await open('/voyages/PROJ-123/plan', mock);
      const panel = section(page)!;
      expect(text(panel.querySelector('.panel__judge'))).toContain(
        'No judge ran.'
      );
      expect(text(panel.querySelector('ah-panel-head'))).toContain(
        '0 of 3 planners finished, so no judge ran.'
      );
      expect(text(panel.querySelector('.ah-banner'))).toContain(
        '3 planners did not finish'
      );
      expect(text(cards(page)[0])).toContain(
        'The model is not enabled for this account.'
      );
    });

    it('says it could not read a draft, and reads it again on Try again', async () => {
      const mock = testServer();
      planned(mock, 'PANEL-1', 'panel', 'review');
      const page = await open('/voyages/PANEL-1/plan', mock);
      mock.server.switches.failNext = 503;
      const a = cards(page)[0]!;
      showPlan(a).click();
      await flush(page);
      expect(a.querySelector('.ah-banner')).not.toBeNull();
      expect(a.querySelector('.ah-markdown')).toBeNull();

      const retry = [...a.querySelectorAll('button')].find(
        (b) => text(b) === 'Try again'
      )!;
      retry.click();
      await flush(page);
      expect(a.querySelector('.ah-banner')).toBeNull();
      expect(a.querySelector('.ah-markdown h1')).not.toBeNull();
      expect(panelPlanRequests(page)).toHaveLength(2);
    });
  });

  describe('what an agent wrote is never trusted', () => {
    const hostile =
      '<img src=x onerror="alert(1)"> <b>bold</b> <script>x()</script>';

    it('shows every free text of the panel as text, never as markup', async () => {
      const mock = testServer();
      seedFixturePanels(mock.server);
      const voyage = mock.server.state.voyages.get('PROJ-123')!;
      const latest = voyage.panels.at(-1)!;
      voyage.panels[voyage.panels.length - 1] = {
        ...latest,
        summary: hostile,
        ratingsProblem: hostile,
        members: latest.members.map((m) => ({
          ...m,
          error: hostile,
          rationale: hostile,
          adopted: hostile,
          leftOut: hostile,
          gate: m.gate === null ? null : { ...m.gate, message: hostile },
          questions: [{ text: hostile, recommendation: hostile }],
        })),
      };
      const page = await open('/voyages/PROJ-123/plan', mock);
      const panel = section(page)!;
      expect(panel.querySelector('img, script, [onerror]')).toBeNull();
      expect(
        [...panel.querySelectorAll('b')].map((b) => text(b))
      ).not.toContain('bold');
      expect(text(panel)).toContain('<img src=x onerror="alert(1)">');
      expect(text(panel.querySelector('.panel__summary'))).toBe(hostile);
    });

    it('shows a draft’s plan only through the markdown component, which drops raw HTML', async () => {
      const mock = testServer();
      planned(mock, 'PANEL-1', 'panel', 'review');
      const voyage = mock.server.state.voyages.get('PANEL-1')!;
      const latest = voyage.panels.at(-1)!;
      voyage.panels[voyage.panels.length - 1] = {
        ...latest,
        members: latest.members.map((m) => ({
          ...m,
          plan: `# Plan\n\n${hostile}\n\n[a link](javascript:alert(1))`,
        })),
      };
      const page = await open('/voyages/PANEL-1/plan', mock);
      const a = cards(page)[0]!;
      showPlan(a).click();
      await flush(page);
      const markdown = a.querySelector('.ah-markdown')!;
      expect(markdown.querySelector('img, script, [onerror]')).toBeNull();
      expect(markdown.querySelector('a[href^="javascript"]')).toBeNull();
      expect(markdown.querySelector('h1')?.textContent).toBe('Plan');
    });
  });
});

/** Answers every open question of a story, so that its planners go on. */
function answerAll(server: MockAhoyServer, key: string): void {
  const questions = call(server, 'GET', `/stories/${key}/questions`).body as {
    items: { id: string }[];
  };
  for (const q of questions.items)
    call(server, 'POST', `/stories/${key}/questions/${q.id}/answer`, {
      answer: 'POC test answer, not a product decision',
      expectedVersion: story(server, key)['version'],
    });
}
