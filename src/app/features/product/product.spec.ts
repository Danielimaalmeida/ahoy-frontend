import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FedevAuthService } from '@acme-fedev/auth';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { CLOCK, type Clock } from '@core/realtime/clock';
import { CONVERSATION_POLL_MS } from '@domain/conversations';
import type { ManualClock } from '@testing/mock-backend/clock';
import {
  MOCK_START_MS,
  MOCK_STEP_MS,
} from '@testing/mock-backend/conversations';
import type { MockRequest, MockResponse } from '@testing/mock-backend/http';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import { call, settle, testServer } from '@testing/mock-backend/spec-helpers';
import { PRODUCT_ROUTES } from './product.routes';

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
  readonly requests: MockRequest[];
}

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
  for (let i = 0; i < 5; i++) {
    await settle();
    page.harness.detectChanges();
    await page.harness.fixture.whenStable();
  }
}

/** Moves the mock's clock (and so the pretend agent and the page's polling) on by `ms`, a poll at a time. */
async function wait(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= CONVERSATION_POLL_MS) {
    page.clock.advance(Math.min(CONVERSATION_POLL_MS, left));
    await flush(page);
  }
}

/** The Product routes on the seeded mock, opened at `url`, as dev@example.com. */
async function open(
  url: string,
  prepare: (server: MockAhoyServer) => void = () => undefined
): Promise<Page> {
  const { server, clock } = testServer();
  prepare(server);
  const requests = record(server);
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [{ path: 'product', children: PRODUCT_ROUTES }],
        withComponentInputBinding()
      ),
      provideHttpClient(withInterceptors([mockBackendInterceptor])),
      provideMockBackend(server),
      { provide: CLOCK, useValue: asClock(clock) },
      {
        provide: FedevAuthService,
        useValue: { userProfile: signal(null), currentUser: signal(null) },
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const page = {
    server,
    clock,
    harness,
    requests,
    root: harness.fixture.nativeElement as HTMLElement,
  };
  await flush(page);
  return page;
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
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

function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '.cdk-overlay-container .ah-dialog'
  );
  if (element === null) throw new Error('no dialog open');
  return element;
}

const ME = 'dev@example.com';

/** Starts a conversation as the person would through the API, with what it pins, and answers its id. */
function started(
  server: MockAhoyServer,
  recipe: string | null,
  items: readonly { kind: string; ref: string }[] = []
): string {
  const created = call(
    server,
    'POST',
    '/conversations',
    { title: 'Late fees', recipe },
    { 'x-ahoy-actor': ME }
  ).body as { id: string };
  if (items.length > 0)
    call(
      server,
      'PUT',
      `/conversations/${created.id}/context`,
      { items },
      { 'x-ahoy-actor': ME }
    );
  return created.id;
}

const composer = (root: HTMLElement) =>
  root.querySelector<HTMLFormElement>('form.composer');

afterEach(() => {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
});

