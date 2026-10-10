import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterOutlet,
  type UrlTree,
} from '@angular/router';
import { filter } from 'rxjs';
import { initialsOf } from '@core/auth/current-user';
import { CLOCK as CORE_CLOCK, type Timer } from '@core/realtime/clock';
import { EventBus } from '@core/realtime/event-bus';
import type { StreamStatus } from '@core/realtime/event-stream-client';
import { StoriesStore } from '@core/stores/stories-store';
import { CLOCK as UI_CLOCK, type Clock } from '@ui/pipes/clock';
import { ThemeService } from '@ui/theme/theme.service';
import { ToastHost } from '@ui/toast/toast';
import { TopBar, type LiveState, type TopBarUser } from '@ui/top-bar/top-bar';
import { FedevAuthService } from '@company-name-fedev/auth';

/** How often the relative times ("22 m ago", "Waiting 48 m") are read again. */
const CLOCK_TICK_MS = 30_000;

/** How long the search box waits for the next key before it leads to the voyages that match. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * The clock the pipes read: the data layer's clock, moved on every {@link CLOCK_TICK_MS}. The pipes call it while the
 * page is drawn, so reading a signal there makes the page draw again as the minutes pass, with no event and no
 * navigation. It stops with the shell.
 */
function tickingClock(): Clock {
  const clock = inject(CORE_CLOCK);
  const now = signal(clock.now());
  let timer: Timer | undefined;
  const tick = (): void => {
    now.set(clock.now());
    timer = clock.schedule(CLOCK_TICK_MS, tick);
  };
  timer = clock.schedule(CLOCK_TICK_MS, tick);
  inject(DestroyRef).onDestroy(() => timer?.cancel());
  return () => now();
}

/**
 * Where the top bar's Live indicator stands for a stream status. The first connection shows as Live, so that the amber
 * "Reconnecting" pill (and what a screen reader says about it) is only for a stream that dropped, not for every
 * start-up; if the first attempt fails, the status becomes `reconnecting` within a second.
 */
function liveStateOf(status: StreamStatus): LiveState {
  switch (status) {
    case 'connecting':
    case 'live':
      return 'live';
    case 'reconnecting':
      return 'reconnecting';
    case 'offline':
      return 'offline';
  }
}

/** The one query parameter of a URL as text; anything but a single string reads as absent. */
function textParam(tree: UrlTree, name: string): string | undefined {
  const value: unknown = tree.queryParams[name];
  return typeof value === 'string' ? value : undefined;
}

/** Whether a URL is the voyages list. */
function isVoyagesList(tree: UrlTree): boolean {
  const segments = tree.root.children['primary']?.segments ?? [];
  return segments.length === 1 && segments[0]?.path === 'voyages';
}

/**
 * The shell: the top bar on every screen (the count of voyages that need a person, the Live indicator, who is signed
 * in, and the search that leads to `/voyages?q=`), the page in one `main`, and the toasts. It keeps the voyage list
 * alive for the whole session, which holds the event stream open, so the count and the pages follow the stream.
 */
@Component({
  selector: 'ah-root',
  imports: [RouterOutlet, ToastHost, TopBar],
  providers: [{ provide: UI_CLOCK, useFactory: tickingClock }],
  styles: `
    :host {
      display: block;
    }
    .page {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 22px 24px 36px;
      box-sizing: border-box;
    }
    @media (max-width: 600px) {
      .page {
        padding-inline: 16px;
      }
    }
  `,
  template: `
    <ah-top-bar
      [needsYou]="needsYou()"
      [live]="live()"
      [user]="user()"
      [query]="query()"
      (queryChange)="search($event)"
      (logout)="auth.logout()"
    />
    <main class="page"><router-outlet /></main>
    <ah-toast-host />
  `,
})
export class App {
  private readonly stories = inject(StoriesStore);
  private readonly bus = inject(EventBus);
  private readonly router = inject(Router);
  private readonly clock = inject(CORE_CLOCK);
  private pendingSearch: Timer | undefined;
  protected readonly auth = inject(FedevAuthService);

  /** The text in the search box: that of the `?q=` of the page, if it has one. */
  protected readonly query = signal('');
  protected readonly needsYou = computed(() => this.stories.needsYou().length);
  protected readonly live = computed(() => liveStateOf(this.bus.status()));
  protected readonly user = computed((): TopBarUser | null => {
    const profile = this.auth.userProfile();
    if (profile === null) return null;
    const text = (key: string): string => {
      const value: unknown = profile[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const email = text('email');
    const name = [text('given_name'), text('family_name')]
      .filter(Boolean)
      .join(' ');
    return {
      email,
      name,
      initials: initialsOf(name || email || this.auth.currentUser() || ''),
    };
  });

  constructor() {
    // The theme chosen in the kit gallery applies from the first page, not only once the gallery is opened.
    inject(ThemeService);
    const destroyRef = inject(DestroyRef);
    this.stories.use(destroyRef);
    destroyRef.onDestroy(() => this.pendingSearch?.cancel());
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => {
        // A person who went somewhere else must not be taken back to the list by a search they stopped typing.
        this.pendingSearch?.cancel();
        this.query.set(
          textParam(this.router.parseUrl(event.urlAfterRedirects), 'q') ?? ''
        );
      });
  }

  /**
   * Leads to the voyages that match what was typed (deviation 3), once the person pauses for {@link SEARCH_DEBOUNCE_MS}.
   * On the list it keeps the status and replaces the address; from any other page it opens the list, as one step in the
   * history.
   */
  protected search(text: string): void {
    this.query.set(text);
    this.pendingSearch?.cancel();
    this.pendingSearch = this.clock.schedule(SEARCH_DEBOUNCE_MS, () =>
      this.goToVoyages(text)
    );
  }

  private goToVoyages(text: string): void {
    const current = this.router.parseUrl(this.router.url);
    const onList = isVoyagesList(current);
    const status = onList ? textParam(current, 'status') : undefined;
    const q = text.trim() === '' ? undefined : text;
    void this.router.navigate(['/voyages'], {
      queryParams: {
        ...(status !== undefined ? { status } : {}),
        ...(q !== undefined ? { q } : {}),
      },
      replaceUrl: onList,
    });
  }
}
