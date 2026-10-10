import { InjectionToken, inject } from '@angular/core';
import { AppConfigStore } from '@core/config/app-config';

/**
 * Base path of the Ahoy API. Always relative and same-origin (F9): the dev proxy or the Ingress routes it.
 *
 * It comes from `AppConfig.apiBase` (`/config.json`, `/api/v1` when there is none), which is validated to be a path on this
 * origin. Provide it yourself only in tests.
 */
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => inject(AppConfigStore).config().apiBase,
});

/** A base without trailing slashes, so that `${base}/stories` is always right. */
export function trimBase(base: string): string {
  return base.replace(/\/+$/, '');
}
