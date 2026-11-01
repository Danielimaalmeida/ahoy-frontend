import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestViolations } from '@testing/fixtures/contract';
import getPhaseSettings from '@testing/fixtures/getPhaseSettings.json';
import listPhaseSettingsEvents from '@testing/fixtures/listPhaseSettingsEvents.json';
import { withField } from '@testing/fixtures/mutate';
import updatePhaseSettings from '@testing/fixtures/updatePhaseSettings.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import { isPhaseSettingsPage, isSettingsEventPage } from './guards';
import type { PhaseSettingsChange } from './types';

const BASE = '/api/v1';
const [intake] = getPhaseSettings.phases;

describe("the Phases settings' guard", () => {
  it('accepts both fixtures, a page nobody saved yet and a catalogue an admin saved', () => {
    expect(isPhaseSettingsPage(getPhaseSettings)).toBe(true);
    expect(isPhaseSettingsPage(updatePhaseSettings)).toBe(true);
    expect(isSettingsEventPage(listPhaseSettingsEvents)).toBe(true);
    expect(
      isPhaseSettingsPage({
        ...getPhaseSettings,
        maxBudgetNanoAiu: null,
        version: null,
        updatedBy: null,
        updatedByName: null,
        updatedAt: null,
      })
    ).toBe(true);
    expect(
      isPhaseSettingsPage(
        withField(getPhaseSettings, 'catalog', {
          ...getPhaseSettings.catalog,
          source: 'settings',
          saved: getPhaseSettings.catalog.models,
        })
      )
    ).toBe(true);
  });

  it('refuses an unknown field, an unknown effort, a cap of zero and an unknown catalogue source', () => {
    const row = (change: object): unknown =>
      withField(getPhaseSettings, 'phases', [{ ...intake, ...change }]);
    expect(isPhaseSettingsPage(row({ pinned: ['mcpServers'] }))).toBe(false);
    expect(
      isPhaseSettingsPage(
        row({ saved: { ...intake?.saved, reasoningEffort: 'huge' } })
      )
    ).toBe(false);
    expect(
      isPhaseSettingsPage(
        row({ saved: { ...intake?.saved, budgetNanoAiu: 0 } })
      )
    ).toBe(false);
    expect(
      isPhaseSettingsPage(
        withField(getPhaseSettings, 'catalog', {
          ...getPhaseSettings.catalog,
          source: 'jira',
        })
      )
    ).toBe(false);
  });
});

describe("ApiClient's Phases settings", () => {
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

  it('reads the phases and sends a change that raises a cap with confirmSpend, as the contract takes it', async () => {
    const read = api.getPhaseSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/phases` })
      .flush(getPhaseSettings);
    expect(await read).toEqual({ ok: true, value: getPhaseSettings });

    const body = {
      version: 3,
      phases: {
        intake: { budgetNanoAiu: 20_000_000_000 },
        planning: { model: null, reasoningEffort: null },
      },
      confirmSpend: true,
    };
    const change = api.updatePhaseSettings(body);
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/phases`,
    });
    expect(patch.request.body).toEqual(body);
    expect(
      requestViolations('updatePhaseSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updatePhaseSettings);
    expect(await change).toEqual({ ok: true, value: updatePhaseSettings });
  });

  it('sends a catalogue, and null to go back to the built-in list, as the contract takes them', async () => {
    const catalogs: PhaseSettingsChange['models'][] = [
      [{ id: 'claude-sonnet-5', label: 'Sonnet', reasoningEfforts: ['high'] }],
      null,
    ];
    for (const models of catalogs) {
      const change = api.updatePhaseSettings({ version: 3, models });
      const patch = http.expectOne({
        method: 'PATCH',
        url: `${BASE}/settings/phases`,
      });
      expect(
        requestViolations('updatePhaseSettings', patch.request.body)
      ).toEqual([]);
      patch.flush(updatePhaseSettings);
      expect((await change).ok).toBe(true);
    }
  });

  it('refuses an answer the guard does not accept as an invalid response, not a refusal', async () => {
    const read = api.getPhaseSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/phases` })
      .flush({ ...getPhaseSettings, phases: [{ ...intake, fields: ['x'] }] });
    const result = await read;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_response');
  });
});
