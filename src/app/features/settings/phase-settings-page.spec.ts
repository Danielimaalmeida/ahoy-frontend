import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import {
  bannerHeadings,
  buttonNamed,
  buttonsNamed,
  choose,
  dialog,
  openDialog,
  problem,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getPhaseSettings from '@testing/fixtures/getPhaseSettings.json';
import listPhaseSettingsEvents from '@testing/fixtures/listPhaseSettingsEvents.json';
import updatePhaseSettings from '@testing/fixtures/updatePhaseSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PhaseSettingsPage } from './phase-settings-page';

const BASE = '/api/v1';
const AIU = 1_000_000_000;
const [INTAKE, PLANNING, IMPLEMENTATION, REVIEW] = getPhaseSettings.phases;

describe('the Phases section of Team settings', () => {
  let fixture: ComponentFixture<PhaseSettingsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const settingsRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/phases` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getPhaseSettings,
    history: object = listPhaseSettingsEvents
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(history);
    await settle();
  }

  async function respond(
    request: TestRequest,
    body: object | null,
    status = 200
  ): Promise<void> {
    if (status >= 400)
      request.flush(body, {
        status,
        statusText: 'Refused',
        headers: { 'content-type': 'application/problem+json' },
      });
    else request.flush(body, { status, statusText: 'OK' });
    await settle();
  }

  /** The control labelled `label`, such as "Intake AIU cap per run". */
  function control<T extends HTMLElement = HTMLInputElement>(label: string): T {
    const found = root.querySelector<T>(`[aria-label="${label}"]`);
    if (found === null) throw new Error(`no control labelled ${label}`);
    return found;
  }
  const options = (label: string) =>
    [...control<HTMLSelectElement>(label).options].map((o) => text(o));
  const row = (phase: string) =>
    [...root.querySelectorAll('[aria-label="Phases"] tbody tr')].find((r) =>
      text(r.querySelector('th')).startsWith(phase)
    );
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const patches = () =>
    http.match({ method: 'PATCH', url: `${BASE}/settings/phases` });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PhaseSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it("lists each phase with the deployment's values as the empty choice, a field the deployment sets as text, and the history", async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('phases');
    settingsRead().flush(getPhaseSettings);
    history.flush(listPhaseSettingsEvents);
    await settle();

    const rows = [...root.querySelectorAll('[aria-label="Phases"] tbody tr')];
    expect(rows.map((r) => text(r.querySelector('th')))).toEqual([
      'IntakeStory phase',
      'PlanningStory phase',
      'ImplementationStory phase',
      'ReviewStory phase',
    ]);
    expect(text(root)).toContain(
      "Caps up to 100 AIU per run, or a phase's deployment cap where that is higher."
    );
    expect(options('Intake model')[0]).toBe('Default');
    expect(
      text(row('Intake')?.querySelector('td:nth-of-type(1) .ah-hint'))
    ).toBe('claude-haiku-4.5');
    expect(
      text(row('Planning')?.querySelector('td:nth-of-type(2) .ah-hint'))
    ).toBe('model default');
    expect(
      text(row('Intake')?.querySelector('td:nth-of-type(4) .ah-hint'))
    ).toBe('15 min');
    expect(control<HTMLSelectElement>('Intake model').value).toBe('');
    expect(control<HTMLSelectElement>('Planning model').value).toBe(
      'claude-sonnet-5'
    );
    expect(options('Planning effort')).toEqual([
      'Default',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(control<HTMLSelectElement>('Planning effort').value).toBe('high');
    expect(control('Planning AIU cap per run').value).toBe('40');
    expect(control('Intake AIU cap per run').placeholder).toBe('10 AIU');
    expect(text(row('Intake'))).toContain('Up to 100 AIU');
    expect(text(row('Intake')?.querySelector('td:last-child'))).toBe('—');
    expect(
      root.querySelector('[aria-label="Implementation wait for CI"]')
    ).toBeNull();
    const wait = row('Implementation')?.querySelector('td:last-child');
    expect(text(wait?.querySelector('.cell > span'))).toBe('30 min');
    expect(text(wait?.querySelector('.ah-hint'))).toBe('Set by the deployment');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Phases"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual([
      'Planning model: the deployment’s → claude-sonnet-5; Planning AIU cap per run: the deployment’s → 40 AIU',
    ]);
  });

  it('saves a lower cap and a longer timeout at once, with only what changed', async () => {
    await answer();
    type(control('Intake AIU cap per run'), ' 5 ');
    type(control('Review timeout'), '45');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
    expect(bannerHeadings(root)).toEqual([]);
    buttonNamed(root, 'Save').click();
    await settle();
    expect(openDialog()).toBeNull();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 3,
      phases: {
        intake: { budgetNanoAiu: 5 * AIU },
        pr_review: { timeoutSeconds: 45 * 60 },
      },
    });
    expect(
      requestViolations('updatePhaseSettings', patch?.request.body)
    ).toEqual([]);
    await respond(patch!, updatePhaseSettings);
    await answer(updatePhaseSettings);
    expect(toasts()).toContain('Phases saved.');
    expect(text(root)).not.toContain('Unsaved changes');
    expect(control('Intake AIU cap per run').value).toBe('5');
  });

  it('gives a field back to the deployment with null', async () => {
    await answer();
    choose(control<HTMLSelectElement>('Planning model'), '');
    choose(control<HTMLSelectElement>('Planning effort'), '');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 3,
      phases: { planning: { model: null, reasoningEffort: null } },
    });
    await respond(patch!, getPhaseSettings);
    await answer();
  });

  it('warns that a higher cap spends more AIU, asks before saving, and sends confirmSpend', async () => {
    await answer();
    type(control('Review AIU cap per run'), '50');
    await settle();
    expect(bannerHeadings(root)).toContain(
      'Raising Review’s cap spends more AIU'
    );
    expect(text(root)).toContain(
      'Each Review run may then spend up to 50 AIU, not 30 AIU'
    );
    buttonNamed(root, 'Save…').click();
    await settle();
    expect(text(dialog())).toContain('Raise an AIU cap?');
    expect(text(dialog())).toContain('Review: 30 AIU → 50 AIU per run.');
    expect(patches()).toEqual([]);

    buttonNamed(dialog(), 'Raise and save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 3,
      phases: { pr_review: { budgetNanoAiu: 50 * AIU } },
      confirmSpend: true,
    });
    expect(
      requestViolations('updatePhaseSettings', patch?.request.body)
    ).toEqual([]);
    await respond(patch!, updatePhaseSettings);
    await answer(updatePhaseSettings);
    expect(toasts()).toContain('Phases saved, with the higher cap.');
  });

  it("counts giving a lowered cap back to the deployment's higher one as a raise", async () => {
    await answer();
    type(control('Planning AIU cap per run'), '');
    await settle();
    expect(bannerHeadings(root)).toContain(
      'Raising Planning’s cap spends more AIU'
    );
    buttonNamed(root, 'Save…').click();
    await settle();
    expect(text(dialog())).toContain('Planning: 40 AIU → 60 AIU per run.');
    buttonNamed(dialog(), 'Cancel').click();
    await settle();
    expect(patches()).toEqual([]);
    expect(control('Planning AIU cap per run').value).toBe('');
    expect(text(root)).toContain('Unsaved changes');
  });

  it('refuses a cap above the most allowed, a timeout that is not whole minutes, and Cancel puts the saved values back', async () => {
    await answer();
    type(control('Intake AIU cap per run'), '150');
    type(control('Intake timeout'), '2.5');
    await settle();
    expect(text(row('Intake'))).toContain('The most allowed is 100 AIU.');
    expect(text(row('Intake'))).toContain('Give a whole number of minutes.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    buttonNamed(root, 'Cancel').click();
    await settle();
    expect(control('Intake AIU cap per run').value).toBe('');
    expect(control('Intake timeout').value).toBe('');
    expect(text(root)).not.toContain('Unsaved changes');
  });

  it('says another admin saved first, and shows their phases instead of sending the change over them', async () => {
    await answer();
    type(control('Intake timeout'), '20');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    await respond(
      patches()[0]!,
      {
        ...problem('stale_version'),
        detail: 'phase settings are at version 4, not 3',
      },
      409
    );
    await answer(updatePhaseSettings);
    expect(control('Intake AIU cap per run').value).toBe('5');
    expect(control('Intake timeout').value).toBe('');
    expect(text(root)).toContain('Another admin saved the phases first');
    expect(text(root)).not.toContain('Unsaved changes');
  });

  it('says caps can only go down when the deployment sets no ceiling', async () => {
    await answer({
      ...getPhaseSettings,
      maxBudgetNanoAiu: null,
      phases: [
        { ...INTAKE, budgetCapNanoAiu: 10 * AIU },
        PLANNING,
        IMPLEMENTATION,
        REVIEW,
      ],
    });
    expect(bannerHeadings(root)).toContain('Caps can only be lowered');
    expect(text(root)).toContain(
      "Caps may only go down from the deployment's."
    );
    expect(text(row('Intake'))).toContain('Up to 10 AIU');
  });

  it('saves a catalogue the admin types, and refuses an effort it does not know', async () => {
    await answer();
    expect(text(root)).toContain(
      'The built-in list. Save a list to choose your own.'
    );
    expect(buttonsNamed(root, 'Use the built-in list')).toEqual([]);
    buttonNamed(root, 'Remove').click();
    await settle();
    type(control('Model 2 efforts'), 'low, huge');
    await settle();
    expect(text(root)).toContain('gpt-5.6-terra: huge is not an effort');
    expect(buttonNamed(root, 'Save catalogue').disabled).toBe(true);
    type(control('Model 2 efforts'), 'low, high, low');
    await settle();
    buttonNamed(root, 'Save catalogue').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 3,
      models: [
        {
          id: 'claude-sonnet-5',
          label: 'Claude Sonnet 5',
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
        {
          id: 'gpt-5.6-terra',
          label: 'GPT-5.6 Terra',
          reasoningEfforts: ['low', 'high'],
        },
        { id: 'gpt-5.6-luna' },
      ],
    });
    expect(
      requestViolations('updatePhaseSettings', patch?.request.body)
    ).toEqual([]);
    const saved = {
      ...updatePhaseSettings,
      catalog: {
        ...updatePhaseSettings.catalog,
        source: 'settings',
        saved: updatePhaseSettings.catalog.models,
      },
    };
    await respond(patch!, saved);
    await answer(saved);
    expect(toasts()).toContain('Model catalogue saved.');

    buttonNamed(root, 'Use the built-in list').click();
    await settle();
    const [back] = patches();
    expect(back?.request.body).toEqual({ version: 4, models: null });
    await respond(back!, updatePhaseSettings);
    await answer(updatePhaseSettings);
    expect(toasts()).toContain('Back to the built-in models.');
  });

  it('shows the catalogue as text when the deployment sets it', async () => {
    await answer({
      ...getPhaseSettings,
      catalog: { ...getPhaseSettings.catalog, source: 'file', editable: false },
    });
    expect(text(root)).toContain('Set by the deployment (AHOY_MODEL_CATALOG).');
    expect(root.querySelector('[aria-label="Model 1 id"]')).toBeNull();
    expect(buttonsNamed(root, 'Save catalogue')).toEqual([]);
    const efforts = [
      ...root.querySelectorAll('[aria-label="Model catalogue"] tbody tr'),
    ].map((r) => [text(r.children[0]), text(r.children[2])]);
    expect(efforts).toContainEqual(['claude-haiku-4.5', 'None']);
    expect(efforts).toContainEqual(['gpt-5.6-terra', 'Any']);
  });

  it('keeps a model that takes no effort as "none" when the catalogue is saved again', async () => {
    await answer();
    expect(control('Model 1 efforts').value).toBe('none');
    expect(control('Model 3 efforts').value).toBe('');
    type(control('Model 3 label'), 'Terra');
    await settle();
    buttonNamed(root, 'Save catalogue').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body.models[0]).toEqual({
      id: 'claude-haiku-4.5',
      label: 'Claude Haiku 4.5',
      reasoningEfforts: [],
    });
    expect(patch?.request.body.models[2]).toEqual({
      id: 'gpt-5.6-terra',
      label: 'Terra',
    });
    expect(
      requestViolations('updatePhaseSettings', patch?.request.body)
    ).toEqual([]);
    await respond(patch!, updatePhaseSettings);
    await answer(updatePhaseSettings);
  });

  it('refuses a model that does not take the effort the phase would run on, and keeps that effort in its select', async () => {
    await answer();
    choose(control<HTMLSelectElement>('Planning model'), 'claude-haiku-4.5');
    await settle();
    expect(text(row('Planning'))).toContain(
      'claude-haiku-4.5 takes no effort.'
    );
    expect(control<HTMLSelectElement>('Planning effort').value).toBe('high');
    expect(options('Planning effort')).toEqual(['Default', 'high']);
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    choose(control<HTMLSelectElement>('Planning effort'), '');
    await settle();
    expect(text(row('Planning'))).not.toContain('takes no effort');
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 3,
      phases: {
        planning: { model: 'claude-haiku-4.5', reasoningEffort: null },
      },
    });
    await respond(patch!, getPhaseSettings);
    await answer();
  });

  it('judges only what the admin changed: a saved cap above a lowered maximum blocks nothing and is no raise', async () => {
    const lowered = {
      ...getPhaseSettings,
      phases: getPhaseSettings.phases.map((p) =>
        p.phase === 'planning' ? { ...p, budgetCapNanoAiu: 20 * AIU } : p
      ),
    };
    await answer(lowered);
    type(control('Review timeout'), '45');
    await settle();
    expect(text(row('Planning'))).not.toContain('The most allowed');
    expect(bannerHeadings(root)).toEqual([]);
    buttonNamed(root, 'Save').click();
    await settle();
    expect(openDialog()).toBeNull();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 3,
      phases: { pr_review: { timeoutSeconds: 45 * 60 } },
    });
    await respond(patch!, getPhaseSettings);
    await answer();
  });

  it('shows the phases as text, without controls, to someone who is not an admin', async () => {
    await answer({ ...getPhaseSettings, canEdit: false });
    expect(bannerHeadings(root)).toContain('Only admins change these');
    expect(root.querySelectorAll('select, input')).toHaveLength(0);
    expect(buttonsNamed(root, 'Save')).toEqual([]);
    const cells = [...(row('Planning')?.querySelectorAll('td') ?? [])].map(
      (td) => text(td.querySelector('.cell > span') ?? td)
    );
    expect(cells).toEqual(['claude-sonnet-5', 'high', '40 AIU', '30 min', '—']);
  });
});
