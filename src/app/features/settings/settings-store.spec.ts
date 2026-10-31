import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import getSonarSettings from '@testing/fixtures/getSonarSettings.json';
import listSettingsEvents from '@testing/fixtures/listSettingsEvents.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from './settings-store';

const BASE = '/api/v1';

describe('SettingsStore', () => {
  let http: HttpTestingController;
  let store: SettingsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
        SettingsStore,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SettingsStore);
  });

  afterEach(() => http.verify());

  /** The pending reads of the settings, oldest first. */
  const settingsReads = () =>
    http.match({ method: 'GET', url: `${BASE}/settings/sonar` });
  const historyReads = () =>
    http.match(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  it('keeps the latest read when two overlap and the older one answers last', async () => {
    const first = store.load();
    const second = store.load();
    const [older, newer] = settingsReads();
    const [olderHistory, newerHistory] = historyReads();
    const newest = {
      ...getSonarSettings,
      servers: [{ ...getSonarSettings.servers[0]!, version: 2 }],
    };
    newer!.flush(newest);
    newerHistory!.flush(listSettingsEvents);
    await second;
    expect(store.loading()).toBe(false);
    older!.flush(getSonarSettings);
    olderHistory!.flush(listSettingsEvents);
    await first;
    expect(store.sonar()?.servers.map((s) => s.version)).toEqual([2]);
    expect(store.loading()).toBe(false);
  });

  it('stays loading until the latest of two overlapping reads has answered', async () => {
    const first = store.load();
    const second = store.load();
    const [older, newer] = settingsReads();
    const [olderHistory, newerHistory] = historyReads();
    older!.flush(getSonarSettings);
    olderHistory!.flush(listSettingsEvents);
    await first;
    expect(store.loading()).toBe(true);
    expect(store.sonar()).toBeNull();
    newer!.flush(getSonarSettings);
    newerHistory!.flush(listSettingsEvents);
    await second;
    expect(store.loading()).toBe(false);
    expect(store.sonar()?.servers).toHaveLength(2);
  });
});
