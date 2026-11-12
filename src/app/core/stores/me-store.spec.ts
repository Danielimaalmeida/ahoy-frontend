import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { problem } from '@testing/dom';
import getMe from '@testing/fixtures/getMe.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeStore } from './me-store';

const BASE = '/api/v1';

describe('the signed-in person, as the meeting pages read them', () => {
  let http: HttpTestingController;
  let store: MeStore;

  const read = () => http.expectOne({ method: 'GET', url: `${BASE}/me` });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MeStore);
  });

  afterEach(() => http.verify());

  it('knows nobody, then reads the person once', async () => {
    expect(store.me()).toBeNull();
    const first = store.load();
    const second = store.load();
    read().flush({ ...getMe, side: 'them' });
    await Promise.all([first, second]);
    expect(store.me()?.side).toBe('them');
    await store.load();
    http.expectNone(`${BASE}/me`);
  });

  it('knows nobody when the read fails, and tries again on the next page', async () => {
    const failed = store.load();
    read().flush(problem('internal_error'), {
      status: 500,
      statusText: 'Error',
      headers: { 'content-type': 'application/problem+json' },
    });
    await failed;
    expect(store.me()).toBeNull();
    const again = store.load();
    read().flush(getMe);
    await again;
    expect(store.me()?.side).toBe('us');
  });
});
