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
import { meetingDay } from '@domain/meetings';
import { DRAFT_POLL_MS } from '@domain/story-drafts';
import type { ManualClock } from '@testing/mock-backend/clock';
import { MOCK_DRAFT_MS } from '@testing/mock-backend/meetings';
import type { MockRequest, MockResponse } from '@testing/mock-backend/http';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import { settle, testServer } from '@testing/mock-backend/spec-helpers';
import { ToastService } from '@ui/toast/toast';
import { meetingLine } from './meetings-shell';
import { MEETINGS_ROUTES } from './meetings.routes';

/** The data layer's `Clock` over the mock's manual clock, so both move together. */
function asClock(manual: ManualClock): Clock {
  return {
    now: () => new Date(manual.now()),
    schedule: (ms, callback) => ({ cancel: manual.schedule(ms, callback) }),
  };
}

interface Page {
  readonly server: MockAhoyServer;
  /** The mock's clock, which also drives the page's timers (the drafts' polling). */
  readonly clock: ManualClock;
  readonly harness: RouterTestingHarness;
  readonly root: HTMLElement;
  /** Every request the page made, in order. */
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

/** The Meetings routes on the seeded mock, opened at `url`. */
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
        [{ path: 'meetings', children: MEETINGS_ROUTES }],
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

/** The text of an element, whitespace collapsed. */
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

function type(field: HTMLInputElement | null, value: string): void {
  if (field === null) throw new Error('no field');
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

function submit(form: HTMLFormElement | null | undefined): void {
  if (form === null || form === undefined) throw new Error('no form');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

/** The open dialog (the CDK puts it in an overlay under `body`). */
function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '.cdk-overlay-container .ah-dialog'
  );
  if (element === null) throw new Error('no dialog open');
  return element;
}

const titles = (root: HTMLElement) =>
  [...root.querySelectorAll('ah-topic-card h3')].map((h) => text(h));
const card = (root: HTMLElement, title: string): HTMLElement => {
  const found = [...root.querySelectorAll<HTMLElement>('ah-topic-card')].find(
    (c) => text(c.querySelector('h3')) === title
  );
  if (found === undefined) throw new Error(`no topic ${title}`);
  return found;
};
const tagOf = (topic: HTMLElement) =>
  text(topic.querySelector('.head .ah-tag'));
const notesOf = (topic: HTMLElement) =>
  [...topic.querySelectorAll('li .text')].map((n) => text(n));

afterEach(() => {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
});

describe('Meetings on the mock backend', () => {
  it('opens the meeting running now, with now, next and past on the left', async () => {
    const page = await open('/meetings');
    expect(text(page.root.querySelector('h1'))).toBe('Finance sync');
    expect(text(page.root.querySelector('.identity .ah-badge'))).toBe(
      'In progress'
    );
    expect(
      [...page.root.querySelectorAll('aside h3')].map((h) => text(h))
    ).toEqual(['Now', 'Next', 'Past']);
    expect(page.root.querySelectorAll('aside a.line')).toHaveLength(3);
    expect(
      text(page.root.querySelector('aside a[aria-current="page"] .title'))
    ).toBe('Finance sync');
    expect(titles(page.root)).toEqual([
      'Overdue invoice reminders',
      'Tax ID validation for EU customers',
      'Late fees for enterprise accounts',
    ]);
    expect(tagOf(card(page.root, 'Overdue invoice reminders'))).toBe('OTHER_COMPANY');
    expect(tagOf(card(page.root, 'Late fees for enterprise accounts'))).toBe(
      'ACME · priya@'
    );
    expect(
      notesOf(card(page.root, 'Late fees for enterprise accounts'))
    ).toEqual(['1.5% per month, capped at 10% of the invoice.']);
  });

  it('adds a topic a stakeholder raised during the meeting, at the end, tagged with who raised it', async () => {
    const page = await open('/meetings');
    const composer = page.root.querySelector<HTMLElement>('ah-topic-composer')!;
    type(
      composer.querySelector('#topic-title'),
      'Refund approvals take too long'
    );
    buttonNamed(composer, 'ACME').click();
    await flush(page);
    const who = composer.querySelector<HTMLSelectElement>('#topic-who')!;
    expect([...who.options].map((o) => o.text)).toEqual([
      'priya@example.com',
      'jordan@example.com',
      'Someone else',
    ]);
    who.value = 'jordan@example.com';
    who.dispatchEvent(new Event('change'));
    submit(composer.querySelector('form'));
    await flush(page);

    expect(titles(page.root).at(-1)).toBe('Refund approvals take too long');
    const added = card(page.root, 'Refund approvals take too long');
    expect(tagOf(added)).toBe('ACME · jordan@');
    expect(text(added.querySelector('.head .ah-hint'))).toMatch(
      /^raised at \d{2}:\d{2}$/
    );
    expect(
      composer.querySelector<HTMLInputElement>('#topic-title')!.value
    ).toBe('');
    const body = page.requests.find(
      (r) => r.method === 'POST' && r.path.endsWith('/topics')
    )?.body;
    expect(body).toEqual({
      title: 'Refund approvals take too long',
      raisedBy: 'them',
      raisedByEmail: 'jordan@example.com',
    });
  });

  it('keeps the stakeholder picked for the next topic when a topic is moved up in the same meeting', async () => {
    const page = await open('/meetings');
    const composer = page.root.querySelector<HTMLElement>('ah-topic-composer')!;
    buttonNamed(composer, 'ACME').click();
    await flush(page);
    const who = composer.querySelector<HTMLSelectElement>('#topic-who')!;
    who.value = 'jordan@example.com';
    who.dispatchEvent(new Event('change'));

    const second = titles(page.root)[1]!;
    page.root
      .querySelector<HTMLButtonElement>(
        `button[aria-label="Move ${second} up"]`
      )!
      .click();
    await flush(page);

    expect(titles(page.root)[0]).toBe(second);
    expect(composer.querySelector<HTMLSelectElement>('#topic-who')!.value).toBe(
      'jordan@example.com'
    );
  });

  it('adds a note under a topic and clears the line for the next one', async () => {
    const page = await open('/meetings');
    const topic = card(page.root, 'Tax ID validation for EU customers');
    const line = topic.querySelector<HTMLInputElement>('form input')!;
    type(line, 'Check the VIES service for each new customer.');
    submit(topic.querySelector('form'));
    await flush(page);
    expect(
      notesOf(card(page.root, 'Tax ID validation for EU customers'))
    ).toEqual(['Check the VIES service for each new customer.']);
    expect(
      text(
        card(page.root, 'Tax ID validation for EU customers').querySelector(
          'li .by'
        )
      )
    ).toMatch(/^Dev Example · /);
    expect(
      card(
        page.root,
        'Tax ID validation for EU customers'
      ).querySelector<HTMLInputElement>('form input')!.value
    ).toBe('');
  });

  it('moves a topic down when asked', async () => {
    const page = await open('/meetings');
    buttonNamed(card(page.root, 'Overdue invoice reminders'), '↓').click();
    await flush(page);
    expect(titles(page.root).slice(0, 2)).toEqual([
      'Tax ID validation for EU customers',
      'Overdue invoice reminders',
    ]);
  });

  it('removes a topic only after a second click', async () => {
    const page = await open('/meetings');
    buttonNamed(
      card(page.root, 'Tax ID validation for EU customers'),
      'Remove'
    ).click();
    await flush(page);
    const topic = card(page.root, 'Tax ID validation for EU customers');
    expect(text(topic.querySelector('.actions'))).toContain(
      'Remove this topic?'
    );
    buttonNamed(topic, 'Remove').click();
    await flush(page);
    expect(titles(page.root)).not.toContain(
      'Tax ID validation for EU customers'
    );
  });

  it('ends the meeting, moving the ticked topics (those without notes, to begin with) to the next one', async () => {
    const page = await open('/meetings');
    buttonNamed(page.root.querySelector('.header')!, 'End meeting').click();
    await flush(page);
    const boxes = [
      ...dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(
      boxes.map((b) => [
        text(b.closest('label')?.querySelector('.topic span')),
        b.checked,
      ])
    ).toEqual([
      ['Overdue invoice reminders', false],
      ['Tax ID validation for EU customers', true],
      ['Late fees for enterprise accounts', false],
    ]);
    buttonNamed(dialog(), 'End meeting · move 1 topic').click();
    await flush(page);

    expect(
      document.querySelector('.cdk-overlay-container .ah-dialog')
    ).toBeNull();
    const next = page.server.meetingDesk.list('planned')[0]!;
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.text)
    ).toEqual([
      `Meeting ended. 1 topic moved to ${meetingDay(next.startsAt)}.`,
    ]);
    expect(text(page.root.querySelector('.identity .ah-tag'))).toBe('Ended');
    expect(page.root.querySelector('ah-topic-composer')).toBeNull();
    expect(text(page.root.querySelector('ah-banner'))).toContain(
      'This meeting has ended'
    );
    expect(
      text(
        card(page.root, 'Tax ID validation for EU customers').querySelector(
          '.actions'
        )
      )
    ).toContain('Moved to');
    expect(
      page.server.meetingDesk.get(next.id).topics.map((t) => t.title)
    ).toEqual(['Tax ID validation for EU customers']);
  });

  it('opens a planned meeting from the left column and starts it', async () => {
    const page = await open('/meetings');
    page.root
      .querySelector<HTMLAnchorElement>('aside ul:nth-of-type(2) a.line')!
      .click();
    await flush(page);
    expect(text(page.root.querySelector('.identity .ah-badge'))).toBe(
      'Planned'
    );
    expect(text(page.root.querySelector('.topics-head h2'))).toBe(
      'Topics to raise'
    );
    expect(text(page.root.querySelector('.none'))).toContain('No topics yet');
    buttonNamed(page.root.querySelector('.header')!, 'Start meeting').click();
    await flush(page);
    expect(text(page.root.querySelector('.identity .ah-badge'))).toBe(
      'In progress'
    );
    expect(
      buttonNamed(page.root.querySelector('.header')!, 'End meeting')
    ).toBeTruthy();
  });

  it('shows an ended meeting read-only', async () => {
    const page = await open('/meetings');
    page.root
      .querySelector<HTMLAnchorElement>('aside ul:nth-of-type(3) a.line')!
      .click();
    await flush(page);
    expect(text(page.root.querySelector('.identity .ah-tag'))).toBe('Ended');
    expect(page.root.querySelector('ah-topic-composer')).toBeNull();
    expect(page.root.querySelectorAll('ah-topic-card form')).toHaveLength(0);
    expect(
      [...page.root.querySelectorAll('.header .actions button')].map((b) =>
        text(b)
      )
    ).toEqual(['Copy for Confluence']);
  });

  it('says it cannot reach Ahoy when the list fails, and reads it again on Try again', async () => {
    const page = await open('/meetings', (server) => {
      server.switches.failNext = 503;
    });
    expect(text(page.root.querySelector('main ah-banner'))).toContain(
      "Can't reach Ahoy"
    );
    buttonNamed(
      page.root.querySelector('main ah-banner')!,
      'Try again'
    ).click();
    await flush(page);
    expect(page.root.querySelector('main > ah-banner')).toBeNull();
    expect(text(page.root.querySelector('h1'))).toBe('Finance sync');
  });

  it('copies the open meeting as Confluence markup', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => (written.push(t), Promise.resolve()),
      },
    });
    try {
      const page = await open('/meetings');
      buttonNamed(page.root, 'Copy for Confluence').click();
      await flush(page);
      expect(written[0]).toContain('h1. Finance sync');
      expect(written[0]).toContain('h2. Topics');
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.text)
      ).toEqual(['Meeting copied as Confluence markup.']);
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it("says a meeting in the address doesn't exist", async () => {
    const page = await open('/meetings/0c1d2e3f-0000-4000-8000-000000000999');
    expect(
      text(page.root.querySelector('ah-meeting-view ah-banner'))
    ).toContain("This meeting doesn't exist");
  });

  it('drafts a user story from a topic and its notes, then creates it in Jira in one click', async () => {
    const page = await open('/meetings');
    const title = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, title), 'Turn into a user story').click();
    await flush(page);
    expect(text(dialog().querySelector('.ah-dialog__title'))).toBe(
      'Turn into a user story'
    );
    expect(
      dialog().querySelectorAll('input[type="checkbox"]:checked')
    ).toHaveLength(1);
    buttonNamed(dialog(), 'Draft it for me').click();
    await flush(page);
    const asked = page.requests.find(
      (r) => r.method === 'POST' && r.path.endsWith('/story-drafts')
    );
    expect(asked?.body).toEqual({ confirmSpend: true });
    expect(text(card(page.root, title).querySelector('.story .ah-tag'))).toBe(
      'Writing the story…'
    );

    // The simulated agent finishes; the page reads the drafts again on its own.
    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    const topic = card(page.root, title);
    expect(text(topic.querySelector('.story .ah-tag'))).toBe(
      'Story ready to check'
    );

    buttonNamed(topic, 'Check the story').click();
    await flush(page);
    expect(text(dialog().querySelector('.ah-dialog__title'))).toBe(
      'Check the user story'
    );
    expect(text(dialog().querySelector('article .ah-tag'))).toBe(
      'PROJ · Story'
    );
    expect(text(dialog())).toContain('Asked for by dev@ on');
    expect(dialog().querySelectorAll('article ol li').length).toBeGreaterThan(
      0
    );
    buttonNamed(dialog(), 'Create in Jira').click();
    await flush(page);

    const created = card(page.root, title);
    expect(text(created.querySelector('.story .ah-tag'))).toBe('In Jira');
    expect(text(created.querySelector('.story a'))).toMatch(/^PROJ-\d+$/);
    expect(
      page.requests.filter(
        (r) => r.method === 'POST' && r.path.endsWith('/create-issue')
      )
    ).toHaveLength(1);
  });

  it('says why no story was written and offers to try again', async () => {
    const page = await open('/meetings');
    const title = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, title), 'Turn into a user story').click();
    await flush(page);
    buttonNamed(dialog(), 'Draft it for me').click();
    await flush(page);
    const draftId = page.server.meetingDesk
      .listDrafts(page.server.meetingDesk.list('in_progress')[0]!.id)
      .at(0)!.id;
    page.server.meetingDesk.failDraft(
      draftId,
      'The reply was not a user story.'
    );
    page.clock.advance(DRAFT_POLL_MS);
    await flush(page);

    const topic = card(page.root, title);
    expect(text(topic.querySelector('.story .ah-tag'))).toBe(
      'Story not written'
    );
    buttonNamed(topic, 'See why').click();
    await flush(page);
    expect(text(dialog().querySelector('.ah-banner'))).toContain(
      'The reply was not a user story.'
    );
    expect(buttonNamed(dialog(), 'Create in Jira').disabled).toBe(true);
    buttonNamed(dialog(), 'Try again').click();
    await flush(page);
    expect(text(card(page.root, title).querySelector('.story .ah-tag'))).toBe(
      'Writing the story…'
    );
  });

  it('grills: asks the questions one at a time, sends the answers once, then shows the story written from them', async () => {
    const page = await open('/meetings');
    const title = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, title), 'Turn into a user story').click();
    await flush(page);
    dialog()
      .querySelector<HTMLInputElement>('input[name="story-mode"]')!
      .click();
    await flush(page);
    buttonNamed(dialog(), 'Grill me').click();
    await flush(page);
    expect(
      page.requests.find(
        (r) => r.method === 'POST' && r.path.endsWith('/story-drafts')
      )?.body
    ).toEqual({ confirmSpend: true, mode: 'grill' });
    expect(text(card(page.root, title).querySelector('.story .ah-tag'))).toBe(
      'Finding questions…'
    );

    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    const topic = card(page.root, title);
    expect(text(topic.querySelector('.story .ah-tag'))).toBe(
      'Questions to answer'
    );
    buttonNamed(topic, 'Answer questions').click();
    await flush(page);
    expect(text(dialog().querySelector('.ah-dialog__title'))).toBe('Grill me');
    expect(text(dialog().querySelector('.progress strong'))).toBe(
      'Question 1 of 2'
    );
    expect(buttonNamed(dialog(), 'Next question').disabled).toBe(true);
    const answers = () => [
      ...dialog().querySelectorAll<HTMLInputElement>(
        'input[name="grill-answer"]'
      ),
    ];
    expect(answers()).toHaveLength(4);
    expect(text(dialog().querySelector('fieldset .ah-tag'))).toBe(
      'Recommended'
    );
    answers()[1]!.click();
    await flush(page);
    buttonNamed(dialog(), 'Next question').click();
    await flush(page);
    expect(text(dialog().querySelector('.progress strong'))).toBe(
      'Question 2 of 2'
    );
    expect(text(dialog().querySelector('.answered li strong'))).toBe(
      'Every user'
    );
    answers()[3]!.click();
    await flush(page);
    expect(buttonNamed(dialog(), /^Write the story/).disabled).toBe(true);
    const box = dialog().querySelector('textarea')!;
    box.value = 'Keep it, and ask finance.';
    box.dispatchEvent(new Event('input'));
    await flush(page);
    expect(page.requests.some((r) => r.path.endsWith('/answers'))).toBe(false);
    buttonNamed(dialog(), /^Write the story/).click();
    await flush(page);
    expect(
      page.requests
        .filter((r) => r.method === 'POST' && r.path.endsWith('/answers'))
        .map((r) => r.body)
    ).toEqual([
      {
        confirmSpend: true,
        answers: [
          { questionId: 'Q1', choice: 'option', option: 1 },
          {
            questionId: 'Q2',
            choice: 'own',
            text: 'Keep it, and ask finance.',
          },
        ],
        budgetNanoAiu: 5_000_000_000,
      },
    ]);
    expect(text(card(page.root, title).querySelector('.story .ah-tag'))).toBe(
      'Writing the story…'
    );

    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    buttonNamed(card(page.root, title), 'Check the story').click();
    await flush(page);
    expect(text(dialog().querySelector('article'))).toContain('Your answers');
    expect(text(dialog().querySelector('article'))).toContain(
      'Keep it, and ask finance.'
    );
  });

  it('grills a story already written, and "Stop and write the story now" leaves every question open', async () => {
    const page = await open('/meetings');
    const title = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, title), 'Turn into a user story').click();
    await flush(page);
    buttonNamed(dialog(), 'Draft it for me').click();
    await flush(page);
    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    buttonNamed(card(page.root, title), 'Check the story').click();
    await flush(page);
    buttonNamed(dialog(), 'Grill me on it').click();
    await flush(page);
    expect(
      page.requests
        .filter((r) => r.method === 'POST' && r.path.endsWith('/story-drafts'))
        .map((r) => r.body)
    ).toEqual([{ confirmSpend: true }, { confirmSpend: true, mode: 'grill' }]);
    expect(text(dialog().querySelector('ah-banner'))).toContain(
      'First Mate is finding questions to ask you'
    );

    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    expect(text(dialog().querySelector('ah-banner'))).toContain(
      'First Mate has questions'
    );
    buttonNamed(dialog(), 'Answer the questions').click();
    await flush(page);
    expect(text(dialog().querySelector('.ah-dialog__title'))).toBe('Grill me');
    buttonNamed(dialog(), 'Stop and write the story now').click();
    await flush(page);
    expect(
      page.requests.find(
        (r) => r.method === 'POST' && r.path.endsWith('/answers')
      )?.body
    ).toEqual({
      confirmSpend: true,
      answers: [],
      budgetNanoAiu: 5_000_000_000,
    });
  });

  it('discards a grill from its questions, so the topic can be drafted again', async () => {
    const page = await open('/meetings');
    const title = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, title), 'Turn into a user story').click();
    await flush(page);
    dialog()
      .querySelector<HTMLInputElement>('input[name="story-mode"]')!
      .click();
    await flush(page);
    buttonNamed(dialog(), 'Grill me').click();
    await flush(page);
    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    buttonNamed(card(page.root, title), 'Answer questions').click();
    await flush(page);
    buttonNamed(dialog(), 'Discard').click();
    await flush(page);
    expect(
      page.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)
    ).toHaveLength(1);
    expect(page.requests.some((r) => r.path.endsWith('/answers'))).toBe(false);
    expect(
      buttonNamed(card(page.root, title), 'Turn into a user story')
    ).toBeDefined();
  });

  it('does not create a story until the series has a Jira project, and lets the person set it from the review', async () => {
    const page = await open('/meetings', (server) => {
      const series = server.meetingDesk.listSeries()[0]!;
      server.meetingDesk.updateSeries(series.id, { jiraProjectKey: null });
    });
    expect(text(page.root.querySelector('.identity .jira .ah-hint'))).toBe(
      'Stories from this series are not created in Jira yet'
    );
    const title = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, title), 'Turn into a user story').click();
    await flush(page);
    buttonNamed(dialog(), 'Draft it for me').click();
    await flush(page);
    page.clock.advance(Math.max(MOCK_DRAFT_MS, DRAFT_POLL_MS));
    await flush(page);
    buttonNamed(card(page.root, title), 'Check the story').click();
    await flush(page);
    expect(buttonNamed(dialog(), 'Create in Jira').disabled).toBe(true);
    expect(text(dialog().querySelector('ah-banner'))).toContain(
      'This series has no Jira project yet'
    );
  });
});

describe('meetingLine', () => {
  const base = {
    id: 'm1',
    seriesId: null,
    seriesName: null,
    title: 'Finance sync',
    endsAt: null,
    stakeholders: [],
    startedAt: null,
    endedAt: null,
    openTopicCount: 0,
    createdBy: 'alex@example.com',
    createdByName: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedBy: 'alex@example.com',
    updatedByName: null,
    updatedAt: '2026-10-01T10:00:00.000Z',
  } as const;

  it('says how many topics a meeting has, and that it is in progress when it runs', () => {
    const at = '2026-10-06T09:40:00.000Z';
    expect(
      meetingLine({
        ...base,
        startsAt: at,
        status: 'in_progress',
        topicCount: 1,
      })
    ).toMatchObject({
      sub: expect.stringMatching(/^\d{2}:\d{2} · in progress · 1 topic$/),
      live: true,
    });
    expect(
      meetingLine({ ...base, startsAt: at, status: 'ended', topicCount: 0 }).sub
    ).toBe(`${meetingDay(at)} · no topics`);
  });
});
