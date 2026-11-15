import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ok } from '@core/api/api-error';
import type { Story } from '@core/api/types';
import { AppConfigStore } from '@core/config/app-config';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { BranchReleases } from '../context/branch-releases';
import { VoyageContext } from '../context/voyage-context';
import { VoyageHeader } from './voyage-header';

describe('VoyageHeader', () => {
  let api: FakeApi;
  let story: Story;
  let fixture: ComponentFixture<VoyageHeader>;

  beforeEach(() => {
    story = aStory('PROJ-123', {
      phase: 'implementation',
      status: 'running',
      version: 23,
      budgetNanoAiu: 30_000_000_000,
      spentNanoAiu: 1_000_000_000,
    });
    api = new FakeApi();
    const net = new FakeFetch();
    net.stream();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version: story.version, state: {} }))
      )
      .on('listStoryRuns', () => Promise.resolve(ok([])))
      .on('listQuestions', () => Promise.resolve(ok([])))
      .on('listGateRecords', () => Promise.resolve(ok([])))
      .on('getStoryModels', (key) =>
        Promise.resolve(
          ok({ storyKey: key, version: story.version, slots: [] })
        )
      )
      .on('listArtifacts', () =>
        Promise.resolve(ok({ revision: 1, items: [] }))
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: [], lastEventId: null }))
      );
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net }),
        provideRouter([]),
        VoyageContext,
        BranchReleases,
      ],
    });
  });

  afterEach(() => fixture?.destroy());

  async function flush(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      await fixture.whenStable();
    }
  }

  async function render(): Promise<HTMLElement> {
    TestBed.inject(VoyageContext).open(story.key);
    fixture = TestBed.createComponent(VoyageHeader);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (root: Element | null): string =>
    (root?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function more(root: Element): HTMLButtonElement {
    const found = root.querySelector<HTMLButtonElement>(
      '.header__more > button'
    );
    if (found === null) throw new Error('No More button');
    return found;
  }

  function key(target: Element, name: string): void {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true })
    );
  }

  it('links the key to the issue in Jira, in a new tab', async () => {
    const config = TestBed.inject(AppConfigStore);
    config.set({ ...config.config(), jiraBaseUrl: 'https://jira.example.com' });
    const link = (await render()).querySelector<HTMLAnchorElement>(
      'a.header__key'
    );
    expect(link?.getAttribute('href')).toBe(
      'https://jira.example.com/browse/PROJ-123'
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.getAttribute('aria-label')).toBe(
      'PROJ-123, open in Jira (new tab)'
    );
  });

  it('shows the key as text when no Jira is known', async () => {
    const root = await render();
    expect(root.querySelector('a.header__key')).toBeNull();
    expect(text(root.querySelector('.header__line .ah-key'))).toBe('PROJ-123');
  });

  it('keeps the rest of the actions under More, which opens closed and lists Stop and Cancel voyage apart', async () => {
    const root = await render();
    const button = more(root);
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[role="menu"]')).toBeNull();
    button.click();
    await flush();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const menu = root.querySelector('[role="menu"]')!;
    expect(
      [...menu.querySelectorAll('[role="menuitem"]')].map((i) => text(i))
    ).toEqual(['Budget', 'Models', 'Stop', 'Cancel voyage']);
    expect(menu.querySelectorAll('hr')).toHaveLength(1);
    expect(
      [...menu.querySelectorAll('.header__menu-danger')].map((i) => text(i))
    ).toEqual(['Stop', 'Cancel voyage']);
  });

  it('opens on ArrowDown with the focus on the first item, moves with the arrows and closes on Escape back to More', async () => {
    const root = await render();
    key(more(root), 'ArrowDown');
    await flush();
    const items = [
      ...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ];
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1]!, 'ArrowUp');
    key(items[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(items[items.length - 1]);
    key(items[items.length - 1]!, 'Escape');
    await flush();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more(root));
  });

  it('closes on a click outside it', async () => {
    const root = await render();
    more(root).click();
    await flush();
    document.body.click();
    await flush();
    expect(root.querySelector('[role="menu"]')).toBeNull();
  });
});
