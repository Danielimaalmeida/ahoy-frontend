import {
  Component,
  type ElementRef,
  input,
  linkedSignal,
  model,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Button } from '@ui/button/button';
import { Icon } from '@ui/icon/icon';
import { Logo } from '@ui/logo/logo';

/** The state of the live event stream: connected, trying again, or given up (the page is not updating itself). */
export type LiveState = 'live' | 'reconnecting' | 'offline';

/** The signed-in person shown in the avatar and account dropdown. */
export interface TopBarUser {
  readonly email: string;
  readonly initials: string;
  readonly name?: string;
}

const EXACT = { exact: true } as const;
const PREFIX = { exact: false } as const;
let nextMenuId = 0;

/**
 * The app header on every screen: the logo, the three destinations, search, the Live indicator, **Start voyage** (the only
 * primary button) and the signed-in person. It wraps on narrow screens and is never sticky. The current destination
 * carries `aria-current="page"`; **All hands** shows how many voyages need a person (hidden at 0). When the stream
 * drops, "Live" becomes a "Reconnecting to live updates…" pill. The search text is two-way: `queryChange` emits as the
 * person types, and `query` puts back the text of the current `?q=`. The account disclosure shows the name and e-mail
 * and emits `logout`; authentication remains the shell's responsibility.
 *
 * ```html
 * <ah-top-bar [needsYou]="store.needsYou().length" [live]="bus.state()" [user]="user()" [(query)]="query" />
 * ```
 */
@Component({
  selector: 'ah-top-bar',
  imports: [Button, Icon, Logo, RouterLink, RouterLinkActive],
  styleUrl: './top-bar.scss',
  host: {
    '(document:click)': 'dismissOutside($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
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
          >Needs you
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
          >Backlog</a
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
          @case ('live') {
            <span class="ah-live">Live</span>
          }
          @case ('reconnecting') {
            <span class="ah-badge ah-badge--input"
              >Reconnecting to live updates…</span
            >
          }
          @case ('offline') {
            <span class="ah-badge ah-badge--queued">Live updates are off</span>
          }
        }
      </span>
      <a ahButton="primary" routerLink="/voyages/new"
        ><ah-icon name="sail" />Start voyage</a
      >
      @if (user(); as person) {
        <div #account class="account" (focusout)="onFocusOut($event)">
          <button
            #trigger
            type="button"
            class="account__trigger"
            [class.account__trigger--open]="menuOpen()"
            [attr.aria-label]="'Account for ' + (person.name || person.email)"
            [attr.aria-expanded]="menuOpen()"
            [attr.aria-controls]="menuOpen() ? menuId : null"
            [attr.title]="person.email"
            (click)="menuOpen.set(!menuOpen())"
          >
            <span class="ah-avatar" aria-hidden="true">{{
              person.initials
            }}</span>
            <svg
              class="account__chevron"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          @if (menuOpen()) {
            <section
              [id]="menuId"
              class="account__menu"
              aria-label="Your account"
            >
              <div class="account__identity">
                <span class="ah-avatar account__avatar" aria-hidden="true">{{
                  person.initials
                }}</span>
                <div class="account__details">
                  @if (person.name) {
                    <strong class="account__name">{{ person.name }}</strong>
                  }
                  @if (person.email) {
                    <span class="account__email">{{ person.email }}</span>
                  }
                </div>
              </div>
              <button type="button" class="account__logout" (click)="logOut()">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 7l-5 5 5 5M5 12h10"
                  />
                </svg>
                Log out
              </button>
            </section>
          }
        </div>
      }
    </header>
  `,
})
export class TopBar {
  /** How many voyages need a person: `awaiting_input`, `awaiting_decision` and `halted`. */
  readonly needsYou = input(0);
  /** The state of the live event stream. */
  readonly live = input<LiveState>('live');
  /** The signed-in person; no avatar when `null`. */
  readonly user = input<TopBarUser | null>(null);
  /** The text in the search box. */
  readonly query = model('');
  /** Requests sign-out; the shell owns the authentication service. */
  readonly logout = output<null>();

  protected readonly exact = EXACT;
  protected readonly prefix = PREFIX;
  protected readonly menuId = `ah-user-menu-${nextMenuId++}`;
  protected readonly menuOpen = linkedSignal({
    source: this.user,
    computation: () => false,
  });
  private readonly account = viewChild<ElementRef<HTMLElement>>('account');
  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected closeMenu(restoreFocus = false): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }

  protected dismissOutside(event: Event): void {
    if (
      event.target instanceof Node &&
      !this.account()?.nativeElement.contains(event.target)
    )
      this.closeMenu();
  }

  protected onFocusOut(event: FocusEvent): void {
    if (
      !(event.relatedTarget instanceof Node) ||
      !this.account()?.nativeElement.contains(event.relatedTarget)
    ) {
      this.closeMenu();
    }
  }

  protected logOut(): void {
    this.closeMenu(true);
    this.logout.emit(null);
  }

  protected onSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement)
      this.query.set(event.target.value);
  }
}
