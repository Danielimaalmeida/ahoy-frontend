import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { CLOCK, type Clock } from '@core/realtime/clock';
import type { ManualClock } from '@testing/mock-backend/clock';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import { settle, testServer } from '@testing/mock-backend/spec-helpers';
import { CLOCK as UI_CLOCK } from '@ui/pipes/clock';
import { VOYAGE_ROUTES } from '../../voyage.routes';

@Component({ selector: 'ah-test-voyages', template: `<p>Voyages list</p>` })
class VoyagesStub {}

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return {
    now: () => new Date(manual.now()),
    schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }),
  };
}

interface Page {
  readonly server: MockAhoyServer;
  readonly clock: ManualClock;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
}

/** The voyage routes on the mock backend, opened at `url`. */
async function open(url: string): Promise<Page> {
  const { server, clock } = testServer();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'voyages/:key', children: VOYAGE_ROUTES },
          { path: 'voyages', component: VoyagesStub },
        ],
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
    server,
    clock,
    harness,
    root: harness.fixture.nativeElement as HTMLElement,
  };
  await flush(page);
  return page;
}

/** Lets requests, signals and navigations settle. */
async function flush(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
    await page.harness.fixture.whenStable();
  }
}

/** Moves the mock's clock, then lets the stream, the refetches (300 ms apart) and the view settle. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 500) {
    page.clock.advance(500);
    await flush(page);
  }
}

/** The text of an element as a reader sees it: text nodes joined with a space, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  if (element === null || element === undefined) return '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    parts.push(node.textContent ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function tab(page: Page): HTMLElement {
  const element = page.root.querySelector<HTMLElement>('ah-runs-tab');
  if (element === null) throw new Error('no runs tab');
  return element;
}

function liveRows(page: Page): string[] {
  return [...tab(page).querySelectorAll('.ah-steps__row, .ah-steps__gap')].map(
    (row) => text(row)
  );
}

function tableRows(page: Page): string[][] {
  return [...tab(page).querySelectorAll('table tbody tr')].map((tr) =>
    [...tr.children].map((td) => text(td))
  );
}

describe('RunsTab on the mock backend', () => {
  describe('PROJ-140, under way', () => {
    it("shows the live panel: the crew member at work, the run's model and the live note", async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const panel = tab(page).querySelector('.runs__main');
      expect(text(panel?.querySelector('h2'))).toBe('Cartographer is at work');
      expect(text(panel)).toMatch(/proj-140-planning-\S+ · \S+ · \S+/);
      expect(text(panel)).toContain('Live, a few seconds behind the agent');
      expect(panel?.querySelector('.runs__pulse')).not.toBeNull();
    });

    it("shows run spend against the run's own cap, from the latest spend", async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const spend = tab(page).querySelector('.runs__spend');
      expect(text(spend)).toBe("Run spend 0.60 of this run's 8 AIU cap");
      const meter = spend?.querySelector('[role=meter]');
      expect(meter?.getAttribute('aria-valuetext')).toBe('0.60 of 8 AIU');
      expect(meter?.getAttribute('aria-valuenow')).toBe('8');
    });

    it("lists the steps with a '38 steps not shown' row before the batch that lost them, and a highlighted [REDACTED]", async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const rows = liveRows(page);
      expect(rows.some((row) => row === '38 steps not shown')).toBe(true);
      const gap = rows.indexOf('38 steps not shown');
      expect(gap).toBeGreaterThan(0);
      expect(rows[gap + 1]).toContain('bash');
      const redacted = tab(page).querySelectorAll('.ah-steps .ah-redacted');
      expect([...redacted].map((e) => text(e))).toEqual(['[REDACTED]']);
      expect(text(tab(page).querySelector('ah-live-steps'))).toContain(
        'This is a view, not a control'
      );
    });

    it('has no chat and no per-step action: the only controls are links', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const live = tab(page).querySelector('.runs__live');
      expect(
        live?.querySelectorAll('button, input, textarea, select').length
      ).toBe(0);
    });

    it("fills 'This run' and links to the run detail", async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const side = tab(page).querySelector('.runs__side');
      expect(text(side?.querySelector('h2'))).toBe('This run');
      expect(text(side?.querySelector('ah-outcome-pill'))).toBe('running');
      const labels = [...(side?.querySelectorAll('dt') ?? [])].map((e) =>
        text(e)
      );
      expect(labels).toEqual([
        'Agent',
        'Model',
        'Effort',
        'Started',
        'Started by',
        'Requests',
      ]);
      const link = side?.querySelector<HTMLAnchorElement>('a.runs__open');
      expect(text(link)).toBe('Open run detail');
      expect(link?.getAttribute('href')).toMatch(
        /^\/voyages\/PROJ-140\/runs\/proj-140-planning-001-\w+$/
      );
      expect(text(side?.querySelector('dd:nth-of-type(6)'))).toBe('9');
    });

    it('lists the run in the table with its live AIU and no gate yet', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const rows = tableRows(page);
      expect(rows.length).toBe(2);
      expect(rows[0]?.[1]).toBe('intake');
      expect(rows[0]?.[4]).toBe('succeeded');
      expect(rows[0]?.[8]).toBe('pass');
      const active = rows[1] ?? [];
      expect(active[1]).toBe('planning');
      expect(active[2]).toBe('Cartographer');
      expect(active[4]).toBe('running');
      expect(active[6]).toBe('—');
      expect(active[7]).toBe('0.60 live');
      expect(active[8]).toBe('—');
    });

    it('sees steps arrive and the spend rise, without a reload', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const before = liveRows(page).length;
      await advance(page, 1_000);
      expect(liveRows(page).length).toBeGreaterThan(before);
      expect(text(tab(page).querySelector('.runs__spend'))).toBe(
        "Run spend 1.08 of this run's 8 AIU cap"
      );
      expect(tableRows(page)[1]?.[7]).toBe('1.08 live');
    });

    it('when the run ends, swaps the live spend for the final one and keeps every step', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      await advance(page, 2_000);
      const during = liveRows(page);
      await advance(page, 4_000);
      const panel = tab(page).querySelector('.runs__main');
      expect(text(panel?.querySelector('h2'))).toBe(
        "Cartographer's run has ended"
      );
      expect(panel?.querySelector('.runs__pulse')).toBeNull();
      expect(text(panel)).toContain('The steps below are kept as history');
      expect(text(tab(page).querySelector('.runs__spend'))).toBe(
        "Run spent 1.80 of this run's 8 AIU cap"
      );
      const after = liveRows(page);
      expect(after.slice(0, during.length)).toEqual(during);
      expect(after.length).toBeGreaterThanOrEqual(during.length);
      const row = tableRows(page)[1] ?? [];
      expect(row[4]).toBe('succeeded');
      expect(row[7]).toBe('1.80');
      expect(row[8]).toBe('pass');
      expect(
        text(
          tab(page).querySelector(
            '.runs__side h2 + ah-outcome-pill, .runs__side ah-outcome-pill'
          )
        )
      ).toBe('succeeded');
    });

    it('does not scroll the list to the bottom once the reader has scrolled up', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const log = tab(page).querySelector<HTMLElement>('[role=log]');
      if (log === null) throw new Error('no log');
      // jsdom has no layout: give the box a height so that "scrolled up" means something.
      Object.defineProperties(log, {
        scrollHeight: { configurable: true, value: 1_000 },
        clientHeight: { configurable: true, value: 300 },
      });
      log.scrollTop = 100;
      log.dispatchEvent(new Event('scroll'));
      await advance(page, 1_000);
      expect(log.scrollTop).toBe(100);
    });
  });

  describe('the Runs table of other voyages', () => {
    it('PROJ-123: oldest first, each run a link to its detail, who started it', async () => {
      const page = await open('/voyages/PROJ-123/runs');
      const rows = tableRows(page);
      expect(rows.map((row) => row[1])).toEqual([
        'intake',
        'planning',
        'planning',
        'planning',
      ]);
      expect(rows.map((row) => row[4]).at(-1)).toBe('succeeded');
      const starts = [...tab(page).querySelectorAll('tbody tr')].map((tr) =>
        tr.querySelector('a')?.getAttribute('href')
      );
      expect(
        starts.every((href) =>
          /^\/voyages\/PROJ-123\/runs\/proj-123-/.test(href ?? '')
        )
      ).toBe(true);
      expect(rows[0]?.[9]).toBe('alex@example.com');
      expect(tab(page).querySelector('.runs__live')).toBeNull();
    });

    it('PROJ-109 has no runs yet: the empty state, no live panel', async () => {
      const page = await open('/voyages/PROJ-109/runs');
      expect(text(tab(page).querySelector('ah-empty-state'))).toContain(
        'No runs yet'
      );
      expect(tab(page).querySelector('table')).toBeNull();
      expect(tab(page).querySelector('.runs__live')).toBeNull();
    });
  });
});
