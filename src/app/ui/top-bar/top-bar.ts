import { Component, input, model } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { Button } from "@ui/button/button";
import { Icon } from "@ui/icon/icon";
import { Logo } from "@ui/logo/logo";

/** The state of the live event stream: connected, trying again, or given up (the page is not updating itself). */
export type LiveState = "live" | "reconnecting" | "offline";

/** The signed-in person as the bar shows them: initials in the avatar, the e-mail in its tooltip. */
export interface TopBarUser {
  readonly email: string;
  readonly initials: string;
}

const EXACT = { exact: true } as const;
const PREFIX = { exact: false } as const;

/**
 * The app header on every screen: the logo, the three destinations, search, the Live indicator, **Set sail** (the only
 * primary button) and the signed-in person. It wraps on narrow screens and is never sticky. The current destination
 * carries `aria-current="page"`; **All hands** shows how many voyages need a person (hidden at 0). When the stream
 * drops, "Live" becomes a "Reconnecting to live updates…" pill. The search text is two-way: `queryChange` emits as the
 * person types, and `query` puts back the text of the current `?q=`.
 *
 * ```html
 * <ah-top-bar [needsYou]="store.needsYou().length" [live]="bus.state()" [user]="user()" [(query)]="query" />
 * ```
 */
@Component({
  selector: "ah-top-bar",
  imports: [Button, Icon, Logo, RouterLink, RouterLinkActive],
  template: `
    <header class="ah-topbar">
      <ah-logo />
      <nav class="ah-nav" aria-label="Main">
        <a
          class="ah-nav__item"
          routerLink="/"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="exact"
          >All hands
          @if (needsYou() > 0) {
            <span class="ah-count">{{ needsYou() }}</span>
          }
        </a>
        <a
          class="ah-nav__item"
          routerLink="/voyages"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="prefix"
          >Voyages</a
        >
        <a
          class="ah-nav__item"
          routerLink="/docks"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="prefix"
          >The Docks <span class="ah-soon">planned</span></a
        >
      </nav>
      <input
        class="ah-search"
        type="search"
        placeholder="Search by key or title"
        aria-label="Search voyages"
        [value]="query()"
        (input)="onSearch($event)"
      />
      <span role="status">
        @switch (live()) {
          @case ("live") {
            <span class="ah-live">Live</span>
          }
          @case ("reconnecting") {
            <span class="ah-badge ah-badge--input">Reconnecting to live updates…</span>
          }
          @case ("offline") {
            <span class="ah-badge ah-badge--queued">Live updates are off</span>
          }
        }
      </span>
      <a ahButton="primary" routerLink="/voyages/new"><ah-icon name="sail" />Set sail</a>
      @if (user(); as person) {
        <span
          class="ah-avatar"
          role="img"
          [attr.aria-label]="'Signed in as ' + person.email"
          [attr.title]="person.email"
          >{{ person.initials }}</span
        >
      }
    </header>
  `,
})
export class TopBar {
  /** How many voyages need a person: `awaiting_input`, `awaiting_decision` and `halted`. */
  readonly needsYou = input(0);
  /** The state of the live event stream. */
  readonly live = input<LiveState>("live");
  /** The signed-in person; no avatar when `null`. */
  readonly user = input<TopBarUser | null>(null);
  /** The text in the search box. */
  readonly query = model("");

  protected readonly exact = EXACT;
  protected readonly prefix = PREFIX;

  protected onSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }
}
