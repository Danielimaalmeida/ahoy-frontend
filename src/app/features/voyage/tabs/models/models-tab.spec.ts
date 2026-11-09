import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
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
import { settle, testServer } from '@testing/mock-backend/spec-helpers';
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
  before?: (request: MockRequest, server: MockAhoyServer) => void
): Promise<Page> {
  const { server, clock } = testServer();
  const requests: MockRequest[] = [];
  const handle = server.handle.bind(server);
  server.handle = (request) => {
    requests.push(request);
    before?.(request, server);
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

/** The text of an element as a reader sees it: whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function row(page: Page, slot: string): HTMLElement {
  const found = page.root.querySelector<HTMLElement>(`tr[data-slot="${slot}"]`);
  if (found === null) throw new Error(`no row ${slot}`);
  return found;
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

function type(field: Element | null, value: string): void {
  if (!(
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
  ))
    throw new Error('no field');
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

function choose(field: Element | null, value: string): void {
  if (!(field instanceof HTMLSelectElement)) throw new Error('no select');
  field.value = value;
  field.dispatchEvent(new Event('change'));
}

function modelInput(label: string): HTMLInputElement {
  const found = dialog().querySelector<HTMLInputElement>(
    `input[aria-label="${label} model"]`
  );
  if (found === null) throw new Error(`no ${label} model input`);
  return found;
}

function effortSelect(label: string): HTMLSelectElement {
  const found = dialog().querySelector<HTMLSelectElement>(
    `select[aria-label="${label} effort"]`
  );
  if (found === null) throw new Error(`no ${label} effort select`);
  return found;
}

/** The commands (POSTs) the mock received. */
function commands(page: Page): MockRequest[] {
  return page.requests.filter((request) => request.method === 'POST');
}

afterEach(() => {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
});

describe('ModelsTab on the mock backend', () => {
  it('shows Models per phase for PROJ-118: three rows with their crew and the sources of each value', async () => {
    const page = await open('/voyages/PROJ-118/models');
    const rows = [...page.root.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.getAttribute('data-slot'))).toEqual([
      'planning',
      'implementation',
      'review',
    ]);
    expect(text(row(page, 'planning').children[1])).toBe('Cartographer');
    expect(text(row(page, 'planning').children[2])).toMatch(/^\S+ · \S+$/);
    expect(
      text(page.root.querySelector('ah-models-tab ah-panel-head'))
    ).toContain('Models per phase');
    expect(
      text(page.root.querySelector('ah-models-tab ah-panel-foot'))
    ).not.toContain('must use different models');
    // Nothing is chosen on this voyage: no Change or Reset on the rows.
    expect(page.root.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('titles the page Models · Ahoy', async () => {
    await open('/voyages/PROJ-118/models');
    expect(TestBed.inject(Title).getTitle()).toBe('Models · Ahoy');
  });

  it('marks the slot whose last run failed on the model it still has: refused last run', async () => {
    const page = await open('/voyages/PROJ-118/models');
    const refused = [...page.root.querySelectorAll('tbody tr')]
      .filter((r) => text(r).includes('refused last run'))
      .map((r) => r.getAttribute('data-slot'));
    expect(refused).toEqual(['implementation']);
  });

  it('marks nothing on a voyage that is not anchored by a failed run', async () => {
    const page = await open('/voyages/PROJ-123/models');
    expect(text(page.root.querySelector('tbody'))).not.toContain(
      'refused last run'
    );
  });

  describe('Change models', () => {
    it('opens the same wide editor from the Models tab action', async () => {
      const page = await open('/voyages/PROJ-118/models');
      const tab = page.root.querySelector('ah-models-tab')!;
      buttonNamed(tab, 'Change models').click();
      await flush(page);
      expect(hasDialog()).toBe(true);
      expect(
        dialog().closest<HTMLElement>('.cdk-overlay-pane')!.style.width
      ).toBe('960px');
      expect(dialog().querySelectorAll('ah-model-choice-row')).toHaveLength(3);
    });

    it('sends only the slot that changed, with its model and effort, and shows it as chosen', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change models').click();
      await flush(page);
      expect(hasDialog()).toBe(true);

      type(modelInput('Planning'), 'claude-sonnet-5');
      choose(effortSelect('Planning'), 'high');
      type(
        dialog().querySelector('textarea'),
        "gpt-5.6-terra isn't enabled for this account"
      );
      await flush(page);
      buttonNamed(dialog(), 'Save models').click();
      await flush(page);

      const [sent] = commands(page);
      expect(commands(page)).toHaveLength(1);
      expect(sent?.path).toBe('/stories/PROJ-118/models');
      expect(sent?.body).toMatchObject({
        models: {
          planning: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
        },
        reason: "gpt-5.6-terra isn't enabled for this account",
      });
      expect(Object.keys((sent?.body as { models: object }).models)).toEqual([
        'planning',
      ]);
      expect(
        typeof (sent?.body as { expectedVersion: unknown }).expectedVersion
      ).toBe('number');
      expect(hasDialog()).toBe(false);
      expect(text(row(page, 'planning').children[5])).toBe(
        'claude-sonnet-5 · high'
      );
      expect(text(row(page, 'planning').children[2])).toContain(
        'claude-sonnet-5 · high'
      );
      expect(text(row(page, 'planning').children[3])).toBe(
        'Chosen for this voyage'
      );
    });

    it('sends only {model} for a model chosen without an effort, and no reason when there is none', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change models').click();
      await flush(page);
      type(modelInput('Implementation'), 'claude-sonnet-5');
      await flush(page);
      buttonNamed(dialog(), 'Save models').click();
      await flush(page);
      expect(
        (commands(page)[0]?.body as Record<string, unknown>)['models']
      ).toEqual({
        implementation: { model: 'claude-sonnet-5' },
      });
      expect(commands(page)[0]?.body).not.toHaveProperty('reason');
    });

    it('cannot be saved with nothing changed: no request', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change models').click();
      await flush(page);
      expect(buttonNamed(dialog(), 'Save models').disabled).toBe(true);
      buttonNamed(dialog(), 'Save models').click();
      await flush(page);
      expect(commands(page)).toHaveLength(0);
      expect(hasDialog()).toBe(true);
    });

    it('keeps what was typed when the voyage changed meanwhile, and sends again with the new version', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change models').click();
      await flush(page);
      type(modelInput('Planning'), 'claude-sonnet-5');
      choose(effortSelect('Planning'), 'high');
      type(dialog().querySelector('textarea'), 'Not enabled for us');
      await flush(page);
      page.server.switches.conflictNext = 'stale_version';
      buttonNamed(dialog(), 'Save models').click();
      await flush(page);

      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(modelInput('Planning').value).toBe('claude-sonnet-5');
      expect(effortSelect('Planning').value).toBe('high');
      expect(dialog().querySelector('textarea')?.value).toBe(
        'Not enabled for us'
      );

      buttonNamed(dialog(), 'Save models').click();
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
    });

    it('does not send twice on a double click', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change models').click();
      await flush(page);
      type(modelInput('Planning'), 'claude-sonnet-5');
      await flush(page);
      const save = buttonNamed(dialog(), 'Save models');
      save.click();
      save.click();
      await flush(page);
      expect(commands(page)).toHaveLength(1);
    });
  });

  describe('Planning', () => {
    /** The radio of the choice whose title starts with `title`, in the open dialog. */
    function planningChoice(title: string): HTMLInputElement {
      const label = [...dialog().querySelectorAll('label')].find((l) =>
        text(l).startsWith(title)
      );
      const input = label?.querySelector('input');
      if (!input) throw new Error(`no choice ${title}`);
      return input;
    }

    /** The pairs of the section's list: "Planners" gives the planners. */
    function planningFact(page: Page, name: string): string | undefined {
      const section = page.root.querySelector(
        'ah-models-tab .models__planning'
      );
      const term = [...(section?.querySelectorAll('dt') ?? [])].find(
        (dt) => text(dt) === name
      );
      return term === undefined ? undefined : text(term.nextElementSibling);
    }

    /** Opens PROJ-118 as a panel story: the mock's state is changed before the page reads it. */
    function asPanel(_request: MockRequest, server: MockAhoyServer): void {
      const voyage = server.state.voyages.get('PROJ-118');
      if (voyage) voyage.story.planningMode = 'panel';
    }

    it('says one planner writes the plan for a standard voyage, and which models a panel would use', async () => {
      const page = await open('/voyages/PROJ-118/models');
      const section = page.root.querySelector(
        'ah-models-tab .models__planning'
      );
      expect(text(section?.querySelector('ah-panel-head'))).toContain(
        'Planning'
      );
      expect(text(section?.querySelector('.models__mode'))).toBe(
        'Standard One planner writes the plan.'
      );
      expect(planningFact(page, 'Planners')).toBe(
        'Claude Haiku 4.5, GPT-5.6 Terra, gemini-3.8-flash'
      );
      expect(planningFact(page, 'Judge')).toBe(
        'claude-opus-5.5, or Claude Sonnet 5 if your Copilot account may not use it'
      );
      expect(planningFact(page, 'Models')).toBe(
        'Team setting · Team settings › Phases'
      );
      expect(section?.textContent).toContain(
        'a planning run that has already started keeps the models it started on'
      );
      expect(section?.textContent).not.toContain(
        'does not use the planning model'
      );
    });

    it('says the planners and the judge write the plan for a panel voyage, and that its planning model is not used', async () => {
      const page = await open('/voyages/PROJ-118/models', asPanel);
      const section = page.root.querySelector(
        'ah-models-tab .models__planning'
      );
      expect(text(section?.querySelector('.models__mode'))).toBe(
        'Panel Three planners each write a plan, then a judge writes the final plan from the best of each and rates every draft.'
      );
      expect(text(section)).toContain('does not use the planning model above');
      expect(text(section)).toContain('costs more AIU');
    });

    it('still says the mode when the catalogue cannot be read, without the models of the panel', async () => {
      const page = await open('/voyages/PROJ-118/models', (request, server) => {
        if (request.method === 'GET' && request.path === '/models')
          server.switches.failNext = 503;
      });
      expect(text(page.root.querySelector('.models__mode'))).toContain(
        'Standard'
      );
      expect(planningFact(page, 'Planners')).toBeUndefined();
    });

    it('opens the dialog on the voyage’s own choice, and cannot save until it changes: no request', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      expect(hasDialog()).toBe(true);
      expect(
        text(dialog().querySelector('h2, h3, [role="heading"]'))
      ).toContain('Planning');
      expect(planningChoice('Standard').checked).toBe(true);
      expect(planningChoice('Panel').checked).toBe(false);
      expect(dialog().textContent).toContain('three planners and a judge');
      expect(dialog().textContent).toContain(
        'applies from the next planning run'
      );
      expect(buttonNamed(dialog(), 'Save planning').disabled).toBe(true);
      buttonNamed(dialog(), 'Save planning').click();
      await flush(page);
      expect(commands(page)).toHaveLength(0);
      expect(hasDialog()).toBe(true);
    });

    it('sends the new mode with the version the user saw and no reason when there is none, and shows it at once', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      planningChoice('Panel').click();
      await flush(page);
      buttonNamed(dialog(), 'Save planning').click();
      await flush(page);

      const [sent] = commands(page);
      expect(commands(page)).toHaveLength(1);
      expect(sent?.path).toBe('/stories/PROJ-118/planning-mode');
      expect(sent?.body).toMatchObject({ planningMode: 'panel' });
      expect(Object.keys(sent?.body as object).sort()).toEqual([
        'expectedVersion',
        'planningMode',
      ]);
      expect(hasDialog()).toBe(false);
      expect(text(page.root.querySelector('.models__mode'))).toContain('Panel');
      expect(
        TestBed.inject(ToastService)
          .toasts()
          .map((t) => t.text)
      ).toContain(
        'Planning is now by a panel. Applies from the next planning run.'
      );
    });

    it('sends the trimmed reason when there is one, and can go back to one planner', async () => {
      const page = await open('/voyages/PROJ-118/models', asPanel);
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      expect(planningChoice('Panel').checked).toBe(true);
      planningChoice('Standard').click();
      type(dialog().querySelector('textarea'), '  The panel cost too much  ');
      await flush(page);
      buttonNamed(dialog(), 'Save planning').click();
      await flush(page);

      expect(commands(page)[0]?.body).toMatchObject({
        planningMode: 'standard',
        reason: 'The panel cost too much',
      });
      expect(text(page.root.querySelector('.models__mode'))).toContain(
        'Standard'
      );
    });

    it('refuses a reason longer than the API takes without sending anything', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      planningChoice('Panel').click();
      type(dialog().querySelector('textarea'), 'x'.repeat(2001));
      await flush(page);
      expect(buttonNamed(dialog(), 'Save planning').disabled).toBe(true);
      expect(commands(page)).toHaveLength(0);
    });

    it('keeps the choice and the reason when the voyage changed meanwhile, and sends again with the new version', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      planningChoice('Panel').click();
      type(dialog().querySelector('textarea'), 'A hard story');
      await flush(page);
      page.server.switches.conflictNext = 'stale_version';
      buttonNamed(dialog(), 'Save planning').click();
      await flush(page);

      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'This voyage changed since you opened it'
      );
      expect(planningChoice('Panel').checked).toBe(true);
      expect(dialog().querySelector('textarea')?.value).toBe('A hard story');

      buttonNamed(dialog(), 'Save planning').click();
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(hasDialog()).toBe(false);
    });

    it('says why when the API refuses, on a voyage that has ended, and keeps the dialog open', async () => {
      const page = await open('/voyages/PROJ-097/models');
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      planningChoice('Panel').click();
      await flush(page);
      buttonNamed(dialog(), 'Save planning').click();
      await flush(page);
      expect(hasDialog()).toBe(true);
      expect(text(dialog().querySelector('.ah-banner'))).toContain(
        'Story PROJ-097 is terminal'
      );
    });

    it('does not send twice on a double click', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change planning').click();
      await flush(page);
      planningChoice('Panel').click();
      await flush(page);
      const save = buttonNamed(dialog(), 'Save planning');
      save.click();
      save.click();
      await flush(page);
      expect(commands(page)).toHaveLength(1);
    });
  });

  it('says it could not read the models, and tries again', async () => {
    let failed = false;
    const page = await open('/voyages/PROJ-118/models', (request, server) => {
      // Only the first read of the model plan fails.
      if (
        !failed &&
        request.method === 'GET' &&
        request.path === '/stories/PROJ-118/models'
      ) {
        failed = true;
        server.switches.failNext = 500;
      }
    });
    expect(
      text(page.root.querySelector('ah-models-tab ah-panel-body ah-banner'))
    ).toContain('Try again');
    expect(page.root.querySelector('table')).toBeNull();
    buttonNamed(page.root, 'Try again').click();
    await flush(page);
    expect(page.root.querySelector('table')).not.toBeNull();
  });

  describe('Reset', () => {
    it('sends {planning: null} and takes the slot back to its default', async () => {
      const page = await open('/voyages/PROJ-118/models');
      buttonNamed(page.root, 'Change models').click();
      await flush(page);
      type(modelInput('Planning'), 'claude-sonnet-5');
      choose(effortSelect('Planning'), 'high');
      await flush(page);
      buttonNamed(dialog(), 'Save models').click();
      await flush(page);
      expect(page.root.querySelectorAll('tbody button')).toHaveLength(2);

      buttonNamed(row(page, 'planning'), 'Reset').click();
      await flush(page);
      expect(commands(page)).toHaveLength(2);
      expect(
        (commands(page)[1]?.body as Record<string, unknown>)['models']
      ).toEqual({ planning: null });
      expect(text(row(page, 'planning').children[5])).toBe('—');
      expect(page.root.querySelectorAll('tbody button')).toHaveLength(0);
    });
  });

  describe('?change=<slot>', () => {
    it('opens the dialog on its own, with the focus on that slot, and drops the link', async () => {
      await open('/voyages/PROJ-118/models?change=planning');
      expect(hasDialog()).toBe(true);
      expect(document.activeElement).toBe(modelInput('Planning'));
      expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-118/models');
    });

    it('opens once: closing it does not bring it back', async () => {
      const page = await open('/voyages/PROJ-118/models?change=review');
      expect(document.activeElement).toBe(modelInput('Review'));
      buttonNamed(dialog(), 'Cancel').click();
      await flush(page);
      expect(hasDialog()).toBe(false);
      await flush(page);
      expect(hasDialog()).toBe(false);
    });

    it('ignores anything that is not a slot', async () => {
      const page = await open('/voyages/PROJ-118/models?change=%3Cscript%3E');
      expect(hasDialog()).toBe(false);
      expect(page.root.querySelector('table')).not.toBeNull();
    });
  });
});
