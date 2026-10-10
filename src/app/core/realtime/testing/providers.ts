import type { Provider } from '@angular/core';
import { API_BASE } from '@core/api/api-base';
import { ApiClient } from '@core/api/api-client';
import { CLOCK, RANDOM } from '../clock';
import { FETCH } from '../fetch';
import type { FakeApi } from './fake-api';
import type { FakeClock } from './fake-clock';
import type { FakeFetch } from './fake-fetch';

/** The providers that put the realtime layer and the stores on fakes: no network, no real time. For specs only. */
export function provideFakes(fakes: {
  api: FakeApi;
  clock: FakeClock;
  net: FakeFetch;
}): Provider[] {
  return [
    { provide: FETCH, useValue: fakes.net.fetch },
    { provide: CLOCK, useValue: fakes.clock },
    { provide: RANDOM, useValue: () => 0.5 },
    { provide: API_BASE, useValue: '/api/v1' },
    { provide: ApiClient, useValue: fakes.api },
  ];
}
