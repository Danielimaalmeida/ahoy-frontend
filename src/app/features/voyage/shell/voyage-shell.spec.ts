import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CLOCK, type Clock } from '@core/realtime/clock';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
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
import { ToastService } from '@ui/toast/toast';
import { VOYAGE_ROUTES } from '../voyage.routes';

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
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  /** Every request the mock answered, in order. */
  readonly requests: MockRequest[];
}

/** Options of {@link open}. */
interface OpenOptions {
  /** A server and its clock to use (to change it first); a fresh seeded one by default. */
  readonly mock?: TestServer;
  /** Runs before the mock answers each request: a spec sets a switch for one request here. */
  readonly before?: (request: MockRequest) => void;
}

/** The voyage routes on the mock, opened at `url`. */
async function open(url: string, options: OpenOptions = {}): Promise<Page> {
  const { server, clock } = options.mock ?? testServer();
  const requests: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request) => {
    requests.push(request);
    options.before?.(request);
    return handle(request);
  };
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
    harness,
    root: harness.fixture.nativeElement as HTMLElement,
    requests,
  };
  await flush(page);
  return page;
}

/** The story as the mock holds it now, read past the page's request log. */
function storyOf(
  server: MockAhoyServer,
  key: string
): { version: number; spentNanoAiu: number } {
  return call(server, 'GET', `/stories/${key}`).body as {
    version: number;
    spentNanoAiu: number;
  };
}

/** Lets requests, signals and navigations settle. */
async function flush(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await settle();
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

function header(page: Page): HTMLElement {
  const element = page.root.querySelector<HTMLElement>('ah-voyage-header');
  if (element === null) throw new Error('no header');
  return element;
}

function buttonsIn(element: Element): string[] {
  return [
    ...element.querySelectorAll('.header__actions a, .header__actions button'),
  ].map((b) => text(b));
}

/** The open dialog (the CDK puts it in an overlay under `body`). */
function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '.cdk-overlay-container .ah-dialog'
  );
  if (element === null) throw new Error('no dialog open');
  return element;
}

function hasDialog(): boolean {
  return document.querySelector('.cdk-overlay-container .ah-dialog') !== null;
}

function click(element: Element | null | undefined): void {
  if (!(element instanceof HTMLElement)) throw new Error('nothing to click');
  element.click();
}

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

