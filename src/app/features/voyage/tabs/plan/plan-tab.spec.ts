import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { CLOCK, type Clock } from '@core/realtime/clock';
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
import { VOYAGE_ROUTES } from '../../voyage.routes';

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

/** The voyage routes on the mock, opened at `url`. */
async function open(
  url: string,
  mock: TestServer = testServer()
): Promise<Page> {
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
    server,
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

/** Picks a card of "Your decision" by its title. */
async function pick(
  page: Page,
  title: 'Approve' | 'Send back' | 'Reject'
): Promise<void> {
  const card = [
    ...page.root.querySelectorAll('ah-decision-panel label.ah-choice'),
  ].find((label) => text(label.querySelector('b')) === title);
  click(card?.querySelector('input'));
  await flush(page);
}

function panel(page: Page): HTMLElement {
  const element = page.root.querySelector<HTMLElement>('ah-decision-panel');
  if (element === null) throw new Error('no decision panel');
  return element;
}

/** The commands (POSTs) the mock received. */
function commands(page: Page): MockRequest[] {
  return page.requests.filter((request) => request.method === 'POST');
}

function toasts(): string[] {
  return TestBed.inject(ToastService)
    .toasts()
    .map((t) => t.text);
}

afterEach(() => {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
});

describe('PlanTab on the mock backend', () => {
  describe('PROJ-123, plan revision 2 waiting on a decision', () => {
    it('shows the plan with the blocks changed since revision 1 marked, and says which revision it is', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const head = text(page.root.querySelector('ah-panel-head'));
      expect(head).toContain('Implementation plan');
      expect(head).toContain('revision 2');
      expect(head).toMatch(/by Cartographer · run \S+ · /);
      expect(text(page.root.querySelector('ah-markdown h1'))).toBe(
        'Implementation plan: PROJ-123 Show invoice due date on the billing page'
      );
      const marked = [
        ...page.root.querySelectorAll('ah-markdown .ah-mark'),
      ].map((m) => text(m));
      expect(marked.length).toBeGreaterThan(0);
      expect(marked.some((m) => m.includes("customer's timezone"))).toBe(true);
      expect(marked.some((m) => m.includes('Overdue'))).toBe(true);
      expect(text(page.root.querySelector('.plan__legend'))).toBe(
        'Highlighted blocks changed since the last plan revision.'
      );
      expect(text(page.root.querySelector('.plan__compare'))).toBe(
        'Compare with revision 1'
      );
      expect(
        page.root.querySelector('.plan__compare')?.getAttribute('href')
      ).toBe('/voyages/PROJ-123/artifacts');
    });

    it('asks for no more than five earlier revisions of the plan', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const probes = page.requests.filter(
        (r) =>
          r.path === '/stories/PROJ-123/artifacts/content' &&
          r.query.has('revision')
      );
      expect(probes.length).toBeGreaterThan(0);
      expect(probes.length).toBeLessThanOrEqual(6);
      expect(new Set(probes.map((r) => r.query.get('path')))).toEqual(
        new Set(['implementation-plan.md'])
      );
    });

    it('lists the five acceptance criteria with their count', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const criteria = [...page.root.querySelectorAll('.plan__ac')].map((row) =>
        text(row)
      );
      expect(criteria).toHaveLength(5);
      expect(criteria[0]).toBe(
        'AC1 The billing page shows the due date of each invoice.'
      );
      expect(criteria[4]).toBe('AC5 Overdue invoices show an "Overdue" badge.');
    });

    it("shows the earlier round: jordan's send-back with their reason, and the answered questions", async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const earlier = [...page.root.querySelectorAll('ah-panel')].find((p) =>
        text(p).includes('Earlier round')
      );
      expect(text(earlier)).toContain('Sent back by jordan@example.com');
      expect(text(earlier)).toContain(
        "“Due date must use the customer's timezone; add an AC for the overdue state.”"
      );
      expect(text(earlier?.querySelector('a'))).toBe(
        '2 questions answered before this plan'
      );
      expect(earlier?.querySelector('a')?.getAttribute('href')).toBe(
        '/voyages/PROJ-123/questions'
      );
    });

    it('offers the three choices with what each does, and nothing is picked until the person picks', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const cards = [...panel(page).querySelectorAll('label.ah-choice')].map(
        (l) => text(l)
      );
      expect(cards).toEqual([
        'Approve The voyage moves on to implementation.',
        'Send back Cartographer revises the plan. This would be round 3 of 4.',
        "Reject The voyage becomes blocked. This can't be undone here.",
      ]);
      expect(
        [
          ...panel(page).querySelectorAll<HTMLInputElement>(
            'input[type=radio]'
          ),
        ].some((r) => r.checked)
      ).toBe(false);
      expect(buttonNamed(panel(page), 'Choose a decision').disabled).toBe(true);
    });
  });

  describe('Approve', () => {
    it('sends straight away, with no dialog and no reason, and then the voyage moves on', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const version = (
        call(page.server, 'GET', '/stories/PROJ-123').body as {
          version: number;
        }
      ).version;
      await pick(page, 'Approve');
      expect(panel(page).querySelector('textarea')).toBeNull();
      click(buttonNamed(panel(page), 'Approve plan'));
      await flush(page);

      expect(hasDialog()).toBe(false);
      const sent = commands(page);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.path).toBe('/stories/PROJ-123/decisions');
      expect(sent[0]?.body).toEqual({
        gate: 'plan_accepted',
        decision: 'approve',
        expectedVersion: version,
      });
      expect(toasts()).toEqual([
        'Plan approved. The voyage moves on to implementation.',
      ]);
      expect(panel(page).querySelector('label.ah-choice')).toBeNull();
    });

    it('shows who approved and when once the decision is recorded: the panel gives way to the result', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Approve');
      click(buttonNamed(panel(page), 'Approve plan'));
      await flush(page);
      expect(text(panel(page))).toBe(
        'Your decision Approved by dev@example.com · just now'
      );
    });
  });

  describe('Approve after a long reason was left in the field', () => {
    it('still sends: an approval takes no reason, so text over the limit does not stop it', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Send back');
      type(panel(page).querySelector('textarea'), 'x'.repeat(5001));
      await pick(page, 'Approve');
      click(buttonNamed(panel(page), 'Approve plan'));
      await flush(page);
      expect(commands(page)).toHaveLength(1);
      expect(commands(page)[0]?.body).not.toHaveProperty('reason');
    });
  });

  describe('Send back', () => {
    it('needs a reason: without one nothing opens and nothing is sent', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Send back');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);
      expect(hasDialog()).toBe(false);
      expect(commands(page)).toHaveLength(0);
      expect(text(panel(page).querySelector('.ah-field__error'))).toBe(
        'A reason is required to send back or reject.'
      );
      expect(text(panel(page).querySelector('label.ah-label'))).toBe(
        'Reason for Cartographer *'
      );
    });

    it('opens the dialog with the text written in the panel, the round and the cost, and sends the exact request', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      const version = (
        call(page.server, 'GET', '/stories/PROJ-123').body as {
          version: number;
        }
      ).version;
      await pick(page, 'Send back');
      type(
        panel(page).querySelector('textarea'),
        '  Keep the badge but not the default sort.  '
      );
      expect(text(panel(page).querySelector('.decision__quote'))).toContain(
        'claude-sonnet-5 · high'
      );
      expect(text(panel(page).querySelector('.decision__quote a'))).toBe(
        'Change'
      );
      expect(
        panel(page).querySelector('.decision__quote a')?.getAttribute('href')
      ).toBe('/voyages/PROJ-123/models?change=planning');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);

      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe(
        'Send the plan back to Cartographer'
      );
      expect(text(d)).toContain(
        'This starts revision round 3 of 4. After round 4 the voyage anchors and needs a person to decide.'
      );
      expect(text(d.querySelector('.ah-cost'))).toMatch(
        /^Spends from the remaining \d+\.\d AIU /
      );
      expect(text(d.querySelector('.ah-cost'))).toContain(
        'Billed to alex@example.com.'
      );
      expect(text(d.querySelector('label.ah-label'))).toBe(
        'What should change *'
      );
      expect(d.querySelector('textarea')?.value).toBe(
        '  Keep the badge but not the default sort.  '
      );

      click(buttonNamed(d, 'Send back'));
      await flush(page);

      expect(hasDialog()).toBe(false);
      const sent = commands(page);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.path).toBe('/stories/PROJ-123/decisions');
      expect(sent[0]?.body).toEqual({
        gate: 'plan_accepted',
        decision: 'send_back',
        reason: 'Keep the badge but not the default sort.',
        expectedVersion: version,
      });
      expect(toasts()).toEqual([
        'Plan sent back to Cartographer. Round 3 of 4 is running.',
      ]);
      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-123/plan');
    });

    it('does not send an empty reason from the dialog either (the text can be emptied there)', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Send back');
      type(panel(page).querySelector('textarea'), 'Change the sort.');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);
      type(dialog().querySelector('textarea'), '   ');
      click(buttonNamed(dialog(), 'Send back'));
      await flush(page);
      expect(hasDialog()).toBe(true);
      expect(commands(page)).toHaveLength(0);
      expect(text(dialog().querySelector('.ah-field__error'))).toBe(
        'A reason is required to send back or reject.'
      );
    });

    it('on a stale version keeps the dialog open with the notice and the text, and Send back again goes through', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Send back');
      type(panel(page).querySelector('textarea'), 'Change the sort.');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);
      page.server.switches.conflictNext = 'stale_version';
      click(buttonNamed(dialog(), 'Send back'));
      await flush(page);

      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(dialog().querySelector('textarea')?.value).toBe(
        'Change the sort.'
      );
      click(buttonNamed(dialog(), 'Send back again'));
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
      expect(toasts()).toEqual([
        'Plan sent back to Cartographer. Round 3 of 4 is running.',
      ]);
    });

    it('sends one request for a double click', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Send back');
      type(panel(page).querySelector('textarea'), 'Change the sort.');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);
      const confirm = buttonNamed(dialog(), 'Send back');
      click(confirm);
      click(confirm);
      await flush(page);
      expect(commands(page)).toHaveLength(1);
    });

    it('shows the ceiling banner in the dialog when Ahoy refuses another round, with the text kept', async () => {
      const mock = testServer();
      const voyage = mock.server.state.voyages.get('PROJ-123');
      if (voyage === undefined) throw new Error('PROJ-123 is seeded');
      voyage.revisionRounds['plan_accepted'] = 4;
      const page = await open('/voyages/PROJ-123/plan', mock);
      expect(text(panel(page))).toContain(
        'This would be round 6, past the 4 rounds a plan gets'
      );
      await pick(page, 'Send back');
      type(panel(page).querySelector('textarea'), 'One more round, please.');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);
      expect(text(dialog())).toContain(
        'This would be revision round 6, past the 4 rounds a plan gets.'
      );
      click(buttonNamed(dialog(), 'Send back'));
      await flush(page);

      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'No more revision rounds'
      );
      expect(dialog().querySelector('textarea')?.value).toBe(
        'One more round, please.'
      );
    });
  });

  describe('Reject', () => {
    it('needs a reason before the dialog opens', async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Reject');
      click(buttonNamed(panel(page), 'Reject plan'));
      await flush(page);
      expect(hasDialog()).toBe(false);
      expect(commands(page)).toHaveLength(0);
    });

    it("asks 'Reject the plan?' in a danger dialog and sends the rejection with its reason", async () => {
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Reject');
      type(
        panel(page).querySelector('textarea'),
        'Out of scope for this quarter.'
      );
      click(buttonNamed(panel(page), 'Reject plan'));
      await flush(page);

      const d = dialog();
      expect(text(d.querySelector('.ah-dialog__title'))).toBe(
        'Reject the plan?'
      );
      expect(text(d)).toContain(
        'The voyage becomes blocked. No agent works on it again. Use Send back if the plan only needs changes.'
      );
      expect(d.querySelector('.ah-btn--danger')).not.toBeNull();
      click(buttonNamed(d, 'Reject plan'));
      await flush(page);

      expect(hasDialog()).toBe(false);
      expect(commands(page)[0]?.body).toMatchObject({
        gate: 'plan_accepted',
        decision: 'reject',
        reason: 'Out of scope for this quarter.',
      });
      expect(toasts()).toEqual(['Plan rejected. The voyage became blocked.']);
      expect(text(panel(page))).toContain('Rejected by dev@example.com');
      expect(text(panel(page))).toContain('“Out of scope for this quarter.”');
    });
  });

  describe('someone decided first', () => {
    it('shows who decided, keeps the text with Copy my text and links to the decision', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Send back');
      type(panel(page).querySelector('textarea'), 'Change the sort.');
      click(buttonNamed(panel(page), 'Send back to Cartographer'));
      await flush(page);
      page.server.switches.conflictNext = 'decision_already_recorded';
      click(buttonNamed(dialog(), 'Send back'));
      await flush(page);

      expect(hasDialog()).toBe(false);
      const conflict = page.root.querySelector('ah-decision-conflict');
      expect(text(conflict)).toContain('Someone already decided this plan');
      expect(text(conflict)).toContain("Your send-back wasn't recorded.");
      expect(text(conflict)).toContain(
        'Your text is kept below in case you want to raise it with the crew.'
      );
      expect(text(conflict?.querySelector('.decision__kept'))).toBe(
        'Change the sort.'
      );
      expect(conflict?.querySelector('a')?.getAttribute('href')).toBe(
        '/voyages/PROJ-123/gates'
      );
      expect(text(conflict?.querySelector('a'))).toBe('See the decision');

      click(buttonNamed(conflict!, 'Copy my text'));
      await flush(page);
      expect(writeText).toHaveBeenCalledWith('Change the sort.');
      expect(text(conflict)).toContain('Copied.');
    });

    it('says so when the clipboard is refused, with the text still on screen', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
        configurable: true,
      });
      const page = await open('/voyages/PROJ-123/plan');
      await pick(page, 'Reject');
      type(panel(page).querySelector('textarea'), 'No.');
      click(buttonNamed(panel(page), 'Reject plan'));
      await flush(page);
      page.server.switches.conflictNext = 'decision_already_recorded';
      click(buttonNamed(dialog(), 'Reject plan'));
      await flush(page);
      const conflict = page.root.querySelector('ah-decision-conflict');
      expect(text(conflict)).toContain("Your rejection wasn't recorded.");
      click(buttonNamed(conflict!, 'Copy my text'));
      await flush(page);
      expect(text(conflict)).toContain("Couldn't copy");
      expect(text(conflict?.querySelector('.decision__kept'))).toBe('No.');
    });
  });

  describe('without a decision to make', () => {
    it("shows 'No plan yet' and 'No decision needed now' before a plan is written", async () => {
      const page = await open('/voyages/PROJ-109/plan');
      expect(text(page.root.querySelector('ah-empty-state'))).toContain(
        'No plan yet'
      );
      expect(text(panel(page))).toContain('No decision needed now');
      expect(page.root.querySelector('ah-markdown')).toBeNull();
    });

    it('shows who rejected a blocked voyage, with their reason', async () => {
      const page = await open('/voyages/PROJ-102/plan');
      expect(text(panel(page))).toMatch(/Rejected by jordan@example\.com/);
      expect(page.root.querySelector('ah-markdown')).not.toBeNull();
      expect(panel(page).querySelector('label.ah-choice')).toBeNull();
    });

    it('shows who approved a finished voyage', async () => {
      const page = await open('/voyages/PROJ-097/plan');
      expect(text(panel(page))).toMatch(/Approved by \S+@example\.com/);
    });
  });
});
