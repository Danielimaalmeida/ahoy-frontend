import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { MeetingLabelsStore } from '@core/stores/meeting-labels-store';
import { buttonNamed, field, problem, text, type } from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getMeetingSettings from '@testing/fixtures/getMeetingSettings.json';
import listMeetingSettingsEvents from '@testing/fixtures/listMeetingSettingsEvents.json';
import updateMeetingSettings from '@testing/fixtures/updateMeetingSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeetingSettingsPage } from './meeting-settings-page';

const BASE = '/api/v1';

describe('the Meetings section of Team settings', () => {
  let fixture: ComponentFixture<MeetingSettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/meetings` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getMeetingSettings,
    history: object = listMeetingSettingsEvents
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

  const us = () => field(root, 'Our side');
  const them = () => field(root, "Stakeholders' side");
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const patches = () =>
    http.match({ method: 'PATCH', url: `${BASE}/settings/meetings` });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MeetingSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    http.verify();
  });

  it('shows the default names before any save, with its own history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('meetings');
    settingsRead().flush(getMeetingSettings);
    history.flush(listMeetingSettingsEvents);
    await settle();
    expect(us().value).toBe('Us');
    expect(them().value).toBe('Stakeholders');
    expect(text(root)).toContain('Not saved yet');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Meetings"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual([
      "Our side: “Us” → “Northwind”; Stakeholders' side: “Stakeholders” → “Contoso”",
    ]);
  });

  it('saves only the name that changed, trimmed, and tells the meeting pages', async () => {
    await answer();
    type(them(), '  Contoso ');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({ themLabel: 'Contoso' });
    expect(
      requestViolations('updateMeetingSettings', patch?.request.body)
    ).toEqual([]);
    const saved = {
      ...getMeetingSettings,
      meetings: { ...updateMeetingSettings.meetings, usLabel: 'Us' },
    };
    await respond(patch!, saved);
    await answer(saved);
    expect(toasts()).toContain('Meeting names saved.');
    expect(them().value).toBe('Contoso');
    expect(TestBed.inject(MeetingLabelsStore).labels()).toEqual({
      us: 'Us',
      them: 'Contoso',
    });
  });

  it('refuses a blank or too long name before sending anything', async () => {
    await answer();
    type(us(), '   ');
    await settle();
    expect(text(root)).toContain('Give the side a name.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(us(), 'x'.repeat(41));
    await settle();
    expect(text(root)).toContain('At most 40 characters.');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(patches()).toEqual([]);
  });

  it('says another admin saved first, and shows theirs', async () => {
    await answer(updateMeetingSettings);
    type(us(), 'Fabrikam');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({ version: 1, usLabel: 'Fabrikam' });
    const theirs = {
      ...updateMeetingSettings,
      meetings: { ...updateMeetingSettings.meetings, version: 2 },
    };
    await respond(patch!, problem('stale_version'), 409);
    await answer(theirs);
    expect(text(root)).toContain('Another admin saved these names first');
    expect(us().value).toBe('Northwind');
  });

  it('reads only for a member who is not an admin', async () => {
    await answer({ ...updateMeetingSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    expect(root.querySelector('input')).toBeNull();
    expect([...root.querySelectorAll('dd')].map((dd) => text(dd))).toEqual([
      'Northwind',
      'Contoso',
    ]);
  });
});
