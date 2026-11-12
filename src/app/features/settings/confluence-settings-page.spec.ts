import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import {
  buttonNamed,
  buttonsNamed,
  definition,
  dialog,
  field,
  openDialog,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getConfluenceSettings from '@testing/fixtures/getConfluenceSettings.json';
import listConfluenceSettingsEvents from '@testing/fixtures/listConfluenceSettingsEvents.json';
import putConfluenceConnection from '@testing/fixtures/putConfluenceConnection.json';
import updateConfluenceSettings from '@testing/fixtures/updateConfluenceSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfluenceSettingsPage } from './confluence-settings-page';

const BASE = '/api/v1';
const CONFLUENCE = getConfluenceSettings.confluence;

describe('the Confluence section of Team settings', () => {
  let fixture: ComponentFixture<ConfluenceSettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/confluence` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getConfluenceSettings,
    history: object = listConfluenceSettingsEvents
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
    request.flush(body, { status, statusText: 'OK' });
    await settle();
  }

  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConfluenceSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('shows the connection with its token as the last four, its last test, the space and the history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('confluence');
    settingsRead().flush(getConfluenceSettings);
    history.flush(listConfluenceSettingsEvents);
    await settle();

    expect(definition(root, 'Base URL')).toBe(
      'https://confluence.example.com/confluence'
    );
    expect(definition(root, 'Token')).toMatch(
      /^••••9f3a Set by Alex Example · \w{3} \d{1,2} \w{3}$/
    );
    expect(definition(root, 'Last test')).toMatch(
      /^Connected as Ahoy service \w{3} \d{1,2} \w{3} \d{2}:\d{2}$/
    );
    expect(definition(root, 'Space')).toBe('PROJ');
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Confluence"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual([
      'Set the parent page search to space PROJ',
      'Replaced the Confluence token: ••••51e0 → ••••9f3a',
      'Connected Confluence at https://confluence.example.com/confluence, token ••••51e0',
    ]);
  });

  it('says Confluence is off, and connects it with a base URL and a token that is never shown', async () => {
    await answer({ ...getConfluenceSettings, confluence: null });
    expect(text(root)).toContain('Confluence is off');
    expect(buttonsNamed(root, 'Test connection')).toEqual([]);
    buttonNamed(root, 'Connect Confluence').click();
    await settle();
    expect(buttonNamed(dialog(), 'Connect').disabled).toBe(true);
    type(field(dialog(), 'Base URL'), 'https://confluence.example.com/wiki/');
    const token = field(dialog(), 'Token');
    expect(token.type).toBe('password');
    type(token, '  example-token ');
    await settle();
    buttonNamed(dialog(), 'Connect').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/confluence/connection`,
    });
    expect(put.request.body).toEqual({
      baseUrl: 'https://confluence.example.com/wiki',
      token: 'example-token',
    });
    expect(
      requestViolations('putConfluenceConnection', put.request.body)
    ).toEqual([]);
    await respond(put, putConfluenceConnection);
    await answer({
      ...getConfluenceSettings,
      confluence: putConfluenceConnection,
    });
    expect(openDialog()).toBeNull();
    expect(toasts()).toContain('Confluence is connected.');
    expect(text(root)).not.toContain('example-token');
  });

  it('tests the connection and shows a refusal with the request it made', async () => {
    await answer();
    buttonNamed(root, 'Test connection').click();
    await settle();
    expect(buttonNamed(root, 'Testing…').disabled).toBe(true);
    const refused = {
      result: 'refused',
      detail: 'HTTP 401',
      at: '2026-10-31T11:00:00.000Z',
    };
    await respond(
      http.expectOne({
        method: 'POST',
        url: `${BASE}/settings/confluence/test`,
      }),
      refused
    );
    await answer({
      ...getConfluenceSettings,
      confluence: {
        ...CONFLUENCE,
        connection: { ...CONFLUENCE.connection, lastTest: refused },
      },
    });
    expect(text(root)).toContain('Confluence refused the token');
    expect(text(root)).toContain('GET /rest/api/user/current → HTTP 401');
    expect(definition(root, 'Last test')).toMatch(/^Refused /);
  });

  it('searches every space when the space key is emptied', async () => {
    await answer();
    buttonsNamed(root, 'Edit')[1]!.click();
    await settle();
    const key = field(dialog(), 'Space key');
    expect(key.value).toBe('PROJ');
    type(key, 'PR OJ');
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    type(key, ' ');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/confluence`,
    });
    expect(patch.request.body).toEqual({
      version: CONFLUENCE.version,
      spaceKey: null,
    });
    expect(
      requestViolations('updateConfluenceSettings', patch.request.body)
    ).toEqual([]);
    await respond(patch, updateConfluenceSettings);
    await answer({
      ...getConfluenceSettings,
      confluence: updateConfluenceSettings,
    });
    expect(toasts()).toContain('Pages are searched in every space now.');
    expect(definition(root, 'Space')).toBe(
      'Every space that the token can see'
    );
  });

  it('turns Confluence off only after a second, explicit press', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    buttonNamed(dialog(), 'Turn Confluence off…').click();
    await settle();
    expect(text(dialog())).toContain('Pages already created stay');
    buttonNamed(dialog(), 'Turn Confluence off').click();
    await settle();
    await respond(
      http.expectOne({ method: 'DELETE', url: `${BASE}/settings/confluence` }),
      null,
      204
    );
    await answer({ ...getConfluenceSettings, confluence: null });
    expect(toasts()).toContain('Confluence is off.');
    expect(text(root)).toContain('Confluence is off');
  });

  it('shows the settings without buttons to someone who is not an admin', async () => {
    await answer({ ...getConfluenceSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    for (const label of ['Test connection', 'Edit'])
      expect(buttonsNamed(root, label)).toEqual([]);
  });
});
