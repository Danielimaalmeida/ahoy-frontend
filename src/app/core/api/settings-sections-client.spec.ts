import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestViolations } from '@testing/fixtures/contract';
import deleteFigmaToken from '@testing/fixtures/deleteFigmaToken.json';
import getAgentSettings from '@testing/fixtures/getAgentSettings.json';
import getFigmaSettings from '@testing/fixtures/getFigmaSettings.json';
import getTeamsSettings from '@testing/fixtures/getTeamsSettings.json';
import listAgentSettingsEvents from '@testing/fixtures/listAgentSettingsEvents.json';
import listFigmaSettingsEvents from '@testing/fixtures/listFigmaSettingsEvents.json';
import listTeamsSettingsEvents from '@testing/fixtures/listTeamsSettingsEvents.json';
import { withField } from '@testing/fixtures/mutate';
import putFigmaToken from '@testing/fixtures/putFigmaToken.json';
import putTeamsWebhook from '@testing/fixtures/putTeamsWebhook.json';
import sendTeamsTestCard from '@testing/fixtures/sendTeamsTestCard.json';
import testFigmaToken from '@testing/fixtures/testFigmaToken.json';
import updateAgentSettings from '@testing/fixtures/updateAgentSettings.json';
import updateFigmaSettings from '@testing/fixtures/updateFigmaSettings.json';
import updateTeamsSettings from '@testing/fixtures/updateTeamsSettings.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import {
  isAgentSettingsPage,
  isFigmaSettings,
  isFigmaSettingsPage,
  isFigmaTest,
  isSettingsEventPage,
  isTeamsCardOutcome,
  isTeamsSettings,
  isTeamsSettingsPage,
} from './guards';

const BASE = '/api/v1';

describe("the Teams, Figma and Agents settings' guards", () => {
  it('accept every fixture, and a section that is off', () => {
    expect(isTeamsSettingsPage(getTeamsSettings)).toBe(true);
    expect(isTeamsSettingsPage({ ...getTeamsSettings, teams: null })).toBe(
      true
    );
    expect(isTeamsSettings(putTeamsWebhook)).toBe(true);
    expect(isTeamsSettings(updateTeamsSettings)).toBe(true);
    expect(isTeamsCardOutcome(sendTeamsTestCard)).toBe(true);
    expect(isFigmaSettingsPage(getFigmaSettings)).toBe(true);
    expect(isFigmaSettings(putFigmaToken)).toBe(true);
    expect(isFigmaSettings(deleteFigmaToken)).toBe(true);
    expect(isFigmaSettings(updateFigmaSettings)).toBe(true);
    expect(
      isFigmaSettings({
        ...deleteFigmaToken,
        version: null,
        updatedBy: null,
        updatedByName: null,
        updatedAt: null,
      })
    ).toBe(true);
    expect(isFigmaTest(testFigmaToken)).toBe(true);
    expect(isAgentSettingsPage(getAgentSettings)).toBe(true);
    expect(isAgentSettingsPage(updateAgentSettings)).toBe(true);
    for (const page of [
      listTeamsSettingsEvents,
      listFigmaSettingsEvents,
      listAgentSettingsEvents,
    ])
      expect(isSettingsEventPage(page)).toBe(true);
  });

  it('refuse an unknown card result, a webhook shown whole, and a channel without a version', () => {
    const teams = getTeamsSettings.teams;
    expect(isTeamsCardOutcome({ ...sendTeamsTestCard, result: 'maybe' })).toBe(
      false
    );
    expect(
      isTeamsSettings(
        withField(teams, 'lastCard', { ...teams.lastCard, result: 'sent' })
      )
    ).toBe(false);
    expect(
      isTeamsSettings(
        withField(teams, 'webhook', 'https://prod-12.example.com/hook')
      )
    ).toBe(false);
    expect(isTeamsSettings(withField(teams, 'version', null))).toBe(false);
    expect(
      isTeamsSettingsPage(withField(getTeamsSettings, 'webhookReadable', 'yes'))
    ).toBe(false);
  });

  it('refuse no UI builder, a token shown whole and an unknown test result', () => {
    const figma = getFigmaSettings.figma;
    expect(isFigmaSettings(withField(figma, 'uiAgents', []))).toBe(false);
    expect(isFigmaSettings(withField(figma, 'uiAgents', ['']))).toBe(false);
    expect(isFigmaSettings(withField(figma, 'token', 'figd_abc'))).toBe(false);
    expect(isFigmaTest({ ...testFigmaToken, result: 'maybe' })).toBe(false);
    expect(isFigmaSettings.explain(withField(figma, 'uiAgents', []))).toMatch(
      /uiAgents/
    );
  });

  it('refuse a job that is off but cannot be, a missing entry of an unknown job and profiles that are not names', () => {
    const agents = getAgentSettings.agents;
    expect(
      isAgentSettingsPage(
        withField(getAgentSettings, 'agents', {
          ...agents,
          refinementAgent: null,
        })
      )
    ).toBe(false);
    expect(
      isAgentSettingsPage(
        withField(getAgentSettings, 'missing', [
          { job: 'otherAgent', name: 'Other', profile: 'x' },
        ])
      )
    ).toBe(false);
    expect(
      isAgentSettingsPage(
        withField(getAgentSettings, 'profiles', {
          ...getAgentSettings.profiles,
          names: [1],
        })
      )
    ).toBe(false);
  });
});

