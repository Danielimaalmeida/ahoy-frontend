import type { ApplicationConfig } from "@angular/core";
import { provideAppInitializer, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { API_BASE } from "@core/api/api-base";
import { initAppConfig } from "@core/config/app-config";
import { FETCH } from "@core/realtime/fetch";
import { routes } from "./app.routes";

/** Application providers. Zoneless change detection is Angular 22's default, so no provider is needed for it. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    { provide: API_BASE, useValue: "/api/v1" },
    { provide: FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
    provideAppInitializer(initAppConfig),
  ],
};
