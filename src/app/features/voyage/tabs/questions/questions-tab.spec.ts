import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CLOCK, type Clock } from '@core/realtime/clock';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import type { ManualClock } from '@testing/mock-backend/clock';
import type { MockRequest, MockResponse } from '@testing/mock-backend/http';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import { call, settle, testServer } from '@testing/mock-backend/spec-helpers';
import { CLOCK as UI_CLOCK } from '@ui/pipes/clock';
import { ToastService } from '@ui/toast/toast';
import { VOYAGE_ROUTES } from '../../voyage.routes';
import { ANSWER_MAX } from './question-rounds';

@Component({ selector: 'ah-test-voyages', template: `<p>Voyages list</p>` })
class VoyagesStub {}

const RECOMMENDATION_Q2 =
  'Receipt page only for now; bulk download needs a background job and is better as its own story.';
const RECOMMENDATION_Q3 = 'On the total, to match the amount charged.';

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

interface OpenOptions {
  /** Runs before the mock answers each request (a spec uses it to set a switch or to race another person). */
  readonly before?: (request: MockRequest) => void;
  /** Rewrites an answer on its way to the page. */
  readonly rewrite?: (
    request: MockRequest,
    response: MockResponse
  ) => MockResponse;
}

/** The voyage routes on the mock, opened at `url`. */
async function open(url: string, options: OpenOptions = {}): Promise<Page> {
  const { server, clock } = testServer();
  const requests: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request) => {
    requests.push(request);
    options.before?.(request);
    const response = handle(request);
    return options.rewrite?.(request, response) ?? response;
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

/** The card of a question ("Q2"). */
function card(page: Page, id: string): HTMLElement {
  const found = [
    ...page.root.querySelectorAll<HTMLElement>('ah-question-card'),
  ].find((element) => text(element.querySelector('.ah-question__id')) === id);
  if (found === undefined) throw new Error(`no card ${id}`);
  return found;
}

/** The item that holds a card and what the tab puts under it. */
function item(page: Page, id: string): HTMLElement {
  const element = card(page, id).closest<HTMLElement>('.questions__item');
  if (element === null) throw new Error(`no item ${id}`);
  return element;
}

function buttonNamed(container: Element, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (b) => text(b) === label
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

function type(field: HTMLTextAreaElement | null, value: string): void {
  if (field === null) throw new Error('no field');
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

function answerField(page: Page, id: string): HTMLTextAreaElement {
  const field = card(page, id).querySelector('textarea');
  if (field === null) throw new Error(`no answer field in ${id}`);
  return field;
}

/** The POSTs the mock received. */
function commands(page: Page): MockRequest[] {
  return page.requests.filter((request) => request.method === 'POST');
}

function toasts(): string[] {
  return TestBed.inject(ToastService)
    .toasts()
    .map((toast) => toast.text);
}

/** Sends an answer the way a person would: type, click "Send answer". */
async function sendAnswer(
  page: Page,
  id: string,
  answer: string
): Promise<void> {
  type(answerField(page, id), answer);
  await flush(page);
  buttonNamed(card(page, id), 'Send answer').click();
  await flush(page);
}

afterEach(() => {
  sessionStorage.clear();
});

describe('QuestionsTab on the mock backend', () => {
  describe('the list', () => {
    it('PROJ-131 shows Round 1 · Cartographer asks, 1 of 3 answered, with Q1 final and Q2 and Q3 open', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      expect(text(page.root.querySelector('.questions__title'))).toBe(
        'Round 1 · Cartographer asks'
      );
      expect(text(page.root.querySelector('.questions__head'))).toContain(
        '1 of 3 answered'
      );
      const meter = page.root.querySelector(".questions__head [role='meter']");
      expect(meter?.getAttribute('aria-valuenow')).toBe('1');
      expect(meter?.getAttribute('aria-valuemax')).toBe('3');

      expect(page.root.querySelectorAll('ah-question-card')).toHaveLength(3);
      expect(text(card(page, 'Q1'))).toContain('Answered');
      expect(text(card(page, 'Q1'))).toContain('Final');
      expect(text(card(page, 'Q1'))).toContain(
        'Include the VAT number and the full address block'
      );
      expect(card(page, 'Q1').querySelector('textarea')).toBeNull();
      expect(text(card(page, 'Q2'))).toContain('Needs an answer');
      expect(text(card(page, 'Q3'))).toContain('Needs an answer');
    });

    it("shows the agent's recommendation on Q2 and Q3, and none on a question without one", async () => {
      const page = await open('/voyages/PROJ-131/questions');
      expect(text(card(page, 'Q2'))).toContain(
        `Cartographer recommends: ${RECOMMENDATION_Q2}`
      );
      expect(text(card(page, 'Q3'))).toContain(
        `Cartographer recommends: ${RECOMMENDATION_Q3}`
      );
    });

    it('explains what happens next with the remaining budget, the owner and the planning model', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      const next = text(page.root.querySelector('.questions__side'));
      expect(next).toContain(
        "When every question in this round is answered, the voyage is queued and Cartographer's next run reads all the answers."
      );
      expect(next).toMatch(
        /spends from the remaining 18\.9 AIU, billed to sam@example\.com, on \S+ · \S+\./
      );
      expect(next).toContain(
        "Anyone on the crew may answer. There's no chat with the agent: the answer is the whole message."
      );
    });

    it('says every question is answered when none is open (PROJ-123)', async () => {
      const page = await open('/voyages/PROJ-123/questions');
      expect(text(page.root.querySelector('.questions__head'))).toContain(
        '2 of 2 answered'
      );
      expect(page.root.querySelectorAll('textarea')).toHaveLength(0);
      expect(text(page.root.querySelector('.questions__side'))).toContain(
        'Every question is answered'
      );
    });

    it("shows the empty state 'No questions' for a voyage that asked none", async () => {
      const page = await open('/voyages/PROJ-109/questions');
      expect(text(page.root.querySelector('ah-empty-state'))).toContain(
        'No questions'
      );
      expect(page.root.querySelector('ah-question-card')).toBeNull();
    });

    it('keeps earlier rounds folded under the newest, which is open', async () => {
      const page = await open('/voyages/PROJ-131/questions', {
        rewrite: (request, response) => {
          if (
            request.method !== 'GET' ||
            !request.path.endsWith('/questions') ||
            response.kind !== 'json'
          ) {
            return response;
          }
          const items = (
            response.body as { items: { id: string; round: number }[] }
          ).items;
          return {
            ...response,
            body: {
              items: items.map((q) => (q.id === 'Q3' ? { ...q, round: 2 } : q)),
            },
          };
        },
      });
      const titles = [...page.root.querySelectorAll('.questions__title')].map(
        (t) => text(t)
      );
      expect(titles).toEqual([
        'Round 2 · Cartographer asks',
        'Round 1 · Cartographer asks',
      ]);
      expect(
        page.root.querySelector('section.questions__round .questions__title')
          ?.textContent
      ).toContain('Round 2');
      const folded = page.root.querySelector<HTMLDetailsElement>(
        'details.questions__round--folded'
      );
      expect(folded?.open).toBe(false);
      expect(text(folded?.querySelector('summary'))).toContain(
        '1 of 2 answered'
      );
    });

    it('locks the form of an open question when the voyage is not waiting for answers', async () => {
      const page = await open('/voyages/PROJ-131/questions', {
        rewrite: (request, response) => {
          if (
            request.method === 'GET' &&
            /\/stories\/PROJ-131$/.test(request.path) &&
            response.kind === 'json'
          ) {
            return {
              ...response,
              body: { ...(response.body as object), status: 'halted' },
            };
          }
          return response;
        },
      });
      expect(page.root.querySelectorAll('textarea')).toHaveLength(0);
      expect(text(card(page, 'Q2'))).toContain(
        "This voyage isn't waiting for answers right now."
      );
      const next = text(page.root.querySelector('.questions__side'));
      expect(next).toContain("This voyage isn't waiting for answers right now");
      expect(next).not.toContain('the voyage is queued');
    });
  });

  describe('answers are final', () => {
    it("'Use recommendation' fills the field and sends nothing", async () => {
      const page = await open('/voyages/PROJ-131/questions');
      buttonNamed(card(page, 'Q2'), 'Use recommendation').click();
      await flush(page);
      expect(answerField(page, 'Q2').value).toBe(RECOMMENDATION_Q2);
      expect(commands(page)).toHaveLength(0);
    });

    it("disables 'Send answer' until there is text, and sends nothing for blank text", async () => {
      const page = await open('/voyages/PROJ-131/questions');
      const send = buttonNamed(card(page, 'Q3'), 'Send answer');
      expect(send.disabled).toBe(true);
      type(answerField(page, 'Q3'), '   ');
      await flush(page);
      expect(send.disabled).toBe(true);
      send.click();
      await flush(page);
      expect(commands(page)).toHaveLength(0);
    });

    it('says answers are final and who they are recorded as', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      expect(text(card(page, 'Q2'))).toMatch(
        /Answers are final once sent\. Recorded as \S+@\S+\./
      );
    });

    it('refuses an answer longer than 20 000 characters, with a message and no request', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      type(answerField(page, 'Q3'), 'a'.repeat(ANSWER_MAX + 1));
      await flush(page);
      expect(text(item(page, 'Q3'))).toContain(
        'An answer can have at most 20,000 characters; this one has 20,001.'
      );
      buttonNamed(card(page, 'Q3'), 'Send answer').click();
      await flush(page);
      expect(commands(page)).toHaveLength(0);
      expect(answerField(page, 'Q3').value).toHaveLength(ANSWER_MAX + 1);
    });

    it('takes an answer of exactly 20 000 characters', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      await sendAnswer(page, 'Q2', 'a'.repeat(ANSWER_MAX));
      expect(commands(page)).toHaveLength(1);
    });
  });

  describe('sending', () => {
    it("sends Q2 with the version it saw, trimmed, and answers 'Answer to Q2 sent. 1 question left.'", async () => {
      const page = await open('/voyages/PROJ-131/questions');
      const version = (
        call(page.server, 'GET', '/stories/PROJ-131').body as {
          version: number;
        }
      ).version;
      await sendAnswer(
        page,
        'Q2',
        '  POC test answer, not a product decision.  '
      );

      expect(commands(page).map((r) => [r.path, r.body])).toEqual([
        [
          '/stories/PROJ-131/questions/Q2/answer',
          {
            answer: 'POC test answer, not a product decision.',
            expectedVersion: version,
          },
        ],
      ]);
      expect(toasts()).toEqual(['Answer to Q2 sent. 1 question left.']);
      expect(text(card(page, 'Q2'))).toContain('Answered');
      expect(text(card(page, 'Q2'))).toContain('Final');
      expect(card(page, 'Q2').querySelector('textarea')).toBeNull();
      expect(text(page.root.querySelector('.questions__head'))).toContain(
        '2 of 3 answered'
      );
    });

    it('answering Q3 last says all questions are answered and the voyage moves on without a reload', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      await sendAnswer(
        page,
        'Q2',
        'POC test answer, not a product decision (Q2).'
      );
      await sendAnswer(
        page,
        'Q3',
        'POC test answer, not a product decision (Q3).'
      );

      expect(toasts()).toEqual([
        'Answer to Q2 sent. 1 question left.',
        'Answer to Q3 sent. All questions answered: Cartographer is queued.',
      ]);
      expect(text(page.root.querySelector('ah-status-badge'))).toMatch(
        /^Queued ready|^Running/
      );
      expect(text(page.root.querySelector('.questions__head'))).toContain(
        '3 of 3 answered'
      );
      expect(text(page.root.querySelector('.questions__side'))).toContain(
        'Every question is answered'
      );
    });

    it('sends one request on a double click', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      type(answerField(page, 'Q3'), 'POC test answer, not a product decision.');
      await flush(page);
      const send = buttonNamed(card(page, 'Q3'), 'Send answer');
      send.click();
      send.click();
      await flush(page);
      expect(commands(page)).toHaveLength(1);
    });
  });

  describe('drafts', () => {
    it('keeps what is typed in sessionStorage under ahoy.draft.PROJ-131.Q3', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      type(
        answerField(page, 'Q3'),
        'On the total, but show the per-line tax too.'
      );
      await flush(page);
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q3')).toBe(
        'On the total, but show the per-line tax too.'
      );
      expect(commands(page)).toHaveLength(0);
    });

    it("'Use recommendation' is a draft too", async () => {
      const page = await open('/voyages/PROJ-131/questions');
      buttonNamed(card(page, 'Q3'), 'Use recommendation').click();
      await flush(page);
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q3')).toBe(
        RECOMMENDATION_Q3
      );
    });

    it('comes back after the page is reloaded', async () => {
      const first = await open('/voyages/PROJ-131/questions');
      type(answerField(first, 'Q3'), 'A draft that survives a reload.');
      await flush(first);

      TestBed.resetTestingModule();
      const reloaded = await open('/voyages/PROJ-131/questions');
      expect(answerField(reloaded, 'Q3').value).toBe(
        'A draft that survives a reload.'
      );
      expect(buttonNamed(card(reloaded, 'Q3'), 'Send answer').disabled).toBe(
        false
      );
      expect(commands(reloaded)).toHaveLength(0);
    });

    it('survives the story and the list of questions being replaced by an answer', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      type(answerField(page, 'Q3'), 'Still here after Q2 went out.');
      await flush(page);
      await sendAnswer(page, 'Q2', 'POC test answer, not a product decision.');
      expect(answerField(page, 'Q3').value).toBe(
        'Still here after Q2 went out.'
      );
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q3')).toBe(
        'Still here after Q2 went out.'
      );
    });

    it('survives a refresh of the story forced by a conflict', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      type(answerField(page, 'Q3'), 'Still here after the conflict.');
      await flush(page);
      page.server.switches.conflictNext = 'stale_version';
      await sendAnswer(page, 'Q2', 'POC test answer, not a product decision.');
      expect(answerField(page, 'Q3').value).toBe(
        'Still here after the conflict.'
      );
    });

    it('is deleted once the answer is sent', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      await sendAnswer(page, 'Q3', 'POC test answer, not a product decision.');
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q3')).toBeNull();
    });

    it('is not deleted when the answer was not recorded', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      page.server.switches.failNext = 503;
      await sendAnswer(page, 'Q3', 'Not recorded, so not lost.');
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q3')).toBe(
        'Not recorded, so not lost.'
      );
      expect(answerField(page, 'Q3').value).toBe('Not recorded, so not lost.');
      expect(toasts()).toEqual([]);
    });

    it("keeps the voyages' drafts apart", async () => {
      sessionStorage.setItem(
        'ahoy.draft.PROJ-123.Q3',
        "Another voyage's draft."
      );
      const page = await open('/voyages/PROJ-131/questions');
      expect(answerField(page, 'Q3').value).toBe('');
    });
  });

  describe('conflicts', () => {
    it('on stale_version shows the notice, keeps the text, and the resend goes through with the new version', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      page.server.switches.conflictNext = 'stale_version';
      await sendAnswer(page, 'Q3', 'POC test answer, not a product decision.');

      expect(text(item(page, 'Q3'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(answerField(page, 'Q3').value).toBe(
        'POC test answer, not a product decision.'
      );
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q3')).toBe(
        'POC test answer, not a product decision.'
      );
      expect(toasts()).toEqual([]);

      const current = (
        call(page.server, 'GET', '/stories/PROJ-131').body as {
          version: number;
        }
      ).version;
      buttonNamed(card(page, 'Q3'), 'Send answer').click();
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(
        (commands(page)[1]?.body as { expectedVersion: number }).expectedVersion
      ).toBe(current);
      expect(toasts()).toEqual(['Answer to Q3 sent. 1 question left.']);
      expect(text(item(page, 'Q3'))).not.toContain(
        'This voyage changed since you opened it'
      );
    });

    it("on already_answered shows the other person's answer and keeps the user's text below it", async () => {
      let raced = false;
      const page = await open('/voyages/PROJ-131/questions', {
        before: (request) => {
          if (
            raced ||
            request.method !== 'POST' ||
            !request.path.endsWith('/Q2/answer')
          )
            return;
          raced = true;
          // Another person's answer lands first; the user's request still carries the version it saw.
          const body = request.body as { expectedVersion: number };
          call(
            page.server,
            'POST',
            '/stories/PROJ-131/questions/Q2/answer',
            {
              answer: 'Receipt page and bulk download.',
              expectedVersion: body.expectedVersion,
            },
            { 'x-ahoy-actor': 'jordan@example.com' }
          );
          body.expectedVersion = (
            call(page.server, 'GET', '/stories/PROJ-131').body as {
              version: number;
            }
          ).version;
        },
      });
      await sendAnswer(page, 'Q2', 'Receipt page only, please.');

      const q2 = item(page, 'Q2');
      expect(text(q2)).toContain('Answered');
      expect(text(q2)).toContain('Receipt page and bulk download.');
      expect(text(q2)).toContain('jordan@example.com');
      expect(text(q2)).toContain('Someone already answered');
      expect(text(q2.querySelector('.questions__kept'))).toContain(
        'Receipt page only, please.'
      );
      expect(toasts()).toEqual([]);
    });

    it('lets a person discard the text of a question someone else answered', async () => {
      sessionStorage.setItem(
        'ahoy.draft.PROJ-131.Q1',
        'I would have said otherwise.'
      );
      const page = await open('/voyages/PROJ-131/questions');
      expect(
        text(item(page, 'Q1').querySelector('.questions__kept'))
      ).toContain('I would have said otherwise.');
      buttonNamed(item(page, 'Q1'), 'Discard my text').click();
      await flush(page);
      expect(item(page, 'Q1').querySelector('.questions__kept')).toBeNull();
      expect(sessionStorage.getItem('ahoy.draft.PROJ-131.Q1')).toBeNull();
    });

    it('shows a failed send as a banner under that card and keeps the text', async () => {
      const page = await open('/voyages/PROJ-131/questions');
      page.server.switches.failNext = 503;
      await sendAnswer(page, 'Q2', 'Kept through the outage.');
      expect(text(item(page, 'Q2'))).toContain("Can't reach Ahoy");
      expect(text(item(page, 'Q3'))).not.toContain("Can't reach Ahoy");
      expect(answerField(page, 'Q2').value).toBe('Kept through the outage.');
    });
  });

  describe('loading', () => {
    it("shows 'Can't reach Ahoy' with Try again when the questions cannot be read", async () => {
      const page = await open('/voyages/PROJ-131/questions', {
        rewrite: (request, response) =>
          request.method === 'GET' && request.path.endsWith('/questions')
            ? { kind: 'text', status: 503, headers: {}, body: 'down' }
            : response,
      });
      expect(page.root.querySelector('ah-question-card')).toBeNull();
      expect(
        text(page.root.querySelector('.questions__retry')?.closest('ah-banner'))
      ).toContain('Try again');
    });
  });
});
