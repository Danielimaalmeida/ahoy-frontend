import { Injectable, computed, inject, type Signal } from '@angular/core';
import { AppConfigStore } from '@core/config/app-config';

/**
 * Up to two letters for an avatar. The e-mail's local part is read as words: `alex.rivera@example.com` gives `AR`; a single
 * word gives its first two letters, so `alex@example.com` gives `AL` (as in the design system's TopBar). `?` if there is
 * nothing to read.
 */
export function initialsOf(id: string): string {
  const local = id.split('@')[0] ?? '';
  const [first, second] = local
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
  if (first === undefined) return '?';
  const letters = Array.from(first);
  const picked =
    second !== undefined
      ? [letters[0] ?? '', Array.from(second)[0] ?? '']
      : letters.slice(0, 2);
  return picked.map(initial).join('');
}

/** The first character of a letter in capitals. `ß` would give `SS`, which would break the two-letter limit. */
function initial(letter: string): string {
  return Array.from(letter.toUpperCase())[0] ?? '';
}

/**
 * Who the UI says the user is. The API has no `GET /me` (G6), so this is the `actor` of the `AppConfig`, which must match
 * the `X-Ahoy-Actor` the dev proxy sends. It serves "Recorded as…", "(you)", the avatar and the owner check. Later it can
 * come from the token's `sub` or from `GET /me` without its readers changing.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUser {
  private readonly config = inject(AppConfigStore).config;

  /** The user's id as the API records it: an e-mail locally. */
  readonly id: Signal<string> = computed(() => this.config().actor);

  /** Up to two letters for the avatar. */
  readonly initials: Signal<string> = computed(() => initialsOf(this.id()));

  /** Whether `actor` (a story's owner, who answered, who decided) is the user. Exact: the API compares ids exactly. */
  is(actor: string): boolean {
    return actor === this.id();
  }
}
