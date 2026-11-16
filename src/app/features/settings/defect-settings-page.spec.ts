import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '@core/api/api-base';
import { buttonNamed, choose, field, problem, text, type } from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getDefectSettings from '@testing/fixtures/getDefectSettings.json';
import getEnvironments from '@testing/fixtures/getEnvironments.json';
import listDefectSettingsEvents from '@testing/fixtures/listDefectSettingsEvents.json';
import previewJiraBacklog from '@testing/fixtures/previewJiraBacklog.json';
import updateDefectSettings from '@testing/fixtures/updateDefectSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefectSettingsPage } from './defect-settings-page';

const BASE = '/api/v1';
/** The id of the fixture's TEST environment. */
const TEST_ID = '5f0c1d6e-2b7a-4c39-9a51-0d3e8f4b6a21';

describe('the Defects section of Team settings', () => {
  let fixture: ComponentFixture<DefectSettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/defects` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  /** Answers the read of the environments the section makes beside its own. */
  const environmentsRead = (page: object = getEnvironments) =>
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/environments` })
      .flush(page);

  async function answer(
    page: object = getDefectSettings,
    history: object = listDefectSettingsEvents,
    environments: object = getEnvironments
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(history);
    environmentsRead(environments);
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

  const watch = () => field<HTMLSelectElement>(root, 'Watch');
  const jql = () => field<HTMLTextAreaElement>(root, 'Defects query (JQL)');
  const priorities = () => field(root, 'Priorities tried');
  const reproduce = () =>
    field<HTMLSelectElement>(root, 'Reproduce before starting');
  const environment = () => field<HTMLSelectElement>(root, 'Environment');
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const patches = () =>
    http.match({ method: 'PATCH', url: `${BASE}/settings/defects` });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DefectSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => http.verify());

  it('shows the watch off before any save, with its own history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('defects');
    settingsRead().flush(getDefectSettings);
    history.flush(listDefectSettingsEvents);
    environmentsRead();
    await settle();
    expect(watch().value).toBe('off');
    expect(jql().value).toBe('');
    expect(priorities().value).toBe('');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Defects"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual(['Watch: on; Query: changed']);
    expect(text(root)).not.toContain('Components and repositories');
  });

  it('turns the watch on with a query and priorities, sending what changed', async () => {
    await answer();
    choose(watch(), 'on');
    await settle();
    expect(text(root)).toContain('The watch needs a defects query.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(jql(), ' project = PROJ AND issuetype = Defect ');
    type(priorities(), 'Highest, High');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      watchOn: true,
      defectsJql: 'project = PROJ AND issuetype = Defect',
      priorities: ['Highest', 'High'],
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    await respond(patch!, updateDefectSettings);
    await answer(updateDefectSettings);
    expect(toasts()).toContain('Watch on. Defect settings saved.');
    expect(watch().value).toBe('on');
    expect(priorities().value).toBe('Highest, High, Medium');
  });

  it('does not count a change of spacing alone as unsaved', async () => {
    await answer(updateDefectSettings);
    type(priorities(), 'Highest,High,  Medium');
    await settle();
    expect(text(root)).not.toContain('Unsaved changes');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(priorities(), 'Highest, High');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
  });

  it('refuses priorities it cannot keep before sending anything', async () => {
    await answer();
    type(priorities(), 'High, high');
    await settle();
    expect(text(root)).toContain('Name each priority once.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(patches()).toEqual([]);
  });

  it('asks Jira how many issues the typed query matches, and saves nothing', async () => {
    await answer();
    type(jql(), 'project = PROJ');
    await settle();
    buttonNamed(root, 'Preview').click();
    await settle();
    const preview = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/jira/backlog-preview`,
    });
    expect(preview.request.body).toEqual({ jql: 'project = PROJ' });
    await respond(preview, previewJiraBacklog);
    expect(text(root)).toContain('42 issues match');
    expect(text(root)).toContain('PROJ-123');
    expect(patches()).toEqual([]);
  });

  it('turns the watch off with the version it read', async () => {
    await answer(updateDefectSettings);
    choose(watch(), 'off');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({ version: 1, watchOn: false });
    const off = {
      ...updateDefectSettings,
      defects: { ...updateDefectSettings.defects, watchOn: false, version: 2 },
    };
    await respond(patch!, off);
    await answer(off);
    expect(toasts()).toContain('Defect settings saved.');
  });

  it('says another admin saved first, and shows theirs', async () => {
    await answer(updateDefectSettings);
    type(priorities(), 'Highest');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const theirs = {
      ...updateDefectSettings,
      defects: { ...updateDefectSettings.defects, version: 2 },
    };
    await respond(patches()[0]!, problem('stale_version'), 409);
    await answer(theirs);
    expect(text(root)).toContain('Another admin saved these settings first');
    expect(priorities().value).toBe('Highest, High, Medium');
  });

  it('reads only for someone who is not an admin', async () => {
    await answer({ ...updateDefectSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    expect(root.querySelector('select')).toBeNull();
    expect([...root.querySelectorAll('dd')].map((dd) => text(dd))).toEqual([
      'On',
      'project = PROJ AND issuetype = Defect AND status in (Open, Reopened)',
      'Highest, High, Medium',
      'Off',
      'Sam Example (q123456)',
      '20 AIU',
      'Off',
      '*.example.com',
      '7 days',
    ]);
  });

  it('says where and how often a defect is reproduced to someone who is not an admin', async () => {
    await answer({
      ...updateDefectSettings,
      canEdit: false,
      defects: {
        ...updateDefectSettings.defects,
        reproduceOn: true,
        reproduceMode: 'required',
        reproduceEnvironmentId: TEST_ID,
      },
    });
    const dd = (term: string) =>
      text(
        [...root.querySelectorAll('dt')].find((dt) => text(dt) === term)
          ?.nextElementSibling ?? null
      );
    expect(dd('Reproduction')).toBe(
      'On, in TEST: at most 5 a day. Required: Ahoy starts only what it reproduced'
    );
    expect([
      dd('Allowed hosts'),
      dd('Screenshots and recordings kept'),
    ]).toEqual(['*.example.com', '7 days']);
  });

  it('saves the allowed hosts and the days evidence is kept, one per line and without a yes to any spend', async () => {
    await answer(updateDefectSettings);
    const hosts = field<HTMLTextAreaElement>(root, 'Allowed hosts');
    expect(hosts.value).toBe('*.example.com');
    type(hosts, '*.example.com\n Test.Example.org, *.example.com');
    type(field(root, 'Days screenshots and recordings are kept'), '0');
    await settle();
    expect(text(root)).not.toContain('Ahoy will spend AIU');
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 1,
      reproduceAllowedHosts: ['*.example.com', 'test.example.org'],
      evidenceDays: 0,
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    const saved = {
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        reproduceAllowedHosts: ['*.example.com', 'test.example.org'],
        evidenceDays: 0,
        version: 2,
      },
    };
    await respond(patch!, saved);
    await answer(saved);
    expect(toasts()).toContain('Defect settings saved.');
  });

  it('refuses a host it cannot keep and days outside 0 to 30 before sending anything', async () => {
    await answer(updateDefectSettings);
    type(field(root, 'Allowed hosts'), 'https://test.example.com');
    await settle();
    expect(text(root)).toContain(
      'https://test.example.com is not a host name or a *.domain wildcard'
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(field(root, 'Allowed hosts'), '*.example.com');
    type(field(root, 'Days screenshots and recordings are kept'), '31');
    await settle();
    expect(text(root)).toContain('Type a whole number from 0 to 30.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
  });

  it('turns automatic starts on only with an AIU cap, a person to start as and a yes to the spend, sending confirmSpend', async () => {
    await answer({
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        budgetNanoAiu: null,
        startAs: null,
        startAsName: null,
      },
    });
    choose(field<HTMLSelectElement>(root, 'Automatic starts'), 'on');
    await settle();
    expect(text(root)).toContain(
      'Automatic starts need an AIU cap per defect.'
    );
    expect(text(root)).toContain(
      'Automatic starts need a person to start as: their Copilot token runs the voyages.'
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(field(root, 'Start as'), 'ahoy-defect-watch');
    await settle();
    expect(text(root)).toContain(
      'A qnumber is q then letters or digits, such as q123456.'
    );
    type(field(root, 'Start as'), ' Q777 ');
    type(field(root, 'AIU cap per defect'), '15');
    type(field(root, 'Starts per day'), '3');
    await settle();
    expect(text(root)).toContain('Ahoy may spend up to 45 AIU a day by itself');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    const yes = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    yes.click();
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 1,
      autoStart: true,
      startAs: 'q777',
      budgetNanoAiu: 15_000_000_000,
      maxStartsPerDay: 3,
      confirmSpend: true,
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    const on = {
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        autoStart: true,
        startAs: 'q777',
        startAsName: null,
        budgetNanoAiu: 15_000_000_000,
        maxStartsPerDay: 3,
        version: 2,
      },
    };
    await respond(patch!, on);
    await answer(on);
    expect(toasts()).toContain('Automatic starts on. Defect settings saved.');
  });

  it('asks again for a yes when raising what automatic starts may spend, not when lowering it', async () => {
    const on = {
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        autoStart: true,
        budgetNanoAiu: 15_000_000_000,
        maxStartsPerDay: 3,
      },
    };
    await answer(on);
    type(field(root, 'Open voyages at once'), '2');
    type(field(root, 'AIU cap per defect'), '10');
    await settle();
    expect(text(root)).not.toContain('a day by itself');
    expect(buttonNamed(root, 'Save').disabled).toBe(false);
    type(field(root, 'AIU cap per defect'), '25');
    await settle();
    expect(text(root)).toContain('Ahoy may spend up to 75 AIU a day by itself');
    expect(text(root)).toContain('This raises what Ahoy may spend by itself.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 1,
      budgetNanoAiu: 25_000_000_000,
      maxActive: 2,
      confirmSpend: true,
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    const raised = {
      ...on,
      defects: {
        ...on.defects,
        budgetNanoAiu: 25_000_000_000,
        maxActive: 2,
        version: 2,
      },
    };
    await respond(patch!, raised);
    await answer(raised);
    expect(toasts()).toContain('Defect settings saved.');
  });

  it('asks again for a yes when automatic starts move to another person', async () => {
    const on = {
      ...updateDefectSettings,
      defects: { ...updateDefectSettings.defects, autoStart: true },
    };
    await answer(on);
    type(field(root, 'Start as'), 'q777');
    await settle();
    expect(text(root)).toContain(
      "The voyages will run on another person's Copilot token."
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 1,
      startAs: 'q777',
      confirmSpend: true,
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    const moved = {
      ...on,
      defects: {
        ...on.defects,
        startAs: 'q777',
        startAsName: null,
        version: 2,
      },
    };
    await respond(patch!, moved);
    await answer(moved);
    expect(toasts()).toContain('Defect settings saved.');
  });

  it('turns reproduction on only with an environment and a yes to the spend, sending confirmSpend', async () => {
    await answer(updateDefectSettings);
    choose(reproduce(), 'on');
    await settle();
    expect(text(root)).toContain(
      'Reproduction needs an environment to reproduce defects in.'
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect([...environment().options].map((option) => text(option))).toEqual([
      'None',
      'TEST',
      'Demo',
    ]);
    choose(environment(), TEST_ID);
    await settle();
    expect(text(root)).toContain(
      'Ahoy will spend AIU reproducing defects by itself'
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 1,
      reproduceOn: true,
      reproduceEnvironmentId: TEST_ID,
      confirmSpend: true,
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    const on = {
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        reproduceOn: true,
        reproduceEnvironmentId: TEST_ID,
        version: 2,
      },
    };
    await respond(patch!, on);
    await answer(on);
    expect(toasts()).toContain('Reproduction on. Defect settings saved.');
    expect(environment().value).toBe(TEST_ID);
  });

  it('asks again for a yes when raising the reproductions per day, not when the verdict starts to decide', async () => {
    const on = {
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        reproduceOn: true,
        reproduceEnvironmentId: TEST_ID,
      },
    };
    await answer(on);
    choose(
      field<HTMLSelectElement>(root, 'What the verdict decides'),
      'required'
    );
    type(field(root, 'Reproductions per day'), '3');
    await settle();
    expect(text(root)).not.toContain('reproducing defects by itself');
    expect(buttonNamed(root, 'Save').disabled).toBe(false);
    type(field(root, 'Reproductions per day'), '8');
    await settle();
    expect(text(root)).toContain(
      'Ahoy will spend AIU reproducing defects by itself'
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: 1,
      reproduceMode: 'required',
      maxReproductionsPerDay: 8,
      confirmSpend: true,
    });
    expect(
      requestViolations('updateDefectSettings', patch?.request.body)
    ).toEqual([]);
    const raised = {
      ...on,
      defects: {
        ...on.defects,
        reproduceMode: 'required',
        maxReproductionsPerDay: 8,
        version: 2,
      },
    };
    await respond(patch!, raised);
    await answer(raised);
    expect(toasts()).toContain('Defect settings saved.');
  });

  it('points at Team settings › Environments when no environment is listed', async () => {
    await answer(updateDefectSettings, listDefectSettingsEvents, {
      ...getEnvironments,
      environments: [],
    });
    expect(text(root)).toContain('No environment is listed yet.');
    expect(
      root
        .querySelector('a[href="/settings/environments"]')
        ?.textContent?.trim()
    ).toBe('Team settings › Environments');
  });

  it('keeps the saved environment in the list when the environments cannot be read', async () => {
    const on = {
      ...updateDefectSettings,
      defects: {
        ...updateDefectSettings.defects,
        reproduceOn: true,
        reproduceEnvironmentId: TEST_ID,
      },
    };
    settingsRead().flush(on);
    historyRead().flush(listDefectSettingsEvents);
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/environments` })
      .flush(problem('unavailable'), {
        status: 503,
        statusText: 'Refused',
        headers: { 'content-type': 'application/problem+json' },
      });
    await settle();
    expect(environment().value).toBe(TEST_ID);
    expect(text(root)).not.toContain('No environment is listed yet.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
  });

  it('refuses a number of reproductions per day it cannot keep', async () => {
    await answer(updateDefectSettings);
    type(field(root, 'Reproductions per day'), '51');
    await settle();
    expect(text(root)).toContain('Type a whole number from 1 to 50.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
  });

  it('refuses caps on starts it cannot keep', async () => {
    await answer(updateDefectSettings);
    type(field(root, 'Open voyages at once'), '21');
    await settle();
    expect(text(root)).toContain('Type a whole number from 1 to 20.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
  });
});
