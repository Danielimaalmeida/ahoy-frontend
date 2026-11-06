import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { problem } from '@testing/dom';
import updateMeetingSettings from '@testing/fixtures/updateMeetingSettings.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeetingLabelsStore } from './meeting-labels-store';

const BASE = '/api/v1';

describe('the names of a meeting’s two sides, as the meeting pages read them', () => {
  let http: HttpTestingController;
  let store: MeetingLabelsStore;

  const read = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/meetings` });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MeetingLabelsStore);
  });

  afterEach(() => http.verify());

  it('shows the defaults, then reads the settings once', async () => {
    expect(store.labels()).toEqual({ us: 'Us', them: 'Stakeholders' });
    const first = store.load();
    const second = store.load();
    read().flush(updateMeetingSettings);
    await Promise.all([first, second]);
    expect(store.labels()).toEqual({ us: 'Northwind', them: 'Contoso' });
    await store.load();
    http.expectNone(`${BASE}/settings/meetings`);
  });

  it('keeps names saved in Team settings over a read that started before the save', async () => {
    const reading = store.load();
    store.set({
      ...updateMeetingSettings.meetings,
      usLabel: 'Fabrikam',
      version: 2,
    });
    read().flush(updateMeetingSettings);
    await reading;
    expect(store.labels()).toEqual({ us: 'Fabrikam', them: 'Contoso' });
  });

  it('keeps the defaults when the read fails, and tries again on the next page', async () => {
    const failed = store.load();
    read().flush(problem('internal_error'), {
      status: 500,
      statusText: 'Error',
      headers: { 'content-type': 'application/problem+json' },
    });
    await failed;
    expect(store.labels()).toEqual({ us: 'Us', them: 'Stakeholders' });
    const again = store.load();
    read().flush(updateMeetingSettings);
    await again;
    expect(store.labels().us).toBe('Northwind');
  });
});
