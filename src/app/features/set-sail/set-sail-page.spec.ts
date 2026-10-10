import type {
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import {
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CurrentUser } from '@core/auth/current-user';
import { StoriesStore } from '@core/stores/stories-store';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { testServer } from '@testing/mock-backend/spec-helpers';
import { ToastService } from '@ui/toast/toast';
import type { Observable } from 'rxjs';
import { from, switchMap, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SetSailPage } from './set-sail-page';

/** Where a new voyage opens (lane 4A builds the real one). */
@Component({ template: '' })
class VoyageStub {}

/** The answer the API gives with a problem: `application/problem+json` as the HTTP client sees it. */
function problemAnswer(
  status: number,
  code: string,
  extra: Record<string, unknown> = {}
): Observable<never> {
  return throwError(
    () =>
      new HttpErrorResponse({
        status,
        error: {
          type: `https://ahoy.example/problems/${code}`,
          title: `Title of ${code}`,
          status,
          code,
          ...extra,
        },
      })
  );
}

/** What the page asked of the API, and a way to hold or replace the answer. */
interface Wire {
  readonly gets: HttpRequest<unknown>[];
  /** Every `POST` the page sent. */
  readonly posts: HttpRequest<unknown>[];
  /** While set, requests wait for it before they reach the mock. */
  hold: Promise<void> | null;
  /** While set, requests are answered by it instead of the mock. */
  answer:
    ((req: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>) | null;
}

/** The page on its route, over the mock backend, with the wire in sight. */
async function openPage(
  url = '/voyages/new',
  initialAnswer: Wire['answer'] = null
) {
  const wire: Wire = { gets: [], posts: [], hold: null, answer: initialAnswer };
  const spy: HttpInterceptorFn = (req, next) => {
    if (req.method === 'POST') wire.posts.push(req);
    if (req.method === 'GET') wire.gets.push(req);
    if (wire.answer !== null) return wire.answer(req);
    const gate = wire.hold;
    return gate === null
      ? next(req)
      : from(gate).pipe(switchMap(() => next(req)));
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'voyages/new', component: SetSailPage },
          { path: 'voyages/:key', component: VoyageStub },
        ],
        withComponentInputBinding()
      ),
      provideHttpClient(withInterceptors([spy, mockBackendInterceptor])),
      provideMockBackend(testServer().server),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, SetSailPage);
  await harness.fixture.whenStable();
  harness.detectChanges();
  const root = harness.fixture.nativeElement as HTMLElement;

  /** Lets the page, the request and the next render finish. */
  const settle = async (): Promise<void> => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  /** Lets the microtasks of a click run, without waiting for a held request. */
  const tick = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 0));
  const labelled = (text: string): HTMLInputElement => {
    const label = Array.from(root.querySelectorAll('label')).find((l) =>
      l.textContent?.trim().startsWith(text)
    );
    const control = label?.htmlFor
      ? root.querySelector<HTMLInputElement>(`#${label.htmlFor}`)
      : null;
    if (control === null || control === undefined)
      throw new Error(`no field labelled ${text}`);
    return control;
  };
  const named = <T extends HTMLElement>(ariaLabel: string): T => {
    const control = root.querySelector<T>(`[aria-label="${ariaLabel}"]`);
    if (control === null) throw new Error(`no control named ${ariaLabel}`);
    return control;
  };
  const type = (
    control: HTMLInputElement | HTMLSelectElement,
    value: string
  ): void => {
    control.value = value;
    control.dispatchEvent(
      new Event(control instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      })
    );
    harness.detectChanges();
  };
  const submit = (): HTMLButtonElement => {
    const button = root.querySelector<HTMLButtonElement>('button[type=submit]');
    if (button === null) throw new Error('no submit button');
    return button;
  };
  /** The text of every error on show: under fields (`ah-field__error`). */
  const errors = (): string[] =>
    Array.from(root.querySelectorAll('.ah-field__error')).map(
      (e) => e.textContent?.trim() ?? ''
    );
  /** The text of the page's "Before you sail" summary and of its button. */
  const summary = (): string =>
    root.querySelector('aside')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** The value shown for a label of the summary list ("Owner" gives the owner). */
  const fact = (label: string): string | undefined =>
    Array.from(root.querySelectorAll('dt'))
      .find((dt) => dt.textContent?.trim() === label)
      ?.nextElementSibling?.textContent?.trim();
  const link = (text: string): HTMLAnchorElement | undefined =>
    Array.from(root.querySelectorAll('a')).find(
      (a) => a.textContent?.replace(/\s+/g, ' ').trim() === text
    );
  return {
    wire,
    harness,
    root,
    settle,
    tick,
    errors,
    summary,
    fact,
    link,
    labelled,
    named,
    type,
    submit,
  };
}

