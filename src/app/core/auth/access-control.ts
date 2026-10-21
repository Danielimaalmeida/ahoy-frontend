import {
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { FedevAuthService } from '@acme-fedev/auth';
import { AppConfigStore } from '@core/config/app-config';
import { isAllowedUser, normalizeQnumber, qnumberOf } from '@domain/access';

/**
 * Whether the signed-in user may use Ahoy. Two checks, either of which refuses: the `allowedQnumbers` of `/config.json`
 * against the user's qnumber (read before any call to the API), and the API's own list, which answers `403 forbidden`
 * ({@link AccessControl.refuseByApi}, called by `authInterceptor`). The shell shows "Access denied" instead of the app.
 */
@Injectable({ providedIn: 'root' })
export class AccessControl {
  private readonly auth = inject(FedevAuthService);
  private readonly config = inject(AppConfigStore).config;
  private readonly refusedByApi = signal(false);

  /** The user's qnumber, lower-cased: the token's `sub`, else its `uid`, else the auth library's current user. */
  readonly qnumber: Signal<string | null> = computed(() => {
    const profile = this.auth.userProfile();
    return qnumberOf([
      profile?.['sub'],
      profile?.['uid'],
      this.auth.currentUser(),
    ]);
  });

  /** The user's name from the sign-in profile (`given_name` and `family_name`); null when it has none. */
  readonly name: Signal<string | null> = computed(() => {
    const profile = this.auth.userProfile();
    const part = (key: string): string => {
      const value: unknown = profile?.[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const name = [part('given_name'), part('family_name')]
      .filter(Boolean)
      .join(' ');
    return name === '' ? null : name;
  });

  /** True when the user may not use the app. */
  readonly denied: Signal<boolean> = computed(
    () =>
      this.refusedByApi() ||
      !isAllowedUser(this.qnumber(), this.config().allowedQnumbers)
  );

  /** Records that the API refused the user (`403 forbidden`). It lasts until the page is loaded again. */
  refuseByApi(): void {
    this.refusedByApi.set(true);
  }

  /** The user's name when `actor` is the user's own qnumber; null for anyone else, whose name this profile cannot give. */
  nameOf(actor: string): string | null {
    const mine = this.qnumber();
    return mine !== null && normalizeQnumber(actor) === mine
      ? this.name()
      : null;
  }
}
