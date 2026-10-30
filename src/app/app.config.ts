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
} from '@acme-fedev/auth';
import { environment } from '../environments/environment';

/** The build's environment, or the one `loadRuntimeEnvironment` made from it with the team's sign-in. */
export type AppEnvironment = typeof environment;

/** The application's providers for an environment: `main.ts` passes the one with the team's sign-in. */
export function createAppConfig(env: AppEnvironment): ApplicationConfig {
  return {
    providers: [
      provideFedevAuth({
        env,
        includeAccessTokenInBackendRequests: true,
      }),
      {
        provide: FEDEV_AUTH_INIT_OPTIONS,
        useValue: {
          config: { ...env },
        },
      },
      provideHttpClient(withInterceptors([authInterceptor])),
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
}

/** The providers with the build's own sign-in, for code that has no runtime configuration. */
export const appConfig: ApplicationConfig = createAppConfig(environment);
