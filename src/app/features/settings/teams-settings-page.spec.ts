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
  problem,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getTeamsSettings from '@testing/fixtures/getTeamsSettings.json';
import listTeamsSettingsEvents from '@testing/fixtures/listTeamsSettingsEvents.json';
import putTeamsWebhook from '@testing/fixtures/putTeamsWebhook.json';
import updateTeamsSettings from '@testing/fixtures/updateTeamsSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TeamsSettingsPage } from './teams-settings-page';

const BASE = '/api/v1';
const TEAMS = getTeamsSettings.teams;
const WEBHOOK =
  'https://prod-12.westeurope.logic.example.com/workflows/abc/triggers/manual/paths/invoke?sig=secret';

describe('the Teams section of Team settings', () => {
  let fixture: ComponentFixture<TeamsSettingsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  /** Lets the answer, the promises after it and the next render finish. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const settingsRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/teams` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  /** Answers the pending reads of the settings and the history. */
  async function answer(
    page: object = getTeamsSettings,
    history: object = listTeamsSettingsEvents
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(history);
    await settle();
  }

  /** Answers a command with `body` (or a problem). */
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
    fixture = TestBed.createComponent(TeamsSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('shows the channel by its host only, where the cards link to, the last card and the history', async () => {
    expect(
      root.querySelector('[aria-label="Loading the Teams settings"]')
    ).not.toBeNull();
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('teams');
    settingsRead().flush(getTeamsSettings);
    history.flush(listTeamsSettingsEvents);
    await settle();

    expect(definition(root, 'Webhook')).toMatch(
      /^prod-12\.westeurope\.logic\.example\.com\/… Set by Bea Example · \w{3} \d{1,2} \w{3}$/
    );
    expect(definition(root, 'Card links open')).toBe(
      'https://ahoy.example.com The “Open Crew” button goes to https://ahoy.example.com/crew'
    );
    expect(definition(root, 'Last card')).toMatch(
      /^🚀 Sprint 41 starts today Posted \w{3} \d{1,2} \w{3} \d{2}:\d{2}$/
    );
    const changes = [
      ...root.querySelectorAll('[aria-label="Changes to Teams"] li'),
    ].map((li) => text(li.querySelector('.history__text span')));
    expect(changes).toEqual([
      "Replaced the crew's webhook (prod-00.westeurope.logic.example.com → prod-12.westeurope.logic.example.com)",
      'Sent a test card',
      'Set card links to https://ahoy.example.com',
      "Connected the crew's channel (prod-00.westeurope.logic.example.com)",
    ]);
    expect(text(root)).toContain('A sprint starts');
  });

  it('sends a test card only after the admin confirms it goes to the whole channel', async () => {
    await answer();
    buttonNamed(root, 'Send a test card').click();
    await settle();
    expect(text(dialog())).toContain('Everyone in the channel sees it');
    expect(text(dialog())).toContain('with an “Open Crew” button');
    http.expectNone({ method: 'POST', url: `${BASE}/settings/teams/test` });

    buttonNamed(dialog(), 'Send test card').click();
    await settle();
    const send = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/teams/test`,
    });
    await respond(send, {
      result: 'posted',
      detail: null,
      at: '2026-10-31T09:10:00.000Z',
    });
    await answer();
    expect(openDialog()).toBeNull();
    expect(toasts()).toContain('Test card posted to the channel.');
  });

  it('shows a card Teams did not take on the page, with the request, and no success toast', async () => {
    await answer();
    buttonNamed(root, 'Send a test card').click();
    await settle();
    buttonNamed(dialog(), 'Send test card').click();
    await settle();
    const failed = {
      result: 'failed',
      detail: 'HTTP 404',
      at: '2026-10-31T09:10:00.000Z',
    };
    await respond(
      http.expectOne({ method: 'POST', url: `${BASE}/settings/teams/test` }),
      failed
    );
    await answer({
      ...getTeamsSettings,
      teams: { ...TEAMS, lastCard: { title: 'Ahoy test card', ...failed } },
    });
    expect(openDialog()).toBeNull();
    expect(text(root)).toContain('Teams did not take the last card');
    expect(text(root)).toContain(
      'POST prod-12.westeurope.logic.example.com/… → HTTP 404'
    );
    expect(definition(root, 'Last card')).toMatch(
      /^Ahoy test card Not posted /
    );
    expect(toasts()).toEqual([]);
  });

  it('keeps the test card dialog open with the reason when Ahoy refuses it', async () => {
    await answer();
    buttonNamed(root, 'Send a test card').click();
    await settle();
    buttonNamed(dialog(), 'Send test card').click();
    await settle();
    await respond(
      http.expectOne({ method: 'POST', url: `${BASE}/settings/teams/test` }),
      problem('forbidden'),
      403
    );
    await answer();
    expect(openDialog()).not.toBeNull();
    expect(text(dialog())).toContain('Only admins change team settings');
  });

  it('connects the channel with the webhook, then sets the card links with the version the webhook moved to', async () => {
    await answer({ ...getTeamsSettings, teams: null }, { items: [] });
    expect(text(root)).toContain('Teams is off');
    buttonNamed(root, 'Connect the channel').click();
    await settle();
    expect(buttonNamed(dialog(), 'Connect').disabled).toBe(true);
    type(field(dialog(), 'Webhook'), WEBHOOK);
    type(field(dialog(), 'Card links open'), 'https://ahoy.example.com/team/');
    await settle();
    expect(text(dialog())).toContain(
      'Cards will go to prod-12.westeurope.logic.example.com'
    );
    buttonNamed(dialog(), 'Connect').click();
    await settle();

    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/teams/webhook`,
    });
    expect(put.request.body).toEqual({ webhookUrl: WEBHOOK });
    expect(requestViolations('putTeamsWebhook', put.request.body)).toEqual([]);
    await respond(put, { ...putTeamsWebhook, uiUrl: null });
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/teams`,
    });
    expect(patch.request.body).toEqual({
      version: putTeamsWebhook.version,
      uiUrl: 'https://ahoy.example.com/team',
    });
    expect(
      requestViolations('updateTeamsSettings', patch.request.body)
    ).toEqual([]);
    await respond(patch, updateTeamsSettings);
    await answer({ ...getTeamsSettings, teams: updateTeamsSettings });
    expect(openDialog()).toBeNull();
    expect(toasts()).toContain('The crew’s channel is connected.');
    expect(text(root)).not.toContain(WEBHOOK);
  });

  it('keeps the webhook when the field stays empty, and sends only the changed address', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    expect(field(dialog(), 'New webhook').getAttribute('placeholder')).toBe(
      'Leave empty to keep the webhook on prod-12.westeurope.logic.example.com'
    );
    type(field(dialog(), 'Card links open'), '');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    http.expectNone({ method: 'PUT', url: `${BASE}/settings/teams/webhook` });
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/teams`,
    });
    expect(patch.request.body).toEqual({ version: TEAMS.version, uiUrl: null });
    await respond(patch, { ...updateTeamsSettings, uiUrl: null });
    await answer();
  });

  it('refuses a webhook that is not https before sending it', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    type(field(dialog(), 'New webhook'), 'http://example.com/hook');
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
  });

  it('disconnects the channel only after a second, explicit press', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    expect(buttonsNamed(dialog(), 'Disconnect the channel')).toEqual([]);
    buttonNamed(dialog(), 'Disconnect the channel…').click();
    await settle();
    expect(text(dialog())).toContain('Its webhook is deleted');
    buttonNamed(dialog(), 'Disconnect the channel').click();
    await settle();
    await respond(
      http.expectOne({ method: 'DELETE', url: `${BASE}/settings/teams` }),
      null,
      204
    );
    await answer({ ...getTeamsSettings, teams: null });
    expect(text(root)).toContain('Teams is off');
  });

  it('asks for the webhook again when the API’s key no longer opens it, and offers no test card', async () => {
    await answer({ ...getTeamsSettings, webhookReadable: false });
    expect(text(root)).toContain("The stored webhook can't be opened");
    expect(buttonNamed(root, 'Send a test card').disabled).toBe(true);
    buttonNamed(root, 'Edit').click();
    await settle();
    expect(text(dialog())).toContain('Paste the webhook again');
    type(field(dialog(), 'Card links open'), 'https://ahoy.example.com');
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
  });

  it('shows the channel without buttons to someone who is not an admin', async () => {
    await answer({ ...getTeamsSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    expect(buttonsNamed(root, 'Send a test card')).toEqual([]);
    expect(buttonsNamed(root, 'Edit')).toEqual([]);
  });

  it('turns Connect off and says why while the API cannot seal a webhook', async () => {
    await answer({
      ...getTeamsSettings,
      teams: null,
      secretsConfigured: false,
    });
    expect(text(root)).toContain("A webhook can't be saved yet");
    expect(buttonNamed(root, 'Connect the channel').disabled).toBe(true);
  });
});