describe('Product on the mock backend', () => {
  it('lists the recipes, one’s own conversations and the team’s shared ones, and introduces the page', async () => {
    const page = await open('/product');
    expect(text(page.root.querySelector('h1'))).toBe('Product');
    const groups = [...page.root.querySelectorAll('aside h3')].map(text);
    expect(groups).toEqual([
      'Recipes',
      'My conversations',
      'Shared with the team',
    ]);
    expect(
      [...page.root.querySelectorAll('aside button.recipe .title')].map(text)
    ).toEqual([
      'Split an epic into stories',
      'Is this story ready?',
      'How does it work today?',
    ]);
    expect(text(page.root.querySelector('aside'))).toContain(
      'None yet. Start one above'
    );
    const line = page.root.querySelector('a.line');
    expect(text(line?.querySelector('.title'))).toBe(
      'How does dunning work today?'
    );
    expect(text(line?.querySelector('.ah-hint'))).toBe(
      'CONV-1 · 1 question · Sam Example'
    );
    expect(text(page.root.querySelector('ah-empty-state'))).toContain(
      'Start a conversation'
    );
  });

  it('starts a conversation from a recipe, opens it, and offers the recipe’s first question', async () => {
    const page = await open('/product');
    buttonNamed(page.root, /^Split an epic into stories/).click();
    await flush(page);
    const title = dialog().querySelector<HTMLInputElement>('input')!;
    expect(title.value).toBe('Split an epic');
    type(title, 'Late fees epic');
    buttonNamed(dialog(), 'Start').click();
    await flush(page);
    await flush(page);

    const created = page.requests.find(
      (r) => r.method === 'POST' && r.path === '/conversations'
    );
    expect(created?.body).toEqual({
      title: 'Late fees epic',
      recipe: 'split-epic',
    });
    expect(text(page.root.querySelector('#conversation-title'))).toBe(
      'Late fees epic'
    );
    expect(text(page.root.querySelector('.title-row'))).toContain(
      'Split an epic into stories'
    );
    expect(composer(page.root)!.querySelector('textarea')!.value).toMatch(
      /^Split the pinned epic into stories/
    );
    expect(text(page.root.querySelector('aside.side'))).toContain(
      'No session yet. The first question starts one.'
    );
    expect(text(page.root.querySelector('nav'))).toContain('Late fees epic');
  });

  it('pins a Jira key and a meeting topic found by a search, refuses a bad key early, and unpins', async () => {
    let id = '';
    const page = await open('/product', (server) => {
      id = started(server, null);
    });
    await page.harness.navigateByUrl(`/product/${id}`);
    await flush(page);
    expect(text(page.root.querySelector('.reads'))).toContain('Nothing pinned');

    buttonNamed(page.root, '+ Add context').click();
    await flush(page);
    type(dialog().querySelector<HTMLInputElement>('input'), 'proj 1');
    buttonNamed(dialog(), 'Pin').click();
    await flush(page);
    expect(text(dialog())).toContain('A Jira key, such as PROJ-123.');
    expect(page.requests.some((r) => r.path.endsWith('/context'))).toBe(false);
    type(dialog().querySelector<HTMLInputElement>('input'), 'proj-120');
    buttonNamed(dialog(), 'Pin').click();
    await flush(page);
    expect(
      page.requests.find((r) => r.path.endsWith('/context'))?.body
    ).toEqual({ items: [{ kind: 'jira', ref: 'PROJ-120' }] });

    buttonNamed(page.root, '+ Add context').click();
    await flush(page);
    const kind = dialog().querySelector<HTMLSelectElement>('select')!;
    kind.value = 'meeting_topic';
    kind.dispatchEvent(new Event('change'));
    await flush(page);
    type(dialog().querySelector<HTMLInputElement>('input'), 'late fee');
    await flush(page);
    const radio =
      dialog().querySelector<HTMLInputElement>('input[type=radio]')!;
    expect(text(radio.closest('label'))).toContain(
      'Late fees for enterprise accounts'
    );
    radio.click();
    buttonNamed(dialog(), 'Pin').click();
    await flush(page);
    const chips = () =>
      [...page.root.querySelectorAll('.reads .pin .text')].map(text);
    expect(chips()).toEqual(['PROJ-120', 'Late fees for enterprise accounts']);

    page.root
      .querySelector<HTMLButtonElement>('button[aria-label="Unpin PROJ-120"]')!
      .click();
    await flush(page);
    expect(chips()).toEqual(['Late fees for enterprise accounts']);
  });

  it('asks, confirming the spend, streams the answer with what the agent reads, then shows its proposals and questions, and stops reading', async () => {
    let id = '';
    const page = await open('/product', (server) => {
      id = started(server, 'split-epic', [
        { kind: 'jira', ref: 'PROJ-120' },
        { kind: 'repository', ref: 'web' },
      ]);
    });
    await page.harness.navigateByUrl(`/product/${id}`);
    await flush(page);
    expect(text(composer(page.root))).toContain(
      'Sending starts a session that spends AIU, at most the default cap.'
    );
    type(composer(page.root)!.querySelector('input'), '2');
    await flush(page);
    expect(text(composer(page.root))).toContain('at most 2.0 AIU');
    buttonNamed(composer(page.root)!, 'Send').click();
    await flush(page);

    const asked = page.requests.find((r) => r.path.endsWith('/turns'));
    expect(asked?.body).toEqual({
      question:
        'Split the pinned epic into stories, in the order they should be delivered.',
      confirmSpend: true,
      budgetNanoAiu: 2_000_000_000,
    });
    expect(text(page.root.querySelector('article.turn'))).toContain(
      'Waiting for a session'
    );
    expect(buttonNamed(composer(page.root)!, 'Send').disabled).toBe(true);

    await wait(page, MOCK_START_MS + MOCK_STEP_MS * 7);
    const turn = () => page.root.querySelector('article.turn')!;
    expect(text(turn())).toContain('Answering');
    expect([...turn().querySelectorAll('.activity li')].map(text)).toContain(
      'view specs/CONV-2/conversation-request.md'
    );
    expect(text(turn().querySelector('ah-markdown'))).not.toBe('');

    await wait(page, MOCK_STEP_MS * 20);
    expect(text(turn())).toContain('Answered');
    expect(
      [...turn().querySelectorAll('ah-proposal-card h4')].map(text)
    ).toEqual([
      'Charge late fees on overdue enterprise invoices',
      'Show the late fee on the invoice PDF',
      'Waivers for late fees',
    ]);
    expect(text(turn().querySelector('ah-proposal-card'))).toContain(
      'Needs a backend change'
    );
    expect(turn().querySelectorAll('ah-proposal-card button')).toHaveLength(0);
    expect(text(turn().querySelector('.ask'))).toContain(
      'Q1 · Should the fee show on invoices already sent?'
    );
    expect(text(page.root.querySelector('aside.side dl dd'))).toMatch(
      /^\d+\.\d AIU$/
    );
    expect(text(page.root.querySelector('aside.side'))).toContain('Warm:');

    const reads = page.requests.filter(
      (r) => r.method === 'GET' && r.path === `/conversations/${id}`
    ).length;
    await wait(page, CONVERSATION_POLL_MS * 5);
    expect(
      page.requests.filter(
        (r) => r.method === 'GET' && r.path === `/conversations/${id}`
      ).length
    ).toBe(reads);
  });

  it('cancels the question being answered', async () => {
    let id = '';
    const page = await open('/product', (server) => {
      id = started(server, null, [{ kind: 'jira', ref: 'PROJ-120' }]);
    });
    await page.harness.navigateByUrl(`/product/${id}`);
    await flush(page);
    type(composer(page.root)!.querySelector('textarea'), 'Is it ready?');
    await flush(page);
    buttonNamed(composer(page.root)!, 'Send').click();
    await flush(page);
    buttonNamed(page.root, 'Cancel question').click();
    await flush(page);
    expect(
      page.requests.some(
        (r) => r.method === 'POST' && r.path.endsWith('/cancel')
      )
    ).toBe(true);
    expect(text(page.root.querySelector('article.turn'))).toContain(
      `cancelled by ${ME}`
    );
  });

  it('shows a conversation shared by someone else read-only: no pinning, no question, no cancel', async () => {
    const page = await open('/product');
    page.root.querySelector<HTMLAnchorElement>('a.line')!.click();
    await flush(page);
    expect(text(page.root.querySelector('.title-row'))).toContain(
      'Sam Example’s, read-only'
    );
    expect(composer(page.root)).toBeNull();
    expect(page.root.querySelector('.pin button')).toBeNull();
    expect(text(page.root.querySelector('article.turn'))).toContain(
      'three reminders'
    );
  });

  it('shares and deletes one’s own conversation', async () => {
    let id = '';
    const page = await open('/product', (server) => {
      id = started(server, null);
    });
    await page.harness.navigateByUrl(`/product/${id}`);
    await flush(page);
    buttonNamed(page.root, 'Share').click();
    await flush(page);
    expect(text(page.root.querySelector('.title-row'))).toContain(
      'Shared with the team'
    );
    buttonNamed(page.root, 'Delete').click();
    await flush(page);
    buttonNamed(dialog(), 'Delete').click();
    await flush(page);
    expect(
      page.requests.some(
        (r) => r.method === 'DELETE' && r.path === `/conversations/${id}`
      )
    ).toBe(true);
    expect(text(page.root.querySelector('ah-empty-state'))).toContain(
      'Start a conversation'
    );
  });
});
