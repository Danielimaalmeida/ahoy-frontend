import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { CLOCK, type Clock } from '@core/realtime/clock';
import type { ManualClock } from '@testing/mock-backend/clock';
import type { MockRequest, MockResponse } from '@testing/mock-backend/http';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import { settle, testServer } from '@testing/mock-backend/spec-helpers';
import { CLOCK as UI_CLOCK } from '@ui/pipes/clock';
import { METRICS_ROUTES } from './metrics.routes';
import { metricsFailure } from './metrics-shell';

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return {
    now: () => new Date(manual.now()),
    schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }),
  };
}

interface Page {
  readonly server: MockAhoyServer;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  /** Every request the page made, in order. */
  readonly requests: MockRequest[];
}

/** Records the requests the server answers. */
function record(server: MockAhoyServer): MockRequest[] {
  const seen: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request: MockRequest): MockResponse => {
    seen.push(request);
    return handle(request);
  };
  return seen;
}

async function flush(page: { harness: RouterTestingHarness }): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
    page.harness.detectChanges();
    await page.harness.fixture.whenStable();
  }
}

/** The Metrics routes on the mock, opened at `url`. */
async function open(
  url: string,
  prepare: (server: MockAhoyServer) => void = () => undefined
): Promise<Page> {
  const { server, clock } = testServer();
  prepare(server);
  const requests = record(server);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'metrics', children: METRICS_ROUTES }]),
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(server),
      { provide: CLOCK, useValue: asClock(clock) },
      { provide: UI_CLOCK, useValue: () => new Date(clock.now()) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const page = {
    server,
    harness,
    requests,
    root: harness.fixture.nativeElement as HTMLElement,
  };
  await flush(page);
  return page;
}

/** The text of an element, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The tiles of the section, as "label value note". */
function tiles(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.kpi')).map((kpi) =>
    Array.from(kpi.children).map(text).join(' ')
  );
}

/** The panel whose heading is `heading`. */
function panel(root: HTMLElement, heading: string): HTMLElement {
  const title = Array.from(root.querySelectorAll('.ah-panel__title')).find(
    (h) => text(h) === heading
  );
  const section = title?.closest('section');
  if (!(section instanceof HTMLElement))
    throw new Error(`No panel "${heading}"`);
  return section;
}

/** The rows of a panel's table, as lists of cell texts. */
function rows(root: HTMLElement, heading: string): string[][] {
  return Array.from(panel(root, heading).querySelectorAll('tbody tr')).map(
    (tr) => Array.from(tr.querySelectorAll('th, td')).map(text)
  );
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (b) => text(b) === label
  );
  if (!found) throw new Error(`No button "${label}"`);
  return found;
}

