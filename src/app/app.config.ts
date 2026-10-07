import type { ApplicationConfig } from "@angular/core";
import { provideAppInitializer, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { authInterceptor } from "@core/auth/auth.interceptor";
import { initAppConfig } from "@core/config/app-config";
import { FETCH } from "@core/realtime/fetch";
import { routes } from "./app.routes";

/**
 * Application providers. Zoneless change detection is Angular 22's default, so no provider is needed for it. `API_BASE`
 * has none here: it comes from `AppConfig.apiBase`, read by `initAppConfig` before the app opens.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    { provide: FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
    provideAppInitializer(initAppConfig),
  ],
};