describe('the Set sail page', () => {
  describe('the model catalogue', () => {
    it('loads the server catalogue and shows labelled model choices and each phase default', async () => {
      const page = await openPage();
      expect(page.wire.gets.map((request) => request.url)).toEqual([
        '/api/v1/models',
      ]);
      const select = page.named<HTMLSelectElement>('Planning model');
      expect(Array.from(select.options).map((option) => option.value)).toEqual([
        '',
        'claude-haiku-4.5',
        'claude-sonnet-5',
        'gpt-5.6-terra',
        '__custom__',
      ]);
      expect(select.options[0]?.textContent).toContain(
        'Default · claude-sonnet-5'
      );
      expect(select.options[2]?.textContent).toContain('Claude Sonnet 5');
      expect(
        page.named<HTMLSelectElement>('Implementation model').options[0]
          ?.textContent
      ).toContain('Default · gpt-5.6-terra');
      expect(select.value).toBe('');
      expect(page.root.querySelector('[role="status"]')).toBeNull();
    });

    it('sends a custom model id, never the custom-option sentinel', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.type(page.named<HTMLSelectElement>('Planning model'), '__custom__');
      page.type(
        page.named<HTMLInputElement>('Planning model id'),
        'my-provider/new-model'
      );
      page.submit().click();
      await page.settle();
      expect(page.wire.posts[0]?.body).toEqual({
        key: 'PROJ-145',
        budgetNanoAiu: 25_000_000_000,
        models: { planning: { model: 'my-provider/new-model' } },
      });
    });

    it('clears an incompatible effort when switching to a model that takes none', async () => {
      const page = await openPage();
      page.type(
        page.named<HTMLSelectElement>('Planning model'),
        'claude-sonnet-5'
      );
      page.type(page.named<HTMLSelectElement>('Planning effort'), 'high');
      page.type(
        page.named<HTMLSelectElement>('Planning model'),
        'claude-haiku-4.5'
      );
      const effort = page.named<HTMLSelectElement>('Planning effort');
      expect(effort.value).toBe('');
      expect(Array.from(effort.options).map((option) => option.value)).toEqual([
        '',
      ]);
      page.type(
        page.named<HTMLSelectElement>('Planning model'),
        'gpt-5.6-terra'
      );
      expect(effort.options).toHaveLength(6);
    });

    it('offers all efforts for a custom model even when the phase default takes none', async () => {
      const page = await openPage();
      expect(
        page.named<HTMLSelectElement>('Intake effort').options
      ).toHaveLength(1);
      page.type(page.named<HTMLSelectElement>('Intake model'), '__custom__');
      expect(
        page.named<HTMLSelectElement>('Intake effort').options
      ).toHaveLength(6);
    });

    it('reports an invalid catalogue response instead of treating it as available choices', async () => {
      const page = await openPage('/voyages/new', () =>
        from(
          Promise.resolve(
            new HttpResponse({ status: 200, body: { models: ['unvalidated'] } })
          )
        )
      );
      expect(page.root.textContent).toContain(
        'Could not load the model catalogue'
      );
      expect(
        page.named<HTMLSelectElement>('Planning model').options
      ).toHaveLength(2);
    });

    it('reports a catalogue failure, permits a custom id and loads choices on retry without losing it', async () => {
      const page = await openPage('/voyages/new', () =>
        problemAnswer(503, 'unavailable')
      );
      expect(page.root.textContent).toContain(
        'Could not load the model catalogue'
      );
      page.type(page.named<HTMLSelectElement>('Planning model'), '__custom__');
      page.type(
        page.named<HTMLInputElement>('Planning model id'),
        'custom-model'
      );
      page.wire.answer = null;
      const retry = Array.from(page.root.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Try again'
      );
      retry!.click();
      await page.settle();
      expect(page.root.textContent).not.toContain(
        'Could not load the model catalogue'
      );
      expect(page.named<HTMLInputElement>('Planning model id').value).toBe(
        'custom-model'
      );
      expect(
        page.named<HTMLSelectElement>('Planning model').options
      ).toHaveLength(5);
    });
  });
  describe('arriving from The Docks', () => {
    it('fills the key and the title from the query string', async () => {
      const page = await openPage(
        '/voyages/new?key=proj-145&title=Export%20to%20CSV'
      );
      expect(page.labelled('Jira key').value).toBe('PROJ-145');
      expect(page.labelled('Title').value).toBe('Export to CSV');
    });

    it('ignores a query string that is not text', async () => {
      const page = await openPage(
        '/voyages/new?key=PROJ-1&key=PROJ-2&title=A&title=B'
      );
      expect(page.labelled('Jira key').value).toBe('');
      expect(page.labelled('Title').value).toBe('');
    });
  });

  it('writes the key in capitals as the user types it', async () => {
    const page = await openPage();
    page.type(page.labelled('Jira key'), 'proj-14');
    expect(page.labelled('Jira key').value).toBe('PROJ-14');
  });

  describe('setting sail', () => {
    it('sends exactly the key, the budget in nano-AIU and only the models the user filled in', async () => {
      const page = await openPage();
      page.type(page.labelled('Jira key'), 'PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.type(
        page.named<HTMLSelectElement>('Planning model'),
        'claude-sonnet-5'
      );
      page.type(page.named<HTMLSelectElement>('Planning effort'), 'high');

      page.submit().click();
      await page.settle();

      expect(page.wire.posts).toHaveLength(1);
      expect(page.wire.posts[0]?.body).toStrictEqual({
        key: 'PROJ-145',
        budgetNanoAiu: 25_000_000_000,
        models: {
          planning: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
        },
      });
    });

    it('sends one request for a double click, and holds the button until the answer', async () => {
      const page = await openPage();
      page.type(page.labelled('Jira key'), 'PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      let release = (): void => undefined;
      page.wire.hold = new Promise<void>((resolve) => (release = resolve));
      const button = page.submit();

      button.click();
      button.click();
      await page.tick();
      page.harness.detectChanges();

      expect(page.wire.posts).toHaveLength(1);
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Starting voyage');

      release();
      await page.settle();
      expect(page.wire.posts).toHaveLength(1);
    });

    it('says the voyage set sail, keeps it in the list and opens it', async () => {
      const page = await openPage();
      page.type(page.labelled('Jira key'), 'PROJ-145');
      page.type(page.labelled('Total budget'), '25');

      page.submit().click();
      await page.settle();

      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.text)
      ).toEqual(['Voyage PROJ-145 set sail.']);
      expect(TestBed.inject(StoriesStore).find('PROJ-145')?.budgetNanoAiu).toBe(
        25_000_000_000
      );
      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-145');
    });
  });
  describe('what is checked before anything is sent', () => {
    it('shows what is missing and sends nothing, with the focus on the first problem', async () => {
      const page = await openPage();

      page.submit().click();
      await page.settle();

      expect(page.errors()).toEqual([
        'Enter the Jira key of the story.',
        'Enter the most this voyage may spend, in AIU.',
      ]);
      expect(page.wire.posts).toHaveLength(0);
      expect(page.labelled('Jira key').getAttribute('aria-invalid')).toBe(
        'true'
      );
      expect(document.activeElement).toBe(page.labelled('Jira key'));
    });

    it.each(['0', '1e3', '-5', '1.1234567890'])(
      'does not send a budget of %s',
      async (budget) => {
        const page = await openPage('/voyages/new?key=PROJ-145');
        page.type(page.labelled('Total budget'), budget);

        page.submit().click();
        await page.settle();

        expect(page.errors()).toHaveLength(1);
        expect(page.labelled('Total budget').getAttribute('aria-invalid')).toBe(
          'true'
        );
        expect(page.wire.posts).toHaveLength(0);
      }
    );

    it('sends 25.5 AIU as 25 500 000 000 nano-AIU', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25.5');

      page.submit().click();
      await page.settle();

      expect(page.wire.posts[0]?.body).toEqual({
        key: 'PROJ-145',
        budgetNanoAiu: 25_500_000_000,
      });
    });

    it('shows an invalid key and an over-long title beside their fields', async () => {
      const page = await openPage(
        '/voyages/new?key=nope&title=' + 'x'.repeat(501)
      );
      page.type(page.labelled('Total budget'), '25');

      page.submit().click();
      await page.settle();

      expect(page.errors()).toHaveLength(2);
      expect(page.wire.posts).toHaveLength(0);
    });

    it('allows one review model and sends it in the review slot', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.type(page.named<HTMLSelectElement>('Review model'), 'gpt-5.6-terra');
      page.submit().click();
      await page.settle();
      expect(page.wire.posts[0]?.body).toEqual({
        key: 'PROJ-145',
        budgetNanoAiu: 25_000_000_000,
        models: { review: { model: 'gpt-5.6-terra' } },
      });
    });

    it('leaves the review model to the API when the row is blank', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');

      page.submit().click();
      await page.settle();

      expect(page.wire.posts[0]?.body).toEqual({
        key: 'PROJ-145',
        budgetNanoAiu: 25_000_000_000,
      });
    });

    it('shows a model id the API would refuse under its row, and sends nothing', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.type(page.named<HTMLSelectElement>('Planning model'), '__custom__');
      page.type(
        page.named<HTMLInputElement>('Planning model id'),
        'not a model'
      );

      expect(page.errors()).toEqual([
        'A model id has letters, digits and . _ : / - only, and starts with a letter or digit.',
      ]);
      page.submit().click();
      await page.settle();
      expect(page.wire.posts).toHaveLength(0);
    });
  });
  describe('when the API refuses', () => {
    it('shows an existing voyage as an error on the key, with a link to open it, and keeps what was typed', async () => {
      const page = await openPage('/voyages/new?key=PROJ-123&title=Mine');
      page.type(page.labelled('Total budget'), '25');

      page.submit().click();
      await page.settle();

      expect(page.errors()).toEqual(['PROJ-123 already has a voyage.']);
      expect(page.link('Open PROJ-123')?.getAttribute('href')).toBe(
        '/voyages/PROJ-123'
      );
      expect(page.labelled('Jira key').getAttribute('aria-invalid')).toBe(
        'true'
      );
      expect(page.labelled('Jira key').value).toBe('PROJ-123');
      expect(page.labelled('Title').value).toBe('Mine');
      expect(page.labelled('Total budget').value).toBe('25');
      expect(TestBed.inject(Router).url).toBe(
        '/voyages/new?key=PROJ-123&title=Mine'
      );
      expect(page.submit().disabled).toBe(false);
      expect(TestBed.inject(ToastService).toasts()).toEqual([]);

      page.type(page.labelled('Jira key'), 'PROJ-1234');
      expect(page.errors()).toEqual([]);
      expect(page.root.textContent).not.toContain('Open PROJ-123');
    });

    it('shows each error of a 400 beside its field and under its model row', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.type(
        page.named<HTMLSelectElement>('Review model'),
        'claude-sonnet-5'
      );
      page.wire.answer = () =>
        problemAnswer(400, 'validation_failed', {
          errors: [
            { path: 'body/budgetNanoAiu', message: 'must be at least 1' },
            {
              path: '/models/review/model',
              message: 'the worker does not know this model',
            },
          ],
        });

      page.submit().click();
      await page.settle();

      expect(page.errors()).toEqual([
        'must be at least 1',
        'the worker does not know this model',
      ]);
      expect(page.labelled('Total budget').getAttribute('aria-invalid')).toBe(
        'true'
      );
      expect(page.named('Review model').getAttribute('aria-invalid')).toBe(
        'true'
      );
      expect(page.root.querySelector('.ah-banner')).toBeNull();
      expect(document.activeElement).toBe(page.labelled('Total budget'));

      page.type(page.labelled('Total budget'), '26');
      expect(page.errors()).toEqual(['the worker does not know this model']);
    });

    it('says it lost contact with the harbour, keeps everything typed, and sends again on a retry', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.type(
        page.named<HTMLSelectElement>('Planning model'),
        'claude-sonnet-5'
      );
      page.wire.answer = () =>
        problemAnswer(503, 'unavailable', { instance: 'req-9' });

      page.submit().click();
      await page.settle();

      const banner = page.root.querySelector('.ah-banner');
      expect(banner?.textContent).toContain("Can't reach Ahoy");
      expect(banner?.textContent).toContain('503 · unavailable · req-9');
      expect(page.labelled('Total budget').value).toBe('25');
      expect(page.named<HTMLSelectElement>('Planning model').value).toBe(
        'claude-sonnet-5'
      );
      expect(page.submit().disabled).toBe(false);

      page.wire.answer = null;
      let release = (): void => undefined;
      page.wire.hold = new Promise<void>((resolve) => (release = resolve));
      page.submit().click();
      await page.tick();
      page.harness.detectChanges();
      expect(page.root.querySelector('.ah-banner')).toBeNull(); // the old refusal goes while the new request is out

      release();
      await page.settle();
      expect(page.wire.posts).toHaveLength(2);
      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-145');
    });

    it("shows the API's own words for any other refusal", async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.wire.answer = () =>
        problemAnswer(422, 'unsupported_gate', {
          detail: 'Ahoy cannot start that story.',
        });

      page.submit().click();
      await page.settle();

      const banner = page.root.querySelector('.ah-banner');
      expect(banner?.textContent).toContain('Title of unsupported_gate');
      expect(banner?.textContent).toContain('Ahoy cannot start that story.');
      expect(banner?.textContent).toContain('422 · unsupported_gate');
      expect(page.labelled('Total budget').value).toBe('25');
    });
  });
  describe('Before you sail', () => {
    it('sums up the voyage, its owner and its budget cap as the form is filled in', async () => {
      const page = await openPage();
      const you = TestBed.inject(CurrentUser).id();
      expect(page.fact('Voyage')).toBe('—');
      expect(page.fact('Owner')).toBe(`${you} (you)`);
      expect(page.fact('Budget cap')).toBe('—');
      expect(page.fact('First crew')).toBe('Navigator reads the Jira issue');

      page.type(page.labelled('Jira key'), 'proj-145');
      page.type(page.labelled('Total budget'), '25.5');

      expect(page.fact('Voyage')).toBe('PROJ-145');
      expect(page.fact('Budget cap')).toBe('25.5 AIU');
      expect(page.summary()).toContain(
        'Runs bill your Copilot account, up to 25.5 AIU. Nothing beyond the cap is spent.'
      );
      expect(page.summary()).toContain(
        'The crew stops for questions and at every human gate. Nothing is approved automatically.'
      );
      expect(page.summary()).toContain(
        'Anyone on the crew can stop the voyage at any time.'
      );
    });

    it('puts the cap in the button once the budget is an amount', async () => {
      const page = await openPage();
      expect(page.submit().textContent?.trim()).toBe('Start voyage');

      page.type(page.labelled('Total budget'), '1e3');
      expect(page.submit().textContent?.trim()).toBe('Start voyage');

      page.type(page.labelled('Total budget'), '25');
      expect(page.submit().textContent?.trim()).toBe(
        'Start voyage · up to 25 AIU'
      );
    });

    it('describes the seven phases of a voyage', async () => {
      const page = await openPage();
      expect(page.root.textContent).toContain(
        'intake → planning → plan_review → implementation → pr_review → delivery_gate → done'
      );
    });
  });

  describe('where the user came from', () => {
    it('says it was filled in from The Docks, and goes back to them on Cancel', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      expect(page.root.textContent).toContain('Filled in from Backlog');
      expect(page.link('← Back to Backlog')?.getAttribute('href')).toBe(
        '/docks'
      );
      expect(page.link('Cancel')?.getAttribute('href')).toBe('/docks');
    });

    it('has no Docks pill when the page is opened without a key, and Cancel goes to the voyages', async () => {
      const page = await openPage();
      expect(page.root.textContent).not.toContain('Filled in from Backlog');
      expect(page.link('← Back to Backlog')).toBeUndefined();
      expect(page.link('Cancel')?.getAttribute('href')).toBe('/voyages');
    });
  });

  describe('the models', () => {
    it('says what to type and who checks the model and effort', async () => {
      const page = await openPage();
      const text = page.root.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(text).toContain(
        "Choose a model from the server's catalogue, or select Other model id. This list does not guarantee access from your Copilot account; the worker checks the model and effort before the first prompt (0 AIU) and anchors the voyage if they're refused."
      );
      expect(text).toContain(
        "A model chosen without an effort runs at that model's own default."
      );
    });

    it('tags only the rows the user filled in as their choice, and Reset puts a row back to the default', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      expect(page.root.querySelectorAll('.ah-source')).toHaveLength(0);
      expect(
        page.root.querySelector('[aria-label="Reset planning to default"]')
      ).toBeNull();

      page.type(
        page.named<HTMLSelectElement>('Planning model'),
        'claude-sonnet-5'
      );
      page.type(page.named<HTMLSelectElement>('Implementation effort'), 'low');
      expect(
        Array.from(page.root.querySelectorAll('.ah-source')).map((t) =>
          t.textContent?.trim()
        )
      ).toEqual(['Your choice', 'Your choice']);

      page.named<HTMLButtonElement>('Reset planning to default').click();
      page.harness.detectChanges();
      expect(page.named<HTMLSelectElement>('Planning model').value).toBe('');
      expect(page.root.querySelectorAll('.ah-source')).toHaveLength(1);

      page.submit().click();
      await page.settle();
      expect(page.wire.posts[0]?.body).toEqual({
        key: 'PROJ-145',
        budgetNanoAiu: 25_000_000_000,
        models: { implementation: { reasoningEffort: 'low' } },
      });
    });
  });
  describe('a refusal the user can still see and act on', () => {
    it('puts the banner in the summary beside the button, with Try again only when the harbour was unreachable', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.wire.answer = () => problemAnswer(503, 'unavailable');

      page.submit().click();
      await page.settle();

      const banner = page.root.querySelector('aside .ah-banner');
      expect(banner?.textContent).toContain("Can't reach Ahoy");
      const retry = Array.from(banner?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.trim() === 'Try again'
      );
      expect(retry).toBeDefined();

      page.wire.answer = null;
      retry?.click();
      await page.settle();
      expect(page.wire.posts).toHaveLength(2);
      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-145');
    });

    it('scrolls the banner into view when it appears, so a refusal is not left below the fold', async () => {
      const scrolled: Element[] = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element): void {
        scrolled.push(this);
      };
      try {
        const page = await openPage('/voyages/new?key=PROJ-145');
        page.type(page.labelled('Total budget'), '25');
        page.wire.answer = () => problemAnswer(503, 'unavailable');

        page.submit().click();
        await page.settle();

        expect(scrolled).toHaveLength(1);
        expect(scrolled[0]?.classList.contains('ah-banner')).toBe(true);
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it('offers no Try again for a refusal a retry would not change', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.wire.answer = () =>
        problemAnswer(422, 'unsupported_gate', { detail: 'No.' });

      page.submit().click();
      await page.settle();

      expect(
        page.root.querySelector('aside .ah-banner')?.textContent
      ).toContain('No.');
      expect(
        Array.from(page.root.querySelectorAll('aside .ah-banner button'))
      ).toHaveLength(0);
    });

    it('drops the old banner on the next attempt even when the form is still invalid', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.wire.answer = () => problemAnswer(503, 'unavailable');
      page.submit().click();
      await page.settle();
      expect(page.root.querySelector('.ah-banner')).not.toBeNull();

      page.type(page.labelled('Total budget'), '0');
      page.submit().click();
      await page.settle();

      expect(page.root.querySelector('.ah-banner')).toBeNull();
      expect(page.errors()).toEqual(['The budget must be more than 0 AIU.']);
    });

    it('shows a 400 for the review model under its row, and clears it when edited', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      page.wire.answer = () =>
        problemAnswer(400, 'validation_failed', {
          errors: [
            {
              path: '/models/review/model',
              message: 'model is unavailable',
            },
          ],
        });

      page.submit().click();
      await page.settle();
      expect(page.errors()).toEqual(['model is unavailable']);

      page.type(page.named<HTMLSelectElement>('Review model'), 'gpt-5.6-terra');
      expect(page.errors()).toEqual([]);
    });

    it('keeps the fields still while the request is out, and gives them back after a refusal', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      page.wire.answer = () =>
        from(gate).pipe(switchMap(() => problemAnswer(503, 'unavailable')));

      page.submit().click();
      await page.tick();
      page.harness.detectChanges();
      const fields = page.root.querySelector('fieldset');
      expect(fields?.disabled).toBe(true);
      expect(page.labelled('Jira key').matches(':disabled')).toBe(true);

      release();
      await page.settle();
      expect(page.root.querySelector('fieldset')?.disabled).toBe(false);
      expect(page.labelled('Jira key').matches(':disabled')).toBe(false);
    });
  });

  describe('when the page is reused or left', () => {
    it('takes a new key and a new title from the query string, and clears a title it no longer has', async () => {
      const page = await openPage('/voyages/new?key=PROJ-1&title=First');
      expect(page.labelled('Title').value).toBe('First');

      await page.harness.navigateByUrl('/voyages/new?key=proj-2', SetSailPage);
      page.harness.detectChanges();

      expect(page.labelled('Jira key').value).toBe('PROJ-2');
      expect(page.labelled('Title').value).toBe('');
    });

    it('does not count a blank key as coming from The Docks', async () => {
      const page = await openPage('/voyages/new?key=%20');
      expect(page.root.textContent).not.toContain('Filled in from Backlog');
      expect(page.link('← Back to Backlog')).toBeUndefined();
    });

    it('lets a voyage set sail after the user left, without pulling them back to it', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      let release = (): void => undefined;
      page.wire.hold = new Promise<void>((resolve) => (release = resolve));
      page.submit().click();
      await page.tick();

      await page.harness.navigateByUrl('/voyages/PROJ-999');
      release();
      await page.settle();
      await page.tick();

      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-999');
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.text)
      ).toEqual(['Voyage PROJ-145 set sail.']);
      expect(TestBed.inject(StoriesStore).find('PROJ-145')).toBeDefined();
    });

    it('says nothing, and breaks nothing, when a refusal arrives after the user left', async () => {
      const page = await openPage('/voyages/new?key=PROJ-145');
      page.type(page.labelled('Total budget'), '25');
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      page.wire.answer = () =>
        from(gate).pipe(switchMap(() => problemAnswer(503, 'unavailable')));
      page.submit().click();
      await page.tick();

      await page.harness.navigateByUrl('/voyages/PROJ-999');
      release();
      await page.tick();
      await page.tick();

      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-999');
      expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    });
  });
});