function metricsQueries(page: Page): URLSearchParams[] {
  return page.requests.filter((r) => r.path === '/metrics').map((r) => r.query);
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe('Metrics', () => {
  it('opens on the overview, reads the last 30 days and the 30 before them to compare', async () => {
    const page = await open('/metrics');
    const [current, before] = metricsQueries(page);
    expect(current!.get('to')).toBe('2026-10-06T10:10:00.000Z');
    expect(current!.get('from')).toBe('2026-09-06T10:10:00.000Z');
    expect(before!.get('to')).toBe('2026-09-06T10:10:00.000Z');
    expect(before!.get('from')).toBe('2026-08-07T10:10:00.000Z');
    expect(tiles(page.root)).toEqual([
      'AIU spent 412.80 +0% vs previous 30 days',
      'AIU per finished voyage (median) 26.40 14 finished · 11 done · 3 blocked',
      'Halts 23 in 17 voyages 4 voyages halted again after Resume',
      'Gate pass on first run 78% 186 evaluations, 2 tooling errors',
    ]);
    expect(
      Array.from(page.root.querySelectorAll('.week-labels span')).map(text)
    ).toEqual(['14–20 Sep', '21–27 Sep', '28 Sep–4 Oct', '5–11 Oct']);
    expect(
      page.root.querySelector(
        'nav[aria-label="Metrics sections"] [aria-current="page"]'
      )?.textContent
    ).toContain('Overview');
  });

  it('lists the patterns the rules found and the five most common errors, as plain text', async () => {
    const page = await open('/metrics');
    const insights = panel(page.root, 'Where to improve the harness');
    expect(insights.querySelectorAll('.insight').length).toBeGreaterThan(0);
    const errors = rows(page.root, 'Most common errors');
    expect(errors.length).toBe(5);
    expect(errors[0]![0]).toBe('AC-# has no test_ids');
    expect(panel(page.root, 'Most common errors').innerHTML).not.toContain(
      '<script'
    );
  });

  it('shows the cost by phase with coloured swatches, its share of the period and a total, and links the voyages that spent most', async () => {
    const page = await open('/metrics/cost');
    const phases = rows(page.root, 'By phase');
    expect(phases.map((r) => r[0])).toEqual([
      'implementation',
      'pr_review',
      'planning',
      'rework',
      'intake',
    ]);
    expect(phases[0]!.slice(0, 4)).toEqual([
      'implementation',
      '52',
      '171.30',
      '41.5%',
    ]);
    const byPhase = panel(page.root, 'By phase');
    const swatches = Array.from(
      byPhase.querySelectorAll('tbody th .swatch')
    ).map((i) => Array.from(i.classList).find((c) => /^s\d$/.test(c)));
    expect(swatches).toEqual(['s1', 's2', 's3', 's4', 's5']);
    const bars = Array.from(
      byPhase.querySelectorAll<HTMLElement>('tbody .hbar__fill')
    );
    expect(bars[0]!.style.width).toBe('100%');
    expect(bars[0]!.classList).toContain('s1');
    const total = Array.from(
      byPhase.querySelectorAll('tfoot th, tfoot td')
    ).map(text);
    expect(total[0]).toBe('Total');
    expect(total.slice(3, 7)).toEqual(['', '', '', '']);
    const top = panel(page.root, 'Voyages by spend').querySelector('tbody a');
    expect(top?.getAttribute('href')).toBe('/voyages/PROJ-151');
  });

  it('explains each halt reason with who fixes it, and the halts a Resume did not fix', async () => {
    const page = await open('/metrics/halts');
    const reasons = rows(page.root, 'Halts by reason');
    expect(reasons[0]!.slice(0, 3)).toEqual([
      'budget_exhausted',
      'budget_exhausted',
      '7',
    ]);
    expect(reasons.map((r) => r[6])).toContain('Owner');
    expect(rows(page.root, 'Halted again after Resume').length).toBe(4);
  });

  it('charts the halts per week that repeated a known diagnosis, with each week by diagnosis in a table', async () => {
    const page = await open('/metrics/halts');
    const weeks = panel(page.root, 'Repeated halts per week');
    expect(weeks.querySelectorAll('.week')).toHaveLength(4);
    expect(
      Array.from(weeks.querySelectorAll('.week')).map((w) =>
        w.getAttribute('title')
      )
    ).toEqual([
      '14–20 Sep: 1 of 4 halts repeated',
      '21–27 Sep: 3 of 5 halts repeated',
      '28 Sep–4 Oct: 5 of 6 halts repeated',
      '5–11 Oct: 7 of 8 halts repeated',
    ]);
    expect(text(weeks.querySelector('.note'))).toBe(
      '16 of 23 halts repeated a known diagnosis; 7 of 8 in the last week (5–11 Oct).'
    );
    const table = rows(page.root, 'Repeated halts per week');
    expect(table).toHaveLength(17);
    expect(table[0]).toEqual(['14–20 Sep', 'budget_exhausted', '2', '2', '1']);
  });

  it('filters the common errors by kind, with a count on each kind', async () => {
    const page = await open('/metrics/halts');
    const all = rows(page.root, 'Common errors').length;
    button(page.root, `Tooling error ${1}`).click();
    await flush(page);
    const tooling = rows(page.root, 'Common errors');
    expect(tooling.length).toBe(1);
    expect(tooling.length).toBeLessThan(all);
    expect(tooling[0]![1]).toContain('Tooling error');
  });

  it('shows how each gate judged and how long people took, a tooling error apart from a failure', async () => {
    const page = await open('/metrics/gates');
    const gates = rows(page.root, 'Automated gates');
    const review = gates.find((r) => r[0] === 'review')!;
    expect(review.slice(4, 8)).toEqual(['17', '9', '3', '2']);
    const waits = rows(page.root, 'Human gates and waiting time');
    expect(waits.map((r) => r[0])).toContain('Plan review plan_accepted');
    expect(tiles(page.root)[3]).toBe(
      'Tooling errors 2 never counted as a failure'
    );
  });

  it('reads another period when one is chosen, and the filters when they are applied', async () => {
    const page = await open('/metrics');
    button(page.root, 'Last 7 days').click();
    await flush(page);
    const seven = metricsQueries(page).at(-2)!;
    expect(seven.get('from')).toBe('2026-09-29T10:10:00.000Z');

    const owner = page.root.querySelector<HTMLInputElement>(
      'input[aria-label="Owner"]'
    )!;
    owner.value = ' alex@example.com ';
    owner.dispatchEvent(new Event('input'));
    const model = page.root.querySelector<HTMLSelectElement>(
      'select[aria-label="Model"]'
    )!;
    expect(Array.from(model.options).map((o) => o.value)).toContain(
      'claude-sonnet-5'
    );
    model.value = 'claude-sonnet-5';
    model.dispatchEvent(new Event('change'));
    button(page.root, 'Apply').click();
    await flush(page);
    const filtered = metricsQueries(page).at(-2)!;
    expect(filtered.get('owner')).toBe('alex@example.com');
    expect(filtered.get('model')).toBe('claude-sonnet-5');
    expect(filtered.has('repo')).toBe(false);
  });

  it('saves the chosen table as the file the API names, for the period and filters on screen', async () => {
    const saved: Blob[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) saved.push(blob);
      return 'blob:metrics';
    };
    URL.revokeObjectURL = () => undefined;
    const names: string[] = [];
    const page = await open('/metrics');
    const listener = (event: Event) => {
      if (event.target instanceof HTMLAnchorElement) {
        names.push(event.target.download);
        event.preventDefault();
      }
    };
    document.addEventListener('click', listener, true);
    try {
      const table = page.root.querySelector<HTMLSelectElement>(
        'select[aria-label="Table to export"]'
      )!;
      table.value = 'halts';
      table.dispatchEvent(new Event('change'));
      button(page.root, 'Export CSV').click();
      await flush(page);
    } finally {
      document.removeEventListener('click', listener, true);
    }
    const request = page.requests.find((r) => r.path === '/metrics/export')!;
    const query = request.query;
    expect(query.get('table')).toBe('halts');
    expect(query.get('format')).toBe('csv');
    expect(query.get('to')).toBe('2026-10-06T10:10:00.000Z');
    expect(names).toEqual(['ahoy-halts-2026-10-06.csv']);
    expect(await saved[0]!.text()).toMatch(/^storyKey,at,reason,/);
    expect(text(page.root.querySelector('.metrics__status'))).toBe(
      'Saved ahoy-halts-2026-10-06.csv. Story text and agent output are not included.'
    );
  });

  it('says it cannot reach Ahoy instead of showing figures, and reads again on Try again', async () => {
    const page = await open('/metrics', (server) => {
      server.switches.failNext = 503;
    });
    expect(text(page.root.querySelector('ah-banner'))).toContain(
      "Can't reach Ahoy"
    );
    expect(page.root.querySelector('.kpi')).toBeNull();
    button(page.root, 'Try again').click();
    await flush(page);
    expect(page.root.querySelector('ah-banner')).toBeNull();
    expect(tiles(page.root).length).toBe(4);
  });
});

describe('metricsFailure', () => {
  it('never words an answer it cannot read as a verdict', () => {
    expect(
      metricsFailure({ kind: 'invalid_response', what: 'getMetrics: x' }).tech
    ).toBe('invalid_response · getMetrics: x');
    expect(metricsFailure({ kind: 'network', status: 503 }).heading).toBe(
      "Can't reach Ahoy"
    );
  });
});
