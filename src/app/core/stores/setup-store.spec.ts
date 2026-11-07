import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { problem } from '@testing/dom';
import getSetup from '@testing/fixtures/getSetup.json';
import keepPhaseDefaults from '@testing/fixtures/keepPhaseDefaults.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SetupStore } from './setup-store';

const BASE = '/api/v1';

/** Lets the answers and the promises after them finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the setup steps, as the banner and the Setup page read them', () => {
  let http: HttpTestingController;
  let store: SetupStore;

  const reads = () => http.match({ method: 'GET', url: `${BASE}/setup` });
  const keep = () =>
    http.expectOne({
      method: 'POST',
      url: `${BASE}/setup/phases/keep-defaults`,
    });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SetupStore);
  });

  afterEach(() => http.verify());

  it('is neither ready nor not ready until the API answers, then says a step is missing', async () => {
    expect([store.setup(), store.notReady()]).toEqual([null, false]);
    const done = store.load();
    reads()[0]!.flush(getSetup);
    await done;
    expect([store.setup()?.requiredDone, store.notReady()]).toEqual([6, true]);
  });

  it('reads once more when asked during a read, and keeps the last answer when a read fails', async () => {
    const first = store.load();
    const second = store.load();
    const [read] = reads();
    expect(reads()).toHaveLength(0);
    read!.flush(getSetup);
    await settle();
    reads()[0]!.flush(problem('internal_error'), {
      status: 500,
      statusText: 'Error',
      headers: { 'content-type': 'application/problem+json' },
    });
    await Promise.all([first, second]);
    expect(store.setup()?.requiredDone).toBe(6);
    expect(store.error()).not.toBeNull();
  });

  it('shows Phases kept at once, and reads again when a read began before the save', async () => {
    const reading = store.load();
    const keeping = store.keepPhaseDefaults();
    expect(store.loading()).toBe(true);
    keep().flush(keepPhaseDefaults);
    await settle();
    expect(store.setup()?.requiredDone).toBe(7);
    // The read that began before the save answers with Phases missing; it is read again.
    reads()[0]!.flush(getSetup);
    await settle();
    reads()[0]!.flush(keepPhaseDefaults);
    await Promise.all([reading, keeping]);
    expect([store.setup()?.requiredDone, store.loading()]).toEqual([7, false]);
  });

  it('gives back a refused keep and changes nothing', async () => {
    const keeping = store.keepPhaseDefaults();
    keep().flush(problem('forbidden'), {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'content-type': 'application/problem+json' },
    });
    expect(await keeping).not.toBeNull();
    expect([store.setup(), store.loading()]).toEqual([null, false]);
  });
});
