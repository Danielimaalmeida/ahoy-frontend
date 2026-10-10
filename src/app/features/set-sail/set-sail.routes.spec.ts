import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { testServer } from '@testing/mock-backend/spec-helpers';
import { describe, expect, it } from 'vitest';
import { SetSailPage } from './set-sail-page';
import { SET_SAIL_ROUTES } from './set-sail.routes';

describe('the Start voyage route', () => {
  it('shows the Start voyage page under /voyages/new, titled for the tab', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'voyages/new', children: SET_SAIL_ROUTES }],
          withComponentInputBinding()
        ),
        provideHttpClient(withInterceptors([mockBackendInterceptor])),
        provideMockBackend(testServer().server),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/voyages/new?key=PROJ-145&title=Export',
      SetSailPage
    );

    expect(document.title).toBe('Start voyage · Ahoy');
    expect(page.key()).toBe('PROJ-145');
    expect(page.title()).toBe('Export');
  });
});
