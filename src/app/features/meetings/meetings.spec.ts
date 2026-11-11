import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FedevAuthService } from '@acme-fedev/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { CLOCK, type Clock } from '@core/realtime/clock';
import { LIVE_POLL_MS, meetingDay, REOPEN_FRESH_MS } from '@domain/meetings';
import { DRAFT_POLL_MS } from '@domain/story-drafts';
import type { ManualClock } from '@testing/mock-backend/clock';
import { MOCK_DRAFT_MS } from '@testing/mock-backend/meetings';
import type { MockRequest, MockResponse } from '@testing/mock-backend/http';
import type { MockAhoyServer } from '@testing/mock-backend/server';
import type { Meeting } from '@core/api/types';
import { call, settle, testServer } from '@testing/mock-backend/spec-helpers';
import { ToastService } from '@ui/toast/toast';
import { meetingLine } from './meetings-shell';
import { SEARCH_PAUSE_MS, UNDO_MS } from './meetings-store';
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

function type(
  field: HTMLInputElement | HTMLTextAreaElement | null,
  value: string
): void {
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

/** The input or textarea a field's label names. */
function fieldNamed(
  root: HTMLElement,
  label: string
): HTMLInputElement | HTMLTextAreaElement {
  const found = [...root.querySelectorAll('label')].find(
    (l) => text(l).replace(/\s*(\*|\(optional\))$/, '') === label
  );
  const id = found?.getAttribute('for');
  const control =
    id === null || id === undefined
      ? null
      : root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (control === null) throw new Error(`no field labelled ${label}`);
  return control;
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
    const groups = [...page.root.querySelectorAll('aside h3')].map((h) =>
      text(h)
    );
    expect(groups[0]).toBe('Now');
    expect(groups.slice(1)).toHaveLength(1);
    expect(groups[1]).toMatch(/^(This week|Next week|Week of .+|Earlier)$/);
    expect(page.root.querySelectorAll('aside a.line')).toHaveLength(2);
    expect(
      page.root
        .querySelector('aside .views button[aria-pressed="true"]')
        ?.textContent?.trim()
    ).toBe('Upcoming');
    expect(
      text(page.root.querySelector('aside a[aria-current="page"] .title'))
    ).toBe('Finance sync');
    expect(titles(page.root)).toEqual([
      'Overdue invoice reminders',
      'Tax ID validation for EU customers',
      'Late fees for enterprise accounts',
    ]);
    expect(tagOf(card(page.root, 'Overdue invoice reminders'))).toBe('Us');
    expect(tagOf(card(page.root, 'Late fees for enterprise accounts'))).toBe(
      'Stakeholders · priya@'
    );
    expect(
      notesOf(card(page.root, 'Late fees for enterprise accounts'))
    ).toEqual(['1.5% per month, capped at 10% of the invoice.']);
  });

  it('tags topics and the composer with the names Team settings › Meetings gives the two sides', async () => {
    const page = await open('/meetings', (server) =>
      server.setMeetingLabels('Northwind', 'Contoso')
    );
    expect(tagOf(card(page.root, 'Overdue invoice reminders'))).toBe(
      'Northwind'
    );
    expect(tagOf(card(page.root, 'Late fees for enterprise accounts'))).toBe(
      'Contoso · priya@'
    );
    const composer = page.root.querySelector<HTMLElement>('ah-topic-composer')!;
    expect(buttonNamed(composer, 'Contoso')).toBeTruthy();
    expect(
      page.requests.filter((r) => r.path.endsWith('/settings/meetings'))
    ).toHaveLength(1);
  });

  it('reads a meeting that is not live and its drafts again when it is opened again later, so what others changed shows', async () => {
    const page = await open('/meetings', (server) => {
      for (const m of server.meetingDesk.list('in_progress'))
        call(server, 'POST', `/meetings/${m.id}/end`, { carryOver: [] });
    });
    const shown = page.requests.find(
      (r) => r.method === 'GET' && /^\/meetings\/[^/]+$/.test(r.path)
    )!.path;
    const reads = (path: string) =>
      page.requests.filter((r) => r.method === 'GET' && r.path === path).length;
    expect(reads(shown)).toBe(1);
    expect(reads(`${shown}/story-drafts`)).toBe(1);

    await page.harness.navigateByUrl(shown);
    await flush(page);
    expect(reads(shown)).toBe(1);
    expect(reads(`${shown}/story-drafts`)).toBe(1);

    await page.harness.navigateByUrl('/meetings');
    await flush(page);
    page.clock.advance(REOPEN_FRESH_MS);
    await page.harness.navigateByUrl(shown);
    await flush(page);
    expect(reads(shown)).toBe(2);
    expect(reads(`${shown}/story-drafts`)).toBe(2);
  });

  it('reads a meeting and its drafts once when it opens, and not again when the address names the meeting on screen', async () => {
    const page = await open('/meetings');
    const reads = (path: RegExp) =>
      page.requests.filter((r) => r.method === 'GET' && path.test(r.path))
        .length;
    const running = page.server.meetingDesk.list('in_progress')[0]!;
    const meeting = new RegExp(`/meetings/${running.id}$`);
    expect(reads(meeting)).toBe(1);
    expect(reads(/\/story-drafts$/)).toBe(1);
    expect(reads(/\/meeting-notes$/)).toBe(2);

    // `/meetings` and `/meetings/:id` are two routes: the page is drawn anew for the same meeting.
    await page.harness.navigateByUrl(`/meetings/${running.id}`);
    await flush(page);
    expect(reads(meeting)).toBe(1);
    expect(reads(/\/story-drafts$/)).toBe(1);
    expect(reads(/\/meeting-notes$/)).toBe(2);

    const other = page.server.meetingDesk
      .list()
      .find((m) => m.id !== running.id)!;
    await page.harness.navigateByUrl(`/meetings/${other.id}`);
    await flush(page);
    expect(reads(new RegExp(`/meetings/${other.id}$`))).toBe(1);
    expect(
      page.requests.filter(
        (r) =>
          r.method === 'GET' && r.path === `/meetings/${other.id}/story-drafts`
      )
    ).toHaveLength(1);
    expect(reads(/\/story-drafts$/)).toBe(2);
  });

  it('adds a topic a stakeholder raised during the meeting, at the end, tagged with who raised it', async () => {
    const page = await open('/meetings');
    const composer = page.root.querySelector<HTMLElement>('ah-topic-composer')!;
    type(
      composer.querySelector('#topic-title'),
      'Refund approvals take too long'
    );
    buttonNamed(composer, 'Stakeholders').click();
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
    expect(tagOf(added)).toBe('Stakeholders · jordan@');
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
      raisedByStakeholder: 'jordan@example.com',
    });
  });

  it('keeps the stakeholder picked for the next topic when a topic is moved up in the same meeting', async () => {
    const page = await open('/meetings');
    const composer = page.root.querySelector<HTMLElement>('ah-topic-composer')!;
    buttonNamed(composer, 'Stakeholders').click();
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
    const line =
      topic.querySelector<HTMLTextAreaElement>('form textarea.line')!;
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
      ).querySelector<HTMLTextAreaElement>('form textarea.line')!.value
    ).toBe('');
  });

  describe('images on notes', () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const TOPIC = 'Tax ID validation for EU customers';
    const made: string[] = [];
    const revoked: string[] = [];
    const real = {
      create: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
      revoke: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
    };

    beforeEach(() => {
      made.length = 0;
      revoked.length = 0;
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: () => {
          made.push(`blob:fake/${made.length + 1}`);
          return made.at(-1)!;
        },
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: (url: string) => revoked.push(url),
      });
    });

    afterEach(() => {
      for (const [name, descriptor] of [
        ['createObjectURL', real.create],
        ['revokeObjectURL', real.revoke],
      ] as const)
        if (descriptor) Object.defineProperty(URL, name, descriptor);
        else Reflect.deleteProperty(URL, name);
    });

    function paste(field: Element | null, files: readonly File[]): void {
      if (field === null) throw new Error('no field');
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files } });
      field.dispatchEvent(event);
    }

    function choose(
      input: HTMLInputElement | null,
      files: readonly File[]
    ): void {
      if (input === null) throw new Error('no file input');
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: files,
      });
      input.dispatchEvent(new Event('change'));
    }

    const screen = () => new File([PNG], 'screen.png', { type: 'image/png' });
    const thumbs = (topic: HTMLElement) =>
      [...topic.querySelectorAll<HTMLImageElement>('ah-note-images img')].map(
        (i) => i.getAttribute('src')
      );

    it('answers a question after its meeting ended, with an image, though the rest stays read-only', async () => {
      let endedId = '';
      const page = await open('/meetings', (server) => {
        const running = (
          call(server, 'GET', '/meetings').body as {
            items: { id: string; status: string }[];
          }
        ).items.find((m) => m.status === 'in_progress')!;
        const topic = (
          call(server, 'GET', `/meetings/${running.id}`).body as Meeting
        ).topics[0]!;
        call(server, 'POST', `/meeting-topics/${topic.id}/notes`, {
          text: 'Who signs off?',
          kind: 'question',
        });
        call(server, 'POST', `/meetings/${running.id}/end`, { carryOver: [] });
        endedId = running.id;
      });
      await page.harness.navigateByUrl(`/meetings/${endedId}`);
      await flush(page);
      expect(text(page.root.querySelector('.identity .ah-tag'))).toBe('Ended');
      const topic = () =>
        [...page.root.querySelectorAll<HTMLElement>('ah-topic-card')].find(
          (c) => text(c).includes('Who signs off?')
        )!;
      expect(topic().querySelector('form:not(.answer)')).toBeNull();
      buttonNamed(topic(), 'Answer').click();
      await flush(page);
      const form = topic().querySelector<HTMLFormElement>('form.answer')!;
      choose(form.querySelector('input[type="file"]'), [screen()]);
      await flush(page);
      expect(text(form.querySelector('.pending'))).toContain('screen.png');
      type(form.querySelector('input.line'), 'Ana, after the meeting');
      submit(form);
      await flush(page);
      expect(text(topic().querySelector('li .status'))).toBe('Answered');
      const answer = topic().querySelector<HTMLElement>('ul.answers li')!;
      expect(text(answer.querySelector('.text'))).toBe(
        'Ana, after the meeting'
      );
      expect(answer.querySelectorAll('ah-note-images li')).toHaveLength(1);
      choose(answer.querySelector<HTMLInputElement>('input[type=file]'), [
        new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
      ]);
      await flush(page);
      expect(text(topic().querySelector('.image-hint'))).toBe(
        'Only PNG, JPEG, WebP and GIF images can be added.'
      );
      buttonNamed(answer, 'Remove').click();
      await flush(page);
      expect(text(topic().querySelector('ul.answers .removed'))).toContain(
        'Answer removed.'
      );
      expect(page.requests.at(-1)?.method).not.toBe('DELETE');
      page.clock.advance(UNDO_MS);
      await flush(page);
      expect(topic().querySelector('ul.answers')).toBeNull();
      expect(text(topic().querySelector('li .status'))).toBe('Open');
    });

    it('adds an image pasted into the line with the next note, shows it, opens it large and removes it', async () => {
      const page = await open('/meetings');
      const line = card(page.root, TOPIC).querySelector('form textarea.line');
      paste(line, [screen()]);
      await flush(page);
      expect(text(card(page.root, TOPIC).querySelector('.pending'))).toContain(
        'screen.png'
      );
      submit(card(page.root, TOPIC).querySelector('form'));
      await flush(page);
      const topic = card(page.root, TOPIC);
      expect(notesOf(topic)).toEqual(['Image']);
      expect(thumbs(topic)).toEqual(['blob:fake/1']);
      expect(topic.querySelector('.pending')).toBeNull();
      const upload = page.requests.find((r) => r.path.endsWith('/images'))!;
      expect(upload.headers['content-type']).toBe('image/png');
      expect(upload.body).toEqual(PNG);

      const thumb = topic.querySelector<HTMLButtonElement>('.thumb')!;
      expect(thumb.getAttribute('aria-label')).toBe('Image 1 of 1');
      thumb.click();
      await flush(page);
      expect(dialog().querySelector('img')?.getAttribute('src')).toBe(
        'blob:fake/1'
      );
      buttonNamed(dialog(), 'Close').click();
      await flush(page);

      topic.querySelector<HTMLButtonElement>('.remove-image')!.click();
      await flush(page);
      expect(thumbs(card(page.root, TOPIC))).toEqual([]);
      expect(page.requests.at(-1)?.method).toBe('DELETE');
    });

    it('adds a chosen image to a note already taken, and says why an SVG is left out', async () => {
      const page = await open('/meetings');
      const line = card(page.root, TOPIC).querySelector<HTMLTextAreaElement>(
        'form textarea.line'
      );
      type(line, 'The VIES error screen');
      submit(card(page.root, TOPIC).querySelector('form'));
      await flush(page);
      const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
      choose(
        card(page.root, TOPIC).querySelector<HTMLInputElement>(
          'li input[type=file]'
        ),
        [svg, screen()]
      );
      await flush(page);
      const topic = card(page.root, TOPIC);
      expect(notesOf(topic)).toEqual(['The VIES error screen']);
      expect(thumbs(topic)).toEqual(['blob:fake/1']);
      expect(text(topic.querySelector('.image-hint'))).toBe(
        'Only PNG, JPEG, WebP and GIF images can be added.'
      );
    });

    it('counts the images of a note in the Confluence markup', async () => {
      const written: string[] = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (t: string) => (written.push(t), Promise.resolve()),
        },
      });
      try {
        const page = await open('/meetings');
        const line = card(page.root, TOPIC).querySelector<HTMLTextAreaElement>(
          'form textarea.line'
        );
        type(line, 'The VIES error screen');
        paste(line, [screen(), screen()]);
        submit(card(page.root, TOPIC).querySelector('form'));
        await flush(page);
        buttonNamed(page.root, 'Copy for Confluence').click();
        await flush(page);
        expect(written[0]).toContain('* The VIES error screen (2 images) _(');
      } finally {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    });
  });

  it('edits a note in place, turning it into an action with an owner, and Esc leaves it as it was', async () => {
    const page = await open('/meetings');
    const TOPIC = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, TOPIC), 'Edit').click();
    await flush(page);
    const form = card(page.root, TOPIC).querySelector<HTMLFormElement>(
      'form.edit'
    )!;
    const field = form.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(field.value).toBe('1.5% per month, capped at 10% of the invoice.');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush(page);
    expect(card(page.root, TOPIC).querySelector('form.edit')).toBeNull();

    card(page.root, TOPIC)
      .querySelector<HTMLElement>('li .text')!
      .dispatchEvent(new MouseEvent('dblclick'));
    await flush(page);
    const again = card(page.root, TOPIC).querySelector<HTMLFormElement>(
      'form.edit'
    )!;
    type(again.querySelector('textarea'), 'Draft the late-fee wording');
    const kind = again.querySelector<HTMLSelectElement>('select')!;
    kind.value = 'action';
    kind.dispatchEvent(new Event('change'));
    await flush(page);
    type(again.querySelector('input.owner'), 'Priya');
    again
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush(page);

    const patch = page.requests.find((r) => r.method === 'PATCH')!;
    expect(patch.body).toEqual({
      text: 'Draft the late-fee wording',
      kind: 'action',
      owner: 'Priya',
      dueOn: null,
    });
    const topic = card(page.root, TOPIC);
    expect(topic.querySelector('form.edit')).toBeNull();
    expect(notesOf(topic)).toEqual(['Draft the late-fee wording']);
    expect(text(topic.querySelector('li .kind'))).toBe('Action');
  });

  it('renames a topic from its menu; Enter saves the new title', async () => {
    const page = await open('/meetings');
    buttonNamed(card(page.root, 'Overdue invoice reminders'), '⋯').click();
    await flush(page);
    buttonNamed(
      card(page.root, 'Overdue invoice reminders').querySelector(
        '[role="menu"]'
      )!,
      'Rename'
    ).click();
    await flush(page);
    const form = page.root.querySelector<HTMLFormElement>('form.rename')!;
    type(form.querySelector('input'), 'Automate invoice reminders');
    submit(form);
    await flush(page);
    expect(titles(page.root)[0]).toBe('Automate invoice reminders');
    expect(page.root.querySelector('form.rename')).toBeNull();
  });

  it('removes a note at once with Undo, which brings it back without asking the API', async () => {
    const page = await open('/meetings');
    const TOPIC = 'Overdue invoice reminders';
    buttonNamed(card(page.root, TOPIC), 'Remove').click();
    await flush(page);
    expect(notesOf(card(page.root, TOPIC))).toEqual([]);
    expect(text(card(page.root, TOPIC).querySelector('.removed'))).toContain(
      'Note removed.'
    );
    buttonNamed(card(page.root, TOPIC), 'Undo').click();
    await flush(page);
    page.clock.advance(UNDO_MS);
    await flush(page);
    expect(notesOf(card(page.root, TOPIC))).toEqual([
      'About 120 reminders a month are sent by hand.',
    ]);
    expect(page.requests.some((r) => r.method === 'DELETE')).toBe(false);

    buttonNamed(card(page.root, TOPIC), 'Remove').click();
    await flush(page);
    page.clock.advance(UNDO_MS);
    await flush(page);
    expect(page.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1);
    expect(card(page.root, TOPIC).querySelector('.removed')).toBeNull();
    expect(notesOf(card(page.root, TOPIC))).toEqual([]);
  });

  it('moves a topic to a meeting the person picks, at the top of its topics', async () => {
    const page = await open('/meetings', (server) => {
      const oneOff = server.meetingDesk.create('alex@example.com', {
        title: 'Pricing workshop',
        startsAt: '2026-10-09T14:00:00.000Z',
      });
      server.meetingDesk.addTopic('alex@example.com', oneOff.id, {
        title: 'Discount bands',
        raisedBy: 'us',
      });
    });
    const workshop = page.server.meetingDesk
      .list('planned')
      .find((m) => m.title === 'Pricing workshop')!;
    buttonNamed(
      card(page.root, 'Late fees for enterprise accounts'),
      '⋯'
    ).click();
    await flush(page);
    buttonNamed(
      card(page.root, 'Late fees for enterprise accounts').querySelector(
        '[role="menu"]'
      )!,
      'Move to…'
    ).click();
    await flush(page);
    const choices = [
      ...dialog().querySelectorAll<HTMLInputElement>('input[name="move-to"]'),
    ];
    expect(choices).toHaveLength(2);
    expect(text(choices[0]!.closest('label'))).toContain('next in this series');
    choices.find((c) => c.value === workshop.id)!.click();
    [
      ...dialog().querySelectorAll<HTMLInputElement>(
        'input[name="move-position"]'
      ),
    ][1]!.click();
    await flush(page);
    buttonNamed(dialog(), 'Move topic').click();
    await flush(page);

    expect(page.requests.find((r) => r.path.endsWith('/move'))?.body).toEqual({
      toMeetingId: workshop.id,
      position: 'first',
    });
    expect(
      page.server.meetingDesk.get(workshop.id).topics.map((t) => t.title)
    ).toEqual(['Late fees for enterprise accounts', 'Discount bands']);
    expect(
      text(
        card(page.root, 'Late fees for enterprise accounts').querySelector(
          '.actions'
        )
      )
    ).toContain('Moved to');
  });

  it('removes a note still within Undo before its topic moves, so the note is not copied', async () => {
    const page = await open('/meetings');
    const TOPIC = 'Overdue invoice reminders';
    buttonNamed(card(page.root, TOPIC), 'Remove').click();
    await flush(page);
    buttonNamed(card(page.root, TOPIC), '⋯').click();
    await flush(page);
    buttonNamed(
      card(page.root, TOPIC).querySelector('[role="menu"]')!,
      'Move to…'
    ).click();
    await flush(page);
    buttonNamed(dialog(), 'Move topic').click();
    await flush(page);

    const kinds = page.requests
      .filter((r) => r.method === 'DELETE' || r.path.endsWith('/move'))
      .map((r) => r.method);
    expect(kinds).toEqual(['DELETE', 'POST']);
    const moved = page.requests.find((r) => r.path.endsWith('/move'))!;
    const copy = page.server.meetingDesk
      .list('planned')
      .flatMap((m) => page.server.meetingDesk.get(m.id).topics)
      .find((t) => t.title === TOPIC && t.carriedFrom !== null);
    expect(moved).toBeDefined();
    expect(copy?.notes).toEqual([]);
    page.clock.advance(UNDO_MS);
    await flush(page);
    expect(page.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });

  it('keeps Move topic off while the filter hides the chosen meeting', async () => {
    const page = await open('/meetings', (server) => {
      for (const day of [12, 13, 14, 15, 16])
        server.meetingDesk.create('alex@example.com', {
          title: `Workshop ${day}`,
          startsAt: `2026-10-${day}T14:00:00.000Z`,
        });
    });
    const TOPIC = 'Late fees for enterprise accounts';
    buttonNamed(card(page.root, TOPIC), '⋯').click();
    await flush(page);
    buttonNamed(
      card(page.root, TOPIC).querySelector('[role="menu"]')!,
      'Move to…'
    ).click();
    await flush(page);
    expect(buttonNamed(dialog(), 'Move topic').disabled).toBe(false);
    type(dialog().querySelector('#move-filter'), 'workshop 14');
    await flush(page);
    expect(
      dialog().querySelectorAll('input[name="move-to"]:checked')
    ).toHaveLength(0);
    expect(buttonNamed(dialog(), 'Move topic').disabled).toBe(true);
    dialog().querySelector<HTMLInputElement>('input[name="move-to"]')!.click();
    await flush(page);
    expect(buttonNamed(dialog(), 'Move topic').disabled).toBe(false);
  });

  it("sets a one-off meeting's own Jira project when it is planned, and changes it after it ended", async () => {
    const page = await open('/meetings');
    buttonNamed(page.root.querySelector('aside')!, 'New meeting').click();
    await flush(page);
    const form = dialog().querySelector('form')!;
    const series = form.querySelector<HTMLSelectElement>('select')!;
    series.value = 'one-off';
    series.dispatchEvent(new Event('change'));
    await flush(page);
    type(dialog().querySelector('input[formcontrolname="name"]'), 'Workshop');
    type(dialog().querySelector('input[formcontrolname="jiraKey"]'), 'ops');
    buttonNamed(dialog(), 'Plan meeting').click();
    await flush(page);
    const created = page.requests.find(
      (r) => r.method === 'POST' && r.path.endsWith('/meetings')
    )!;
    expect(created.body).toMatchObject({
      title: 'Workshop',
      jiraProjectKey: 'OPS',
      jiraIssueType: 'Story',
    });
    expect(text(page.root.querySelector('.identity .jira'))).toContain(
      'Stories go to OPS · Story'
    );

    buttonNamed(page.root.querySelector('.header')!, 'Mark done').click();
    await flush(page);
    buttonNamed(dialog(), /^Mark done/).click();
    await flush(page);
    buttonNamed(page.root.querySelector('.identity .jira')!, 'Change').click();
    await flush(page);
    type(dialog().querySelector('input[formcontrolname="projectKey"]'), 'FIN');
    buttonNamed(dialog(), 'Save').click();
    await flush(page);
    expect(
      page.requests.find((r) => r.path.endsWith('/jira-target'))?.body
    ).toEqual({ jiraProjectKey: 'FIN', jiraIssueType: 'Story' });
    expect(text(page.root.querySelector('.identity .jira'))).toContain(
      'Stories go to FIN · Story'
    );
  });

  it('lists past meetings by month and the meetings of each series, and goes from one meeting of a series to the next', async () => {
    const page = await open('/meetings');
    buttonNamed(page.root.querySelector('aside .views')!, 'Series').click();
    await flush(page);
    expect(
      [...page.root.querySelectorAll('aside h3')].map((h) => text(h))
    ).toEqual(['Now', 'Finance sync']);
    expect(page.root.querySelectorAll('aside a.line')).toHaveLength(4);

    const nav = page.root.querySelector('.series-nav')!;
    const links = [...nav.querySelectorAll('a')].map((a) => text(a));
    expect(links).toHaveLength(2);
    expect(links[0]).toMatch(/^‹ /);
    nav.querySelectorAll<HTMLAnchorElement>('a')[1]!.click();
    await flush(page);
    expect(text(page.root.querySelector('.identity .ah-badge'))).toBe(
      'Planned'
    );
  });

  it('finds meetings, topics and notes from the search box, and shows the list again on Esc', async () => {
    const page = await open('/meetings');
    const box = page.root.querySelector<HTMLInputElement>('#meeting-search')!;
    type(box, 'invoice');
    await flush(page);
    expect(text(page.root.querySelector('aside nav'))).toContain('Searching');
    page.clock.advance(SEARCH_PAUSE_MS);
    await flush(page);
    const results = page.root.querySelector(
      'nav[aria-label="Search results"]'
    )!;
    expect([...results.querySelectorAll('h3')].map((h) => text(h))).toEqual([
      'Topics',
      'Notes',
    ]);
    expect(text(results.querySelector('a .title'))).toBe(
      'Overdue invoice reminders'
    );
    expect(
      page.requests.filter((r) => r.path.endsWith('/meeting-search'))
    ).toHaveLength(1);
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush(page);
    expect(
      page.root.querySelector('nav[aria-label="Search results"]')
    ).toBeNull();
    expect(
      page.root.querySelector('nav[aria-label="Meetings"]')
    ).not.toBeNull();
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

  it('removes a topic from its menu, only after a second click', async () => {
    const page = await open('/meetings');
    const more = buttonNamed(
      card(page.root, 'Tax ID validation for EU customers'),
      '⋯'
    );
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    await flush(page);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    buttonNamed(
      card(page.root, 'Tax ID validation for EU customers').querySelector(
        '[role="menu"]'
      )!,
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

  it('marks a planned meeting done without starting it', async () => {
    const page = await open('/meetings');
    page.root
      .querySelector<HTMLAnchorElement>('aside ul:nth-of-type(2) a.line')!
      .click();
    await flush(page);
    const header = page.root.querySelector('.header')!;
    expect(
      [...header.querySelectorAll('.actions button')].map((b) => text(b))
    ).toEqual([
      'Copy for Confluence',
      'Cancel meeting',
      'Mark done',
      'Start meeting',
    ]);
    buttonNamed(header, 'Mark done').click();
    await flush(page);
    expect(text(dialog())).toContain('Mark Finance sync done?');
    buttonNamed(dialog(), 'Mark done').click();
    await flush(page);

    expect(text(page.root.querySelector('.identity .ah-tag'))).toBe('Ended');
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.text)
    ).toEqual(['Meeting marked done.']);
    expect(
      page.requests
        .filter((r) => r.method === 'POST')
        .map((r) => r.path.split('/').at(-1))
    ).toEqual(['end']);
  });

  it('cancels a planned meeting, moving every open topic to the next one, and shows it cancelled', async () => {
    const page = await open('/meetings');
    page.root
      .querySelector<HTMLAnchorElement>('aside ul:nth-of-type(2) a.line')!
      .click();
    await flush(page);
    const planned = page.server.meetingDesk.list('planned')[0]!;
    const composer = page.root.querySelector<HTMLElement>('ah-topic-composer')!;
    type(composer.querySelector('#topic-title'), 'Supplier prices');
    submit(composer.querySelector('form'));
    await flush(page);

    buttonNamed(page.root.querySelector('.header')!, 'Cancel meeting').click();
    await flush(page);
    expect(text(dialog())).toContain('Cancel Finance sync?');
    expect(
      [
        ...dialog().querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]'
        ),
      ].map((b) => b.checked)
    ).toEqual([true]);
    buttonNamed(dialog(), 'Cancel meeting · move 1 topic').click();
    await flush(page);

    expect(text(page.root.querySelector('.identity .ah-tag'))).toBe(
      'Cancelled'
    );
    expect(page.root.querySelector('ah-topic-composer')).toBeNull();
    expect(text(page.root.querySelector('ah-banner'))).toContain(
      'This meeting was cancelled'
    );
    expect(
      text(page.root.querySelector('aside a[aria-current="page"] .ah-hint'))
    ).toContain(`${meetingDay(planned.startsAt)} · cancelled`);
    const next = page.server.meetingDesk.list('planned')[0]!;
    expect(
      page.server.meetingDesk.get(next.id).topics.map((t) => t.title)
    ).toEqual(['Supplier prices']);
  });

  it('carries the topics of a meeting whose series has no next meeting to another meeting the person picks', async () => {
    let id = '';
    let topicId = '';
    const page = await open('/meetings', (server) => {
      const series = server.meetingDesk.createSeries('alex@example.com', {
        name: 'Pricing review',
        stakeholders: [],
      });
      id = server.meetingDesk.create('alex@example.com', {
        seriesId: series.id,
        startsAt: '2026-10-20T09:00:00.000Z',
      }).id;
      topicId = server.meetingDesk.addTopic('alex@example.com', id, {
        title: 'Supplier prices',
        raisedBy: 'us',
      }).id;
    });
    const target = page.server.meetingDesk.list('in_progress')[0]!;
    await page.harness.navigateByUrl(`/meetings/${id}`);
    await flush(page);
    buttonNamed(page.root.querySelector('.header')!, 'Cancel meeting').click();
    await flush(page);
    expect(text(dialog())).toContain('to the meeting you choose');
    const where = dialog().querySelector<HTMLSelectElement>(
      '.destination select'
    )!;
    const options = [...where.options].map((o) => o.text.trim());
    expect(options.some((o) => o.includes('next in this series'))).toBe(false);
    expect(where.value).toBe(target.id);
    expect(
      dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .checked
    ).toBe(false);
    buttonNamed(dialog(), /^Cancel meeting$/);
    dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await flush(page);
    buttonNamed(dialog(), /^Cancel meeting · move 1 topic$/).click();
    await flush(page);

    expect(text(page.root.querySelector('.identity .ah-tag'))).toBe(
      'Cancelled'
    );
    expect(page.requests.find((r) => r.path.endsWith('/cancel'))?.body).toEqual(
      { carryOver: [topicId], carryOverTo: target.id }
    );
    expect(
      page.server.meetingDesk.get(target.id).topics.map((t) => t.title)
    ).toContain('Supplier prices');
  });

  it('plans a one-off meeting with stakeholders named or by e-mail', async () => {
    const page = await open('/meetings');
    buttonNamed(page.root.querySelector('aside')!, 'New meeting').click();
    await flush(page);
    const form = dialog().querySelector('form')!;
    const series = form.querySelector<HTMLSelectElement>('select')!;
    series.value = [...series.options].find(
      (o) => o.text === 'One-off meeting'
    )!.value;
    series.dispatchEvent(new Event('change'));
    await flush(page);
    const inputs = (name: string) =>
      form.querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`);
    type(inputs('name'), 'Pricing review');
    type(inputs('stakeholders'), 'Ana Silva, Priya@Example.com, ana silva');
    type(inputs('date'), '2026-10-22');
    type(inputs('time'), '09:30');
    buttonNamed(dialog(), 'Plan meeting').click();
    await flush(page);

    const body = page.requests.find(
      (r) => r.method === 'POST' && r.path.endsWith('/meetings')
    )?.body;
    expect(body).toMatchObject({
      title: 'Pricing review',
      stakeholders: ['Ana Silva', 'priya@example.com'],
    });
  });

  it('shows an ended meeting read-only', async () => {
    const page = await open('/meetings');
    buttonNamed(page.root.querySelector('aside .views')!, 'Past').click();
    await flush(page);
    expect(
      [...page.root.querySelectorAll('aside h3')].map((h) => text(h))[1]
    ).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    page.root
      .querySelector<HTMLAnchorElement>('aside ul:nth-of-type(2) a.line')!
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
    expect(text(page.root.querySelector('.meetings-main ah-banner'))).toContain(
      "Can't reach Ahoy"
    );
    buttonNamed(
      page.root.querySelector('.meetings-main ah-banner')!,
      'Try again'
    ).click();
    await flush(page);
    expect(page.root.querySelector('.meetings-main > ah-banner')).toBeNull();
    expect(text(page.root.querySelector('h1'))).toBe('Finance sync');
  });

  it("shows the series' open actions above the topics, overdue ones in red, and ticks one done", async () => {
    const page = await open('/meetings');
    const panel = page.root.querySelector<HTMLElement>('ah-actions-panel')!;
    const items = () => [
      ...panel.querySelectorAll<HTMLElement>(
        'ul[aria-label="Open actions"] li'
      ),
    ];
    expect(items()).toHaveLength(1);
    const [action] = items();
    expect(text(action!.querySelector('.text'))).toBe(
      'Profile the export query on the largest account'
    );
    expect(text(action)).toContain('Sam');
    expect(text(action!.querySelector('.overdue'))).toMatch(/^overdue since /);
    expect(text(action!.querySelector('a'))).toMatch(
      /^Dashboard exports time out, /
    );
    const box = action!.querySelector<HTMLInputElement>('input')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await flush(page);
    expect(items()).toHaveLength(0);
    expect(panel.querySelector('section')).toBeNull();
    expect(
      page.requests.some((r) => r.method === 'POST' && r.path.endsWith('/done'))
    ).toBe(true);
  });

  it('adds an action with an owner and a due day, tagged under its topic and listed as open', async () => {
    const page = await open('/meetings');
    const topic = card(page.root, 'Tax ID validation for EU customers');
    const kind = topic.querySelector<HTMLSelectElement>('form select')!;
    kind.value = 'action';
    kind.dispatchEvent(new Event('change'));
    await flush(page);
    type(topic.querySelector('form textarea.line'), 'Ask finance for the list');
    type(topic.querySelector('form input.owner'), 'Priya');
    type(topic.querySelector('form input.due'), '2026-10-30');
    submit(topic.querySelector('form'));
    await flush(page);
    const after = card(page.root, 'Tax ID validation for EU customers');
    expect(text(after.querySelector('li .kind'))).toBe('Action');
    expect(text(after.querySelector('li'))).toContain('Priya');
    expect(text(after.querySelector('li'))).toContain('due Fri 30 Oct');
    expect(
      [
        ...page.root.querySelectorAll(
          'ah-actions-panel ul[aria-label="Open actions"] li .text'
        ),
      ].map((n) => text(n))
    ).toContain('Ask finance for the list');
    expect(after.querySelector('form input.owner')).toBeNull();
    expect(after.querySelector<HTMLSelectElement>('form select')!.value).toBe(
      'note'
    );
  });

  it('reads a typed /d as a decision and lists it as decided in this meeting', async () => {
    const page = await open('/meetings');
    const topic = card(page.root, 'Tax ID validation for EU customers');
    type(
      topic.querySelector('form textarea.line'),
      '/d Validate with VIES only'
    );
    submit(topic.querySelector('form'));
    await flush(page);
    expect(
      notesOf(card(page.root, 'Tax ID validation for EU customers'))
    ).toEqual(['Validate with VIES only']);
    expect(
      [
        ...page.root.querySelectorAll(
          'ah-actions-panel ul[aria-label="Decisions"] li'
        ),
      ].map((n) => text(n))
    ).toEqual(['Validate with VIES only']);
  });

  it('answers a question under its topic, which shows it answered with the answer under it, and reopens it', async () => {
    const page = await open('/meetings');
    const title = 'Tax ID validation for EU customers';
    type(
      card(page.root, title).querySelector('form textarea.line'),
      '/q Do EU customers need a VAT number?'
    );
    submit(card(page.root, title).querySelector('form'));
    await flush(page);
    const status = () =>
      text(card(page.root, title).querySelector('li .status'));
    const panelQuestions = () =>
      [
        ...page.root.querySelectorAll(
          'ah-actions-panel ul[aria-label="Open questions"] li .text'
        ),
      ].map((n) => text(n));
    expect(status()).toBe('Open');
    expect(panelQuestions()).toEqual(['Do EU customers need a VAT number?']);
    buttonNamed(card(page.root, title), 'Answer').click();
    await flush(page);
    const form = card(page.root, title).querySelector<HTMLFormElement>(
      'form.answer'
    )!;
    expect(text(form)).toContain('Enter adds it.');
    type(form.querySelector('input'), 'Only for B2B customers');
    submit(form);
    await flush(page);
    const topic = card(page.root, title);
    expect(status()).toBe('Answered');
    expect(topic.querySelector('form.answer')).toBeNull();
    expect(
      [...topic.querySelectorAll('ul.answers li .text')].map((n) => text(n))
    ).toEqual(['Only for B2B customers']);
    expect(
      topic.querySelector('ul[aria-label^="Notes on"] > li')!.classList
    ).not.toContain('done');
    expect(panelQuestions()).toEqual([]);
    buttonNamed(topic, 'Reopen').click();
    await flush(page);
    expect(status()).toBe('Open');
    expect(panelQuestions()).toEqual(['Do EU customers need a VAT number?']);
    expect(
      card(page.root, title).querySelectorAll('ul.answers li')
    ).toHaveLength(1);
  });

  it('answers an open question from the panel, and copies the open questions for Confluence', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => (written.push(t), Promise.resolve()),
      },
    });
    try {
      const page = await open('/meetings');
      const title = 'Tax ID validation for EU customers';
      for (const q of ['/q Who checks the number?', '/q Which countries?']) {
        type(card(page.root, title).querySelector('form textarea.line'), q);
        submit(card(page.root, title).querySelector('form'));
        await flush(page);
      }
      buttonNamed(page.root, 'Copy for Confluence').click();
      await flush(page);
      expect(written[0]).toContain(
        'h2. Open questions\n* Who checks the number\\?\n* Which countries\\?\n'
      );
      const panel = page.root.querySelector<HTMLElement>('ah-actions-panel')!;
      const first = panel.querySelector<HTMLElement>(
        'ul[aria-label="Open questions"] li'
      )!;
      expect(text(first)).toContain(title);
      buttonNamed(first, 'Answer').click();
      await flush(page);
      type(panel.querySelector('form input'), 'Finance, with VIES');
      submit(panel.querySelector('form'));
      await flush(page);
      expect(
        [
          ...panel.querySelectorAll('ul[aria-label="Open questions"] li .text'),
        ].map((n) => text(n))
      ).toEqual(['Which countries?']);
      const topic = card(page.root, title);
      expect(
        [...topic.querySelectorAll('ul.answers li .text')].map((n) => text(n))
      ).toEqual(['Finance, with VIES']);
      buttonNamed(page.root, 'Copy for Confluence').click();
      await flush(page);
      expect(written[1]).toContain(
        '* *Question (answered):* Who checks the number\\? _('
      );
      expect(written[1]).toContain('** Finance, with VIES _(');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('puts the focus in the answer line when Answer is pressed, and back on Answer when the line is cancelled', async () => {
    const page = await open('/meetings');
    const title = 'Tax ID validation for EU customers';
    type(
      card(page.root, title).querySelector('form textarea.line'),
      '/q Who checks the number?'
    );
    submit(card(page.root, title).querySelector('form'));
    await flush(page);
    const panel = page.root.querySelector<HTMLElement>('ah-actions-panel')!;
    const question = () =>
      panel.querySelector<HTMLElement>('ul[aria-label="Open questions"] li')!;
    buttonNamed(question(), 'Answer').click();
    await flush(page);
    expect(document.activeElement).toBe(question().querySelector('form input'));
    buttonNamed(question(), 'Cancel').click();
    await flush(page);
    expect(question().querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(question(), 'Answer'));
  });

  it('shows the notes others take while the meeting runs, and stops reading once it ends', async () => {
    const page = await open('/meetings');
    const running = (
      call(page.server, 'GET', '/meetings?status=in_progress').body as {
        items: { id: string }[];
      }
    ).items[0]!;
    const meeting = call(page.server, 'GET', `/meetings/${running.id}`)
      .body as Meeting;
    const tax = meeting.topics.find(
      (t) => t.title === 'Tax ID validation for EU customers'
    )!;
    call(page.server, 'POST', `/meeting-topics/${tax.id}/notes`, {
      text: 'Written on another laptop',
    });
    expect(
      notesOf(card(page.root, 'Tax ID validation for EU customers'))
    ).toEqual([]);
    page.clock.advance(LIVE_POLL_MS);
    await flush(page);
    expect(
      notesOf(card(page.root, 'Tax ID validation for EU customers'))
    ).toEqual(['Written on another laptop']);

    call(page.server, 'POST', `/meetings/${running.id}/end`, { carryOver: [] });
    page.clock.advance(LIVE_POLL_MS);
    await flush(page);
    expect(text(page.root.querySelector('.identity .ah-tag'))).toBe('Ended');
    const reads = () =>
      page.requests.filter(
        (r) => r.method === 'GET' && r.path.endsWith(`/meetings/${running.id}`)
      ).length;
    const before = reads();
    page.clock.advance(3 * LIVE_POLL_MS);
    await flush(page);
    expect(reads()).toBe(before);
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

  it('edits the drafted story by hand before creating it, and Jira gets the story as edited', async () => {
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

    const editOf = (name: string) => {
      const button = dialog().querySelector<HTMLButtonElement>(
        `button[aria-label="Edit ${name}"]`
      );
      if (button === null) throw new Error(`no Edit for ${name}`);
      return button;
    };
    const puts = () =>
      page.requests.filter(
        (r) => r.method === 'PUT' && r.path.endsWith('/story')
      );

    // Only the section being edited turns into its field; Esc puts it back unchanged, and the dialog stays open.
    editOf('title').click();
    await flush(page);
    const titleField = fieldNamed(dialog(), 'Title');
    expect(document.activeElement).toBe(titleField);
    expect(dialog().querySelectorAll('textarea, input')).toHaveLength(1);
    expect(buttonNamed(dialog(), 'Create in Jira').disabled).toBe(true);
    expect(dialog().querySelector('button[aria-label^="Edit "]')).toBeNull();
    type(titleField, 'Something else');
    titleField.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flush(page);
    expect(dialog().querySelectorAll('textarea, input')).toHaveLength(0);
    expect(document.activeElement).toBe(editOf('title'));
    expect(puts()).toHaveLength(0);

    // A blank title or no criterion is refused before anything is sent.
    editOf('title').click();
    await flush(page);
    type(fieldNamed(dialog(), 'Title'), '   ');
    buttonNamed(dialog(), 'Save').click();
    await flush(page);
    expect(text(dialog())).toContain('This is required.');
    type(
      fieldNamed(dialog(), 'Title'),
      '  Charge late fees on overdue invoices '
    );
    buttonNamed(dialog(), 'Save').click();
    await flush(page);
    expect(puts()).toHaveLength(1);
    expect(text(dialog().querySelector('article h3'))).toBe(
      'Charge late fees on overdue invoices'
    );

    editOf('acceptance criteria').click();
    await flush(page);
    const criteria = fieldNamed(dialog(), 'Acceptance criteria');
    type(criteria, '\n  \n');
    buttonNamed(dialog(), 'Save').click();
    await flush(page);
    expect(text(dialog())).toContain('Write at least one, one per line.');
    type(
      criteria,
      'Only enterprise accounts get a fee.\n\nFinance approves each waiver.'
    );
    criteria.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      })
    );
    await flush(page);

    expect(puts()).toHaveLength(2);
    expect(puts()[1]?.body).toMatchObject({
      title: 'Charge late fees on overdue invoices',
      acceptanceCriteria: [
        'Only enterprise accounts get a fee.',
        'Finance approves each waiver.',
      ],
    });
    expect(
      [...dialog().querySelectorAll('article ol li')].map((li) => text(li))
    ).toEqual([
      'Only enterprise accounts get a fee.',
      'Finance approves each waiver.',
    ]);
    expect(text(dialog())).toContain('Edited by dev@ on');

    buttonNamed(dialog(), 'Create in Jira').click();
    await flush(page);
    const meetingId = page.server.meetingDesk.list('in_progress')[0]!.id;
    const created = page.server.meetingDesk.listDrafts(meetingId)[0]!;
    expect([created.status, created.story?.title]).toEqual([
      'created',
      'Charge late fees on overdue invoices',
    ]);
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
    jiraProjectKey: null,
    jiraIssueType: null,
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
    expect(
      meetingLine({
        ...base,
        startsAt: at,
        status: 'cancelled',
        endedAt: at,
        topicCount: 0,
      }).sub
    ).toBe(`${meetingDay(at)} · cancelled · no topics`);
  });
});