describe("ApiClient's Teams, Figma and Agents settings", () => {
  let http: HttpTestingController;
  let api: ApiClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiClient);
  });

  afterEach(() => http.verify());

  it('reads, connects, changes, tests and disconnects the crew’s channel on its own paths', async () => {
    const read = api.getTeamsSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/teams` })
      .flush(getTeamsSettings);
    expect(await read).toEqual({ ok: true, value: getTeamsSettings });

    const body = {
      webhookUrl: 'https://prod-12.westeurope.logic.example.com/workflows/abc',
      version: 3,
    };
    const connect = api.putTeamsWebhook(body);
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/teams/webhook`,
    });
    expect(put.request.body).toEqual(body);
    expect(requestViolations('putTeamsWebhook', put.request.body)).toEqual([]);
    put.flush(putTeamsWebhook);
    expect(await connect).toEqual({ ok: true, value: putTeamsWebhook });

    const change = api.updateTeamsSettings({ version: 4, uiUrl: null });
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/teams`,
    });
    expect(
      requestViolations('updateTeamsSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updateTeamsSettings);
    expect((await change).ok).toBe(true);

    const card = api.sendTeamsTestCard();
    http
      .expectOne({ method: 'POST', url: `${BASE}/settings/teams/test` })
      .flush(sendTeamsTestCard);
    expect(await card).toEqual({ ok: true, value: sendTeamsTestCard });

    const off = api.deleteTeamsSettings();
    http
      .expectOne({ method: 'DELETE', url: `${BASE}/settings/teams` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await off).toEqual({ ok: true, value: null });
  });

  it('reads, saves, tests and removes the Figma token, and changes the design phase', async () => {
    const read = api.getFigmaSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/figma` })
      .flush(getFigmaSettings);
    expect(await read).toEqual({ ok: true, value: getFigmaSettings });

    const save = api.putFigmaToken({ token: 'figd_example', version: 2 });
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/figma/token`,
    });
    expect(requestViolations('putFigmaToken', put.request.body)).toEqual([]);
    put.flush(putFigmaToken);
    expect((await save).ok).toBe(true);

    const change = api.updateFigmaSettings({
      version: 3,
      uiAgents: ['ahoy-frontend-developer'],
      selectorPrefix: 'ds-',
    });
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/figma`,
    });
    expect(
      requestViolations('updateFigmaSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updateFigmaSettings);
    expect((await change).ok).toBe(true);

    const test = api.testFigmaToken();
    http
      .expectOne({ method: 'POST', url: `${BASE}/settings/figma/test` })
      .flush(testFigmaToken);
    expect(await test).toEqual({ ok: true, value: testFigmaToken });

    const remove = api.deleteFigmaToken();
    http
      .expectOne({ method: 'DELETE', url: `${BASE}/settings/figma/token` })
      .flush(deleteFigmaToken);
    expect(await remove).toEqual({ ok: true, value: deleteFigmaToken });
  });

  it('reads the agents’ jobs and sends a change that turns one on with confirmSpend, as the contract takes it', async () => {
    const read = api.getAgentSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/agents` })
      .flush(getAgentSettings);
    expect(await read).toEqual({ ok: true, value: getAgentSettings });

    const body = {
      version: 2,
      knowledgeAgent: 'knowledge-curator',
      knowledgeRepo: 'acme/business-rules',
      confirmSpend: true,
    };
    const change = api.updateAgentSettings(body);
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/agents`,
    });
    expect(patch.request.body).toEqual(body);
    expect(
      requestViolations('updateAgentSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updateAgentSettings);
    expect(await change).toEqual({ ok: true, value: updateAgentSettings });
  });

  it('refuses an answer the guard does not accept as an invalid response, not a refusal', async () => {
    const read = api.getAgentSettings();
    http.expectOne({ method: 'GET', url: `${BASE}/settings/agents` }).flush({
      ...getAgentSettings,
      agents: { ...getAgentSettings.agents, diagnosisAgent: null },
    });
    const result = await read;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_response');
  });
});
