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
  const components = () =>
    field<HTMLTextAreaElement>(root, 'Components and repositories');
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
    expect(components().value).toBe('');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Defects"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual(['Watch: on; Query: changed; Components: 1']);
  });

  it('turns the watch on with a query, priorities and components, sending what changed', async () => {
    await answer();
    choose(watch(), 'on');
    await settle();
    expect(text(root)).toContain('The watch needs a defects query.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(jql(), ' project = PROJ AND issuetype = Defect ');
    type(priorities(), 'Highest, High');
    type(components(), 'billing-api = billing-api\nweb-portal = web-portal');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      watchOn: true,
      defectsJql: 'project = PROJ AND issuetype = Defect',
      priorities: ['Highest', 'High'],
      components: [
        { component: 'billing-api', repository: 'billing-api' },
        { component: 'web-portal', repository: 'web-portal' },
      ],
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
    type(components(), 'billing-api=billing-api\n\nweb-portal =  web-portal');
    await settle();
    expect(text(root)).not.toContain('Unsaved changes');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(priorities(), 'Highest, High');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
  });

  it('refuses a component line it cannot read before sending anything', async () => {
    await answer();
    type(components(), 'billing-api = billing-api\nweb-portal');
    await settle();
    expect(text(root)).toContain(
      'Line 2: write it as "component = repository".'
    );
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
      'billing-api → billing-apiweb-portal → web-portal',
    ]);
  });
});
