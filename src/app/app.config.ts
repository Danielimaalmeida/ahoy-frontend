import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { authInterceptor } from '@core/auth/auth.interceptor';
import { AUTH_STRATEGY } from '@core/auth/auth-strategy';
import { FedevAuthStrategy } from '@core/auth/fedev-auth-strategy';
import { initAppConfig } from '@core/config/app-config';
import { FETCH } from '@core/realtime/fetch';
import { routes } from './app.routes';

import {
  FEDEV_AUTH_INIT_OPTIONS,
  FedevAuthService,
  provideFedevAuth,
  provideFedevAuthInitializer,
} from '@company-name-fedev/auth';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFedevAuth({
      env: environment,
      includeAccessTokenInBackendRequests: true,
    }),
    {
      provide: FEDEV_AUTH_INIT_OPTIONS,
      useValue: {
        config: { ...environment },
      },
    },
    provideAppInitializer(initAppConfig),
    provideFedevAuthInitializer(),
    {
      provide: AUTH_STRATEGY,
      useFactory: () => new FedevAuthStrategy(inject(FedevAuthService)),
    },
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    { provide: FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
  ],
};
