import {
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { FedevAuthService } from '@acme-fedev/auth';
import { normalizeQnumber, qnumberOf } from '@domain/access';

/**
 * Whether the signed-in user may use Ahoy. The API decides (`ahoy-hosted` D23): its allow-list is the deployment's
 * qnumbers and Team settings › People, and it answers `403 forbidden` to anyone else ({@link AccessControl.refuseByApi},
 * called by `authInterceptor`). The `allowedQnumbers` of `/config.json` is no longer read, so a person an admin adds in
 * People gets in without a new configuration. The shell shows "Access denied" instead of the app.
 */
@Injectable({ providedIn: 'root' })
export class AccessControl {
  private readonly auth = inject(FedevAuthService);
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

  /** True when the API refused the user. */
  readonly denied: Signal<boolean> = this.refusedByApi.asReadonly();

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