function type(
  field: HTMLInputElement | HTMLTextAreaElement | null,
  value: string
): void {
  if (field === null) throw new Error('no field');
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

/** The commands (POSTs) the mock received. */
function commands(page: Page): MockRequest[] {
  return page.requests.filter((request) => request.method === 'POST');
}

afterEach(() => {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
});

describe('VoyageShell on the mock backend', () => {
  describe('header, primary action and banner for the eight seeded voyages', () => {
    it('PROJ-123 waits on the plan decision: Your orders, plan_accepted, round 2 of 4, Decide on the plan', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe(
        'Needs decision awaiting_decision · plan_accepted'
      );
      expect(text(h.querySelector('h1'))).toBe(
        'Show invoice due date on the billing page'
      );
      expect(buttonsIn(h)).toEqual([
        'Decide on the plan',
        'Budget',
        'Models',
        'Stop',
      ]);
      expect(
        h
          .querySelector<HTMLAnchorElement>('.header__actions a')
          ?.getAttribute('href')
      ).toBe('/voyages/PROJ-123/plan');
      expect(text(h.querySelector('.header__meta'))).toContain(
        'Revision round 2 of 4'
      );
      expect(text(h.querySelector('.header__meta'))).toContain(
        'Owner · billed alex@example.com'
      );
      expect(page.root.querySelector('ah-anchored-banner section')).toBeNull();
    });

    it('PROJ-131 has questions open: Crew asks, Answer questions', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe(
        'Needs answers awaiting_input'
      );
      expect(buttonsIn(h)).toEqual([
        'Answer questions',
        'Budget',
        'Models',
        'Stop',
      ]);
    });

    it('PROJ-140 is under way: no primary action, the current run and its crew member', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe('Running running');
      expect(buttonsIn(h)).toEqual(['Budget', 'Models', 'Stop']);
      expect(text(h.querySelector('.header__meta'))).toMatch(
        /Current run proj-140-planning-\S+ · Cartographer/
      );
      expect(text(h.querySelector('.header__meta'))).not.toContain(
        'Revision round'
      );
    });

    it('PROJ-109 is queued: no primary action, no run yet', async () => {
      const page = await open('/voyages/PROJ-109/runs');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe('Queued ready');
      expect(buttonsIn(h)).toEqual(['Budget', 'Models', 'Stop']);
      expect(text(h.querySelector('.header__meta'))).toContain(
        'Current run none'
      );
    });

    it('PROJ-118 anchored after a failed run: Resume…, the banner with guidance, tech line and worker log', async () => {
      const page = await open('/voyages/PROJ-118/models');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe(
        'Halted halted · run_failed'
      );
      expect(buttonsIn(h)).toEqual(['Resume…', 'Budget', 'Change models']);
      expect(text(h.querySelector('.header__meta'))).toMatch(
        /none · last proj-118-implementation-\S+ \(failed\)/
      );

      const banner = page.root.querySelector('ah-anchored-banner section');
      expect(text(banner?.querySelector('h2'))).toBe(
        "Halted: A crew member's run failed, for example a refused model or a crash"
      );
      expect(text(banner)).toContain(
        'The worker exited with code 1 before it wrote a result.'
      );
      expect(text(banner)).toContain(
        "To continue: pick a model this account can use for implementation, or fix what the run's log points at, then resume."
      );
      expect(text(banner?.querySelector('.ah-tech'))).toMatch(
        /^run_failed · proj-118-implementation-\S+ · implementation · .+ ago · “The worker exited with code 1 before it wrote a result\.”$/
      );
      expect(banner?.querySelector('pre')?.textContent).toContain(
        'token [REDACTED] refused by the registry'
      );
      const change = banner?.querySelector<HTMLAnchorElement>('a');
      expect(text(change)).toBe('Change implementation model');
      expect(change?.getAttribute('href')).toBe(
        '/voyages/PROJ-118/models?change=implementation'
      );
      expect(banner && buttonNamed(banner, 'Resume as is')).toBeTruthy();
    });

    it('PROJ-126 stopped by a person: their reason in the banner, no run buttons', async () => {
      const page = await open('/voyages/PROJ-126/models');
      expect(text(header(page).querySelector('ah-status-badge'))).toBe(
        'Halted halted · stopped_by_user'
      );
      const banner = page.root.querySelector('ah-anchored-banner section');
      expect(text(banner?.querySelector('h2'))).toBe(
        'Halted: Someone on the crew stopped it'
      );
      expect(text(banner)).toContain(
        "Stopped by priya@example.com. Their reason: “Waiting for the compliance team's answer on retention.”"
      );
      expect(banner?.querySelectorAll('a, button')).toHaveLength(0);
    });

    it('PROJ-097 is docked: no primary action, no Stop, Budget or Resume', async () => {
      const page = await open('/voyages/PROJ-097/plan');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe('Done terminal');
      expect(buttonsIn(h)).toEqual(['Models']);
      expect(h.querySelectorAll('.ah-step--done')).toHaveLength(7);
    });

    it('PROJ-102 ran aground: the stepper stops at the phase it was in', async () => {
      const page = await open('/voyages/PROJ-102/plan');
      const h = header(page);
      expect(text(h.querySelector('ah-status-badge'))).toBe('Blocked terminal');
      expect(buttonsIn(h)).toEqual(['Models']);
      expect(text(h.querySelector('.ah-step--stopped'))).toBe('! plan_review');
      expect(page.root.querySelector('ah-anchored-banner section')).toBeNull();
    });
  });

  describe('page states and tabs', () => {
    it('opens the default tab for the status at /voyages/:key', async () => {
      const cases = [
        ['PROJ-123', 'plan'],
        ['PROJ-131', 'questions'],
        ['PROJ-140', 'runs'],
        ['PROJ-118', 'models'],
        ['PROJ-097', 'plan'],
      ] as const;
      for (const [key, tab] of cases) {
        TestBed.resetTestingModule();
        await open(`/voyages/${key}`);
        expect(TestBed.inject(Router).url).toBe(`/voyages/${key}/${tab}`);
      }
    });

    it('shows the seven section tabs with the counts and the Plan tab (lane 4B) in the outlet', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const tabs = [
        ...page.root.querySelectorAll("nav[aria-label='Voyage sections'] a"),
      ].map((a) => text(a));
      expect(tabs).toEqual([
        'Plan',
        'Questions 2',
        'Runs 4',
        'Gates 5',
        'Artifacts',
        'Activity',
        'Models',
      ]);
      expect(
        page.root.querySelector(
          "nav[aria-label='Voyage sections'] a[aria-current='page']"
        )?.textContent
      ).toContain('Plan');
      expect(
        page.root.querySelector('router-outlet + ah-plan-tab')
      ).not.toBeNull();
      expect(
        text(page.root.querySelector("nav[aria-label='Breadcrumb']"))
      ).toBe('Voyages / PROJ-123');
    });

    it("shows This voyage doesn't exist for a 404, with a way back to Voyages", async () => {
      const page = await open('/voyages/PROJ-999/plan');
      expect(text(page.root.querySelector('.ah-empty__title'))).toBe(
        "This voyage doesn't exist"
      );
      expect(page.root.querySelector("a[href='/voyages']")).not.toBeNull();
      expect(page.root.querySelector('ah-voyage-header')).toBeNull();
      expect(page.root.querySelector('ah-placeholder')).toBeNull();
    });

    it('shows Lost contact with the harbour when the API is unavailable, and Try again recovers', async () => {
      const mock = testServer();
      let failStory = true;
      const page = await open('/voyages/PROJ-123/plan', {
        mock,
        before: (request) => {
          if (
            failStory &&
            request.method === 'GET' &&
            request.path === '/stories/PROJ-123'
          ) {
            // failNext is one-shot: the mock answers this very request with 503.
            failStory = false;
            mock.server.switches.failNext = 503;
          }
        },
      });
      const banner = page.root.querySelector('ah-banner');
      expect(text(banner)).toContain("Can't reach Ahoy");
      expect(text(banner)).toContain('503 · unavailable');
      expect(page.root.querySelector('ah-voyage-header')).toBeNull();
      click(buttonNamed(banner!, 'Try again'));
      await flush(page);
      expect(text(page.root.querySelector('ah-voyage-header h1'))).toBe(
        'Show invoice due date on the billing page'
      );
    });
  });

  describe('Stop', () => {
    it('sends the reason with the version seen and shows the voyage anchored without reloading', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      const version = storyOf(page.server, 'PROJ-140').version;
      click(buttonNamed(header(page), 'Stop'));
      await flush(page);

      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe('Stop PROJ-140?');
      expect(text(d)).toMatch(
        /The voyage halts in planning\. Cartographer's run proj-140-planning-\S+ is cancelled in the background; the \d+\.\d{2} AIU it has used stays spent\./
      );
      expect(text(d)).toContain(
        'Shown to the crew on the voyage. Recorded as dev@example.com.'
      );
      type(
        d.querySelector('textarea'),
        '  Wrong repository in the Jira ticket.  '
      );
      click(buttonNamed(d, 'Stop voyage'));
      await flush(page);

      const sent = commands(page);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.path).toBe('/stories/PROJ-140/stop');
      expect(sent[0]?.body).toEqual({
        expectedVersion: version,
        reason: 'Wrong repository in the Jira ticket.',
      });
      expect(hasDialog()).toBe(false);
      expect(text(header(page).querySelector('ah-status-badge'))).toBe(
        'Halted halted · stopped_by_user'
      );
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.text)
      ).toEqual([
        'Voyage stopped. It stays anchored in planning until someone resumes it.',
      ]);
    });

    it('needs a reason: an empty one shows the error and sends nothing', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      click(buttonNamed(header(page), 'Stop'));
      await flush(page);
      type(dialog().querySelector('textarea'), '   ');
      click(buttonNamed(dialog(), 'Stop voyage'));
      await flush(page);
      expect(text(dialog().querySelector('.ah-field__error'))).toBe(
        'A reason is required.'
      );
      expect(commands(page)).toHaveLength(0);
    });

    it('on a stale version keeps the dialog open with the notice and the text, refreshes, and a resend works', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      click(buttonNamed(header(page), 'Stop'));
      await flush(page);
      type(
        dialog().querySelector('textarea'),
        'Wrong repository in the Jira ticket.'
      );
      page.server.switches.conflictNext = 'stale_version';
      const readsBefore = page.requests.filter(
        (r) => r.method === 'GET' && r.path === '/stories/PROJ-140'
      ).length;
      click(buttonNamed(dialog(), 'Stop voyage'));
      await flush(page);

      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(dialog().querySelector('textarea')?.value).toBe(
        'Wrong repository in the Jira ticket.'
      );
      const readsAfter = page.requests.filter(
        (r) => r.method === 'GET' && r.path === '/stories/PROJ-140'
      ).length;
      expect(readsAfter).toBeGreaterThan(readsBefore);

      click(buttonNamed(dialog(), 'Stop voyage'));
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
      expect(text(header(page).querySelector('ah-status-badge'))).toBe(
        'Halted halted · stopped_by_user'
      );
    });

    it('sends one request for a double click', async () => {
      const page = await open('/voyages/PROJ-140/runs');
      click(buttonNamed(header(page), 'Stop'));
      await flush(page);
      type(dialog().querySelector('textarea'), 'Pause for the weekend.');
      const confirm = buttonNamed(dialog(), 'Stop voyage');
      click(confirm);
      click(confirm);
      await flush(page);
      expect(commands(page)).toHaveLength(1);
      expect(hasDialog()).toBe(false);
    });
  });

  describe('Resume', () => {
    it('says what it retries and what it may spend, and sends the version without an empty reason', async () => {
      const page = await open('/voyages/PROJ-126/models');
      click(buttonNamed(header(page), 'Resume…'));
      await flush(page);
      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe(
        'Resume PROJ-126?'
      );
      expect(text(d)).toMatch(
        /Ahoy retries planning with Cartographer on \S+ · \S+\./
      );
      expect(text(d.querySelector('.ah-cost'))).toBe(
        "This may spend up to 12.8 AIU The rest of the voyage's 15 AIU budget, billed to priya@example.com's Copilot account. Anyone can stop it again."
      );
      const confirm = buttonNamed(d, 'Resume · up to 12.8 AIU');
      click(confirm);
      await flush(page);
      expect(commands(page).map((r) => [r.path, r.body])).toEqual([
        ['/stories/PROJ-126/resume', { expectedVersion: expect.any(Number) }],
      ]);
      expect(hasDialog()).toBe(false);
      expect(text(header(page).querySelector('ah-status-badge'))).toBe(
        'Queued ready'
      );
    });

    it('sends the reason when there is one', async () => {
      const page = await open('/voyages/PROJ-118/models');
      click(
        buttonNamed(
          page.root.querySelector('ah-anchored-banner')!,
          'Resume as is'
        )
      );
      await flush(page);
      type(dialog().querySelector('textarea'), 'Fixed the registry token.');
      click(buttonNamed(dialog(), /^Resume · up to/));
      await flush(page);
      expect(commands(page)[0]?.body).toEqual({
        expectedVersion: expect.any(Number),
        reason: 'Fixed the registry token.',
      });
    });

    it('on a stale version keeps the dialog open with the notice and the reason, and a resend works', async () => {
      const page = await open('/voyages/PROJ-126/models');
      click(buttonNamed(header(page), 'Resume…'));
      await flush(page);
      type(dialog().querySelector('textarea'), 'Compliance answered.');
      page.server.switches.conflictNext = 'stale_version';
      click(buttonNamed(dialog(), /^Resume · up to/));
      await flush(page);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(dialog().querySelector('textarea')?.value).toBe(
        'Compliance answered.'
      );
      click(buttonNamed(dialog(), /^Resume · up to/));
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
      expect(text(header(page).querySelector('ah-status-badge'))).toBe(
        'Queued ready'
      );
    });

    it('cannot be confirmed with no budget left', async () => {
      const mock = testServer();
      const server = mock.server;
      const story = storyOf(server, 'PROJ-126');
      // Lower the cap to what is spent, through the API, before the page opens.
      const lowered = call(server, 'POST', '/stories/PROJ-126/budget', {
        expectedVersion: story.version,
        budgetNanoAiu: story.spentNanoAiu,
        reason: 'Spent out',
      });
      expect(lowered.status).toBe(202);
      const fresh = await open('/voyages/PROJ-126/models', { mock });
      click(buttonNamed(header(fresh), 'Resume…'));
      await flush(fresh);
      const d = dialog();
      expect(text(d)).toContain('No budget left: raise the budget first.');
      const confirm = buttonNamed(d, 'Resume · up to 0.0 AIU');
      expect(confirm.disabled).toBe(true);
      click(confirm);
      await flush(fresh);
      expect(commands(fresh)).toHaveLength(0);
    });
  });

  describe('Budget', () => {
    it('refuses a cap below what is spent in the field, without a request', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      click(buttonNamed(header(page), 'Budget'));
      await flush(page);
      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe(
        'Change the budget'
      );
      const spent = text(d.querySelector('.spent__row b'));
      expect(spent).toMatch(/^\d+\.\d of 30 AIU$/);
      type(d.querySelector('input'), '1');
      type(d.querySelector('textarea'), 'Trim it.');
      click(buttonNamed(d, 'Set cap'));
      await flush(page);
      expect(text(d.querySelector('.ah-field__error'))).toMatch(
        /^At least [\d.]+ AIU, what's already spent\.$/
      );
      expect(commands(page)).toHaveLength(0);
    });

    it('sends the new cap in nano-AIU, without floats, with the reason and the version seen', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      click(buttonNamed(header(page), 'Budget'));
      await flush(page);
      const d = dialog();
      type(d.querySelector('input'), '40.5');
      type(d.querySelector('textarea'), 'Two more revision rounds are likely.');
      await flush(page);
      expect(text(d.querySelector('.ah-cost'))).toBe(
        "Allows up to 10.5 AIU more Billed to alex@example.com. Raising the budget doesn't resume an anchored voyage."
      );
      click(buttonNamed(d, 'Set cap to 40.5 AIU'));
      await flush(page);
      expect(commands(page).map((r) => [r.path, r.body])).toEqual([
        [
          '/stories/PROJ-123/budget',
          {
            expectedVersion: expect.any(Number),
            budgetNanoAiu: 40_500_000_000,
            reason: 'Two more revision rounds are likely.',
          },
        ],
      ]);
      expect(hasDialog()).toBe(false);
      expect(text(header(page).querySelector('ah-budget-meter'))).toMatch(
        / \/ 40\.5 AIU$/
      );
    });

    it('keeps both fields through a stale_version conflict', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      click(buttonNamed(header(page), 'Budget'));
      await flush(page);
      type(dialog().querySelector('input'), '45');
      type(dialog().querySelector('textarea'), 'More rounds.');
      await flush(page);
      page.server.switches.conflictNext = 'stale_version';
      click(buttonNamed(dialog(), 'Set cap to 45 AIU'));
      await flush(page);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(dialog().querySelector('input')?.value).toBe('45');
      expect(dialog().querySelector('textarea')?.value).toBe('More rounds.');
      click(buttonNamed(dialog(), 'Set cap to 45 AIU'));
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
    });
  });
});
