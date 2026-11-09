import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { buttonNamed, choose, field, problem, text, type } from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getDefectSettings from '@testing/fixtures/getDefectSettings.json';
import listDefectSettingsEvents from '@testing/fixtures/listDefectSettingsEvents.json';
import previewJiraBacklog from '@testing/fixtures/previewJiraBacklog.json';
import updateDefectSettings from '@testing/fixtures/updateDefectSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefectSettingsPage } from './defect-settings-page';

const BASE = '/api/v1';

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

  async function answer(
    page: object = getDefectSettings,
    history: object = listDefectSettingsEvents
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

  const watch = () => field<HTMLSelectElement>(root, 'Watch');
  const jql = () => field<HTMLTextAreaElement>(root, 'Defects query (JQL)');
  const priorities = () => field(root, 'Priorities tried');
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
    ]);
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

  it('refuses caps on starts it cannot keep', async () => {
    await answer(updateDefectSettings);
    type(field(root, 'Open voyages at once'), '21');
    await settle();
    expect(text(root)).toContain('Type a whole number from 1 to 20.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
  });
});
