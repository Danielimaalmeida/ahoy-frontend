import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { LiveState, TopBarUser } from './top-bar';
import { TopBar } from './top-bar';

@Component({ template: `` })
class Page {}

@Component({
  imports: [TopBar],
  template: `<ah-top-bar
    [needsYou]="needsYou()"
    [live]="live()"
    [user]="user()"
    [(query)]="query"
    (logout)="logouts.update(increment)"
  />`,
})
class Host {
  readonly needsYou = signal(4);
  readonly live = signal<LiveState>('live');
  readonly user = signal<TopBarUser | null>({
    email: 'alex@example.com',
    name: 'Alex Morgan',
    initials: 'AM',
  });
  readonly query = signal('');
  readonly logouts = signal(0);
  readonly increment = (count: number): number => count + 1;
}

async function render(url = '/') {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', component: Page }])],
  });
  const fixture = TestBed.createComponent(Host);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const nav = () =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('.ah-nav__item'));
  const current = () =>
    nav()
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.textContent!.replace(/\s+/g, ' ').trim());
  async function go(to: string) {
    await router.navigateByUrl(to);
    fixture.detectChanges();
    await fixture.whenStable();
  }
  return {
    fixture,
    root,
    nav,
    current,
    go,
    bar: root.querySelector('header.ah-topbar')!,
  };
}

describe('ah-top-bar', () => {
  it('lays out the logo, the three destinations, search, Live, Start voyage and the avatar, in that order', async () => {
    const { bar } = await render();
    expect(
      Array.from(bar.children).map(
        (c) =>
          c.tagName.toLowerCase() +
          (c.className ? '.' + c.className.split(' ')[0] : '')
      )
    ).toEqual([
      'ah-logo',
      'nav.ah-nav',
      'input.ah-search',
      'span',
      'a.ah-btn',
      'div.account',
    ]);
  });

  it('links the logo home and the destinations to Needs you, Voyages and Backlog', async () => {
    const { root, nav } = await render();
    expect(root.querySelector('a.ah-logo')!.getAttribute('href')).toBe('/');
    expect(root.querySelector('nav')!.getAttribute('aria-label')).toBe('Main');
    expect(nav().map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/voyages',
      '/docks',
    ]);
  });

  for (const [url, destination] of [
    ['/', 'Needs you 4'],
    ['/voyages', 'Voyages'],
    ['/voyages?status=halted', 'Voyages'],
    ['/voyages/new', 'Voyages'],
    ['/voyages/PROJ-123/plan', 'Voyages'],
    ['/docks', 'Backlog'],
  ] as const)
    it(`marks only ${destination} as the current destination at ${url}`, async () => {
      const { current } = await render(url);
      expect(current()).toEqual([destination]);
    });

  it('marks no destination on a page that is none of them, and follows navigation', async () => {
    const { current, go } = await render('/somewhere/else');
    expect(current()).toEqual([]);
    await go('/docks');
    expect(current()).toEqual(['Backlog']);
    await go('/');
    expect(current()).toEqual(['Needs you 4']);
  });

  it('does not mark All hands on the other pages just because / is a prefix of every URL', async () => {
    const { current } = await render('/voyages/PROJ-123');
    expect(current()).not.toContain('Needs you 4');
  });

  it('shows how many voyages need you on All hands, and nothing at zero', async () => {
    const { fixture, nav } = await render();
    expect(nav()[0]!.querySelector('.ah-count')!.textContent).toBe('4');
    fixture.componentInstance.needsYou.set(0);
    fixture.detectChanges();
    expect(nav()[0]!.querySelector('.ah-count')).toBeNull();
    expect(nav()[0]!.textContent!.trim()).toBe('Needs you');
  });

  it('does not mark Backlog as planned now that it reads Jira', async () => {
    const { nav } = await render();
    expect(
      nav().map((a) => a.querySelector('.ah-soon')?.textContent ?? null)
    ).toEqual([null, null, null]);
  });

  it('has Start voyage as its only primary button, a link to the form with the sail icon', async () => {
    const { bar } = await render();
    const primary = bar.querySelectorAll('.ah-btn--primary');
    expect(primary.length).toBe(1);
    expect(primary[0]!.tagName).toBe('A');
    expect(primary[0]!.getAttribute('href')).toBe('/voyages/new');
    expect(primary[0]!.textContent).toBe('Start voyage');
    expect(primary[0]!.querySelector('svg')!.getAttribute('data-icon')).toBe(
      'sail'
    );
    expect(bar.querySelectorAll('.ah-btn').length).toBe(1);
  });

  it('is a plain header: not sticky and not fixed, so it scrolls with the page and wraps', async () => {
    const { bar } = await render();
    expect(bar.className).toBe('ah-topbar');
    expect(bar.hasAttribute('style')).toBe(false);
  });
});

describe('ah-top-bar, live indicator', () => {
  const status = (root: HTMLElement) =>
    root.querySelector<HTMLElement>("[role='status']")!;

  it('shows the green Live dot and the word Live while connected', async () => {
    const { root } = await render();
    expect(status(root).querySelector('.ah-live')!.textContent).toBe('Live');
    expect(status(root).querySelector('.ah-badge')).toBeNull();
    expect(status(root).textContent!.trim()).toBe('Live');
  });

  it('swaps Live for the Reconnecting pill when the stream drops, and back when it recovers', async () => {
    const { fixture, root } = await render();
    const region = status(root);
    fixture.componentInstance.live.set('reconnecting');
    fixture.detectChanges();
    expect(region.querySelector('.ah-live')).toBeNull();
    const pill = region.querySelector('.ah-badge')!;
    expect(pill.className).toBe('ah-badge ah-badge--input');
    expect(pill.textContent).toBe('Reconnecting to live updates…');
    fixture.componentInstance.live.set('live');
    fixture.detectChanges();
    expect(region.querySelector('.ah-badge')).toBeNull();
    expect(region.querySelector('.ah-live')!.textContent).toBe('Live');
    // The same live region the whole time, so a screen reader hears the change.
    expect(status(root)).toBe(region);
  });

  it('says plainly that live updates are off when the stream has given up', async () => {
    const { fixture, root } = await render();
    fixture.componentInstance.live.set('offline');
    fixture.detectChanges();
    expect(status(root).querySelector('.ah-live')).toBeNull();
    expect(status(root).querySelector('.ah-badge')!.textContent).toBe(
      'Live updates are off'
    );
  });

  it('never shows Live and a pill at once, in any state', async () => {
    const { fixture, root } = await render();
    for (const state of ['live', 'reconnecting', 'offline'] as const) {
      fixture.componentInstance.live.set(state);
      fixture.detectChanges();
      expect(status(root).children.length).toBe(1);
    }
  });
});

describe('ah-top-bar, person and search', () => {
  it('shows an account button with initials, an accessible name and the email tooltip', async () => {
    const { root } = await render();
    const avatar = root.querySelector('.ah-avatar')!;
    const trigger = root.querySelector<HTMLButtonElement>('.account__trigger')!;
    expect(avatar.textContent).toBe('AM');
    expect(trigger.getAttribute('title')).toBe('alex@example.com');
    expect(trigger.getAttribute('aria-label')).toBe('Account for Alex Morgan');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.account__menu')).toBeNull();
  });

  it('opens the identity dropdown and toggles it closed without logging out', async () => {
    const { fixture, root } = await render();
    const trigger = root.querySelector<HTMLButtonElement>('.account__trigger')!;
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(
      root.querySelector('.account__menu')!.id
    );
    expect(root.querySelector('.account__name')!.textContent).toBe(
      'Alex Morgan'
    );
    expect(root.querySelector('.account__email')!.textContent).toBe(
      'alex@example.com'
    );
    trigger.click();
    fixture.detectChanges();
    expect(root.querySelector('.account__menu')).toBeNull();
    expect(fixture.componentInstance.logouts()).toBe(0);
  });

  it('emits logout only when Log out is pressed and closes the dropdown', async () => {
    const { fixture, root } = await render();
    root.querySelector<HTMLButtonElement>('.account__trigger')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.account__logout')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.logouts()).toBe(1);
    expect(root.querySelector('.account__menu')).toBeNull();
  });

  it('dismisses on outside click and Escape, restoring focus for Escape', async () => {
    const { fixture, root } = await render();
    const trigger = root.querySelector<HTMLButtonElement>('.account__trigger')!;
    trigger.click();
    fixture.detectChanges();
    root.querySelector<HTMLInputElement>('.ah-search')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.account__menu')).toBeNull();
    trigger.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.account__logout')!.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    fixture.detectChanges();
    expect(root.querySelector('.account__menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the dropdown open while tabbing inside and closes when focus leaves', async () => {
    const { fixture, root } = await render();
    const trigger = root.querySelector<HTMLButtonElement>('.account__trigger')!;
    trigger.click();
    fixture.detectChanges();
    const logout = root.querySelector<HTMLButtonElement>('.account__logout')!;
    trigger.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: logout })
    );
    fixture.detectChanges();
    expect(root.querySelector('.account__menu')).not.toBeNull();
    logout.dispatchEvent(
      new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: root.querySelector('.ah-search'),
      })
    );
    fixture.detectChanges();
    expect(root.querySelector('.account__menu')).toBeNull();
  });

  it('closes an open dropdown when the user disappears or changes', async () => {
    const { fixture, root } = await render();
    root.querySelector<HTMLButtonElement>('.account__trigger')!.click();
    fixture.detectChanges();
    fixture.componentInstance.user.set({
      email: 'sam@example.com',
      initials: 'SA',
    });
    fixture.detectChanges();
    expect(root.querySelector('.account__menu')).toBeNull();
    expect(
      root.querySelector('.account__trigger')!.getAttribute('aria-label')
    ).toBe('Account for sam@example.com');
    fixture.componentInstance.user.set(null);
    fixture.detectChanges();
    expect(root.querySelector('.account')).toBeNull();
  });

  it('shows no avatar, login or logout when there is no user', async () => {
    const { fixture, root } = await render();
    fixture.componentInstance.user.set(null);
    fixture.detectChanges();
    expect(root.querySelector('.ah-avatar')).toBeNull();
    expect(root.textContent).not.toMatch(/log ?(in|out)|sign ?(in|out)/i);
  });

  it('has a labelled search box that reports what is typed', async () => {
    const { fixture, root } = await render();
    const search = root.querySelector<HTMLInputElement>('input.ah-search')!;
    expect(search.type).toBe('search');
    expect(search.getAttribute('aria-label')).toBe('Search voyages');
    expect(search.placeholder).toBe('Search by key or title');
    search.value = 'PROJ-12';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.query()).toBe('PROJ-12');
  });

  it('shows the query it is given, such as the one in the URL', async () => {
    const { fixture, root } = await render();
    fixture.componentInstance.query.set('invoice');
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('input.ah-search')!.value).toBe(
      'invoice'
    );
  });
});
