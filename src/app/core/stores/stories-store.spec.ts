import {
  DestroyRef,
  EnvironmentInjector,
  createEnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fail, ok } from '@core/api/api-error';
import { isStoryPage } from '@core/api/guards';
import type { ListStoriesQuery, Story } from '@core/api/types';
import { EventBus } from '@core/realtime/event-bus';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch, type SseBody } from '@core/realtime/testing/fake-fetch';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { provideFakes } from '@core/realtime/testing/providers';
import listStories from '@testing/fixtures/listStories.json';
import problems from '@testing/fixtures/problems.json';
import {
  STORY_PAGE_LIMIT,
  STORY_REFRESH_DEBOUNCE_MS,
  StoriesStore,
} from './stories-store';

/** Answers `listStories` from `stories`, `size` at a time, with numeric cursors. */
function pagesOf(stories: readonly Story[], size: number) {
  return (query: ListStoriesQuery = {}) => {
    const from = query.cursor !== undefined ? Number(query.cursor) : 0;
    const items = stories.slice(from, from + size);
    const next = from + size < stories.length ? String(from + size) : null;
    return Promise.resolve(ok({ items, nextCursor: next }));
  };
}

describe('StoriesStore', () => {
  let clock: FakeClock;
  let net: FakeFetch;
  let api: FakeApi;

  beforeEach(() => {
    clock = new FakeClock();
    net = new FakeFetch();
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: provideFakes({ api, clock, net }),
    });
  });

  /** Seven stories in every status, with their updatedAt in a known order. */
  const SEVEN: readonly Story[] = [
    aStory('PROJ-101', {
      status: 'running',
      updatedAt: '2026-10-06T09:50:00.000Z',
    }),
    aStory('PROJ-102', {
      status: 'awaiting_decision',
      updatedAt: '2026-10-06T09:40:00.000Z',
    }),
    aStory('PROJ-103', {
      status: 'halted',
      updatedAt: '2026-10-06T08:00:00.000Z',
    }),
    aStory('PROJ-104', {
      status: 'awaiting_input',
      updatedAt: '2026-10-06T09:00:00.000Z',
    }),
    aStory('PROJ-105', {
      status: 'ready',
      updatedAt: '2026-10-06T09:55:00.000Z',
    }),
    aStory('PROJ-106', {
      status: 'terminal',
      phase: 'done',
      updatedAt: '2026-10-05T12:00:00.000Z',
    }),
    aStory('PROJ-107', {
      status: 'terminal',
      phase: 'blocked',
      updatedAt: '2026-10-05T13:00:00.000Z',
    }),
  ];

  it('reads every page with limit=500 until nextCursor is null', async () => {
    const many = Array.from({ length: 1_203 }, (_, i) =>
      aStory(`PROJ-${1000 + i}`)
    );
    api.on('listStories', pagesOf(many, STORY_PAGE_LIMIT));
    const store = TestBed.inject(StoriesStore);
    const result = await store.loadAll();
    expect(result.ok).toBe(true);
    expect(api.callsOf('listStories').map((c) => c.args[0])).toEqual([
      { limit: 500 },
      { limit: 500, cursor: '500' },
      { limit: 500, cursor: '1000' },
    ]);
    expect(store.stories()).toHaveLength(1_203);
    expect(store.status()).toBe('ready');
  });

  it('loads the fixture list', async () => {
    if (!isStoryPage(listStories)) throw new Error('fixture');
    const page = listStories;
    api.on('listStories', () => Promise.resolve(ok(page)));
    const store = TestBed.inject(StoriesStore);
    await store.loadAll();
    expect(store.find('PROJ-123')?.status).toBe('awaiting_decision');
    expect(store.stories().map((s) => s.key)).toEqual(
      [...page.items]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((s) => s.key)
    );
  });

  it('counts the stories in each status, with In port as terminal', async () => {
    api.on('listStories', pagesOf(SEVEN, 3));
    const store = TestBed.inject(StoriesStore);
    expect(store.counts()).toEqual({
      ready: 0,
      running: 0,
      awaiting_input: 0,
      awaiting_decision: 0,
      halted: 0,
      terminal: 0,
    });
    await store.loadAll();
    expect(store.counts()).toEqual({
      ready: 1,
      running: 1,
      awaiting_input: 1,
      awaiting_decision: 1,
      halted: 1,
      terminal: 2,
    });
    expect(store.inPort()).toBe(2);
  });

  it('lists what needs a person, longest waiting first, and what is at sea', async () => {
    api.on('listStories', pagesOf(SEVEN, 500));
    const store = TestBed.inject(StoriesStore);
    await store.loadAll();
    expect(store.needsYou().map((s) => s.key)).toEqual([
      'PROJ-103',
      'PROJ-104',
      'PROJ-102',
    ]);
    expect(store.atSea().map((s) => s.key)).toEqual(['PROJ-105', 'PROJ-101']);
    expect(store.stories().map((s) => s.key)).toEqual([
      'PROJ-105',
      'PROJ-101',
      'PROJ-102',
      'PROJ-104',
      'PROJ-103',
      'PROJ-107',
      'PROJ-106',
    ]);
  });

  it('breaks ties in waiting time by key', async () => {
    const at = '2026-10-06T09:00:00.000Z';
    api.on(
      'listStories',
      pagesOf(
        [
          aStory('PROJ-9', { status: 'halted', updatedAt: at }),
          aStory('PROJ-1', { status: 'awaiting_input', updatedAt: at }),
        ],
        500
      )
    );
    const store = TestBed.inject(StoriesStore);
    await store.loadAll();
    expect(store.needsYou().map((s) => s.key)).toEqual(['PROJ-1', 'PROJ-9']);
  });

  it('keeps the list it has when a load fails, and says why', async () => {
    api.on('listStories', pagesOf(SEVEN, 500));
    const store = TestBed.inject(StoriesStore);
    await store.loadAll();
    api.on('listStories', () => Promise.resolve(fail({ kind: 'network' })));
    const result = await store.loadAll();
    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
    expect(store.status()).toBe('error');
    expect(store.error()).toEqual({ kind: 'network' });
    expect(store.stories()).toHaveLength(7);
  });

  it('fails the whole load when a later page fails, without a half list', async () => {
    let call = 0;
    api.on('listStories', (query) =>
      call++ === 0
        ? pagesOf(SEVEN, 3)(query)
        : Promise.resolve(fail({ kind: 'network' }))
    );
    const store = TestBed.inject(StoriesStore);
    await store.loadAll();
    expect(store.stories()).toEqual([]);
    expect(store.status()).toBe('error');
  });

  it('shares a load asked for while one is in flight', async () => {
    api.on('listStories', pagesOf(SEVEN, 500));
    const store = TestBed.inject(StoriesStore);
    await Promise.all([store.loadAll(), store.loadAll()]);
    expect(api.callsOf('listStories')).toHaveLength(1);
  });

  it("keeps a story's newer version from a command answer over an older one in a load", async () => {
    let answer: (() => void) | null = null;
    api.on(
      'listStories',
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve(
              ok({
                items: [aStory('PROJ-101', { version: 3 })],
                nextCursor: null,
              })
            );
        })
    );
    const store = TestBed.inject(StoriesStore);
    const load = store.loadAll();
    store.upsert(aStory('PROJ-101', { version: 4, status: 'halted' }));
    store.upsert(aStory('PROJ-200', { version: 1 }));
    answer!();
    await load;
    expect(store.find('PROJ-101')?.version).toBe(4);
    expect(store.find('PROJ-200')).toBeDefined();
  });

  it('upserts only a version at least as new as the one it has', () => {
    const store = TestBed.inject(StoriesStore);
    store.upsert(aStory('PROJ-101', { version: 5, title: 'five' }));
    store.upsert(aStory('PROJ-101', { version: 4, title: 'four' }));
    expect(store.find('PROJ-101')?.title).toBe('five');
    store.upsert(aStory('PROJ-101', { version: 5, title: 'five again' }));
    expect(store.find('PROJ-101')?.title).toBe('five again');
  });

  describe('kept up to date by events', () => {
    let body: SseBody;

    beforeEach(() => {
      body = net.stream();
      api.on('listStories', pagesOf(SEVEN, 500));
    });

    async function using(): Promise<{
      store: StoriesStore;
      release: () => void;
    }> {
      const store = TestBed.inject(StoriesStore);
      const release = store.use();
      await settle();
      return { store, release };
    }

    it('loads the list when first used, and holds the stream open while used', async () => {
      const { store, release } = await using();
      expect(store.status()).toBe('ready');
      expect(TestBed.inject(EventBus).subscribers()).toBe(1);
      release();
      expect(TestBed.inject(EventBus).subscribers()).toBe(0);
    });

    it('turns several events of a story within 300 ms into one getStory', async () => {
      let version = 1;
      api.on('getStory', (key) =>
        Promise.resolve(
          ok(aStory(key, { version: ++version, status: 'halted' }))
        )
      );
      const { store, release } = await using();
      body.sendEvent(anEvent(1, 'run.finished', {}, 'PROJ-101'));
      body.sendEvent(anEvent(2, 'gate.evaluated', {}, 'PROJ-101'));
      await clock.advance(100);
      body.sendEvent(anEvent(3, 'story.halted', {}, 'PROJ-101'));
      await clock.advance(STORY_REFRESH_DEBOUNCE_MS - 101);
      expect(api.callsOf('getStory')).toHaveLength(0);
      await clock.advance(1);
      expect(api.callsOf('getStory').map((c) => c.args[0])).toEqual([
        'PROJ-101',
      ]);
      expect(store.find('PROJ-101')?.status).toBe('halted');
      expect(store.counts().halted).toBe(2);
      release();
    });

    it('refreshes each story that had events, once each', async () => {
      api.on('getStory', (key) =>
        Promise.resolve(ok(aStory(key, { version: 2 })))
      );
      const { release } = await using();
      body.sendEvent(anEvent(1, 'run.queued', {}, 'PROJ-101'));
      body.sendEvent(anEvent(2, 'question.asked', {}, 'PROJ-104'));
      body.sendEvent(anEvent(3, 'run.dispatched', {}, 'PROJ-101'));
      await clock.advance(STORY_REFRESH_DEBOUNCE_MS);
      expect(api.callsOf('getStory').map((c) => c.args[0])).toEqual([
        'PROJ-101',
        'PROJ-104',
      ]);
      release();
    });

    it('inserts a story that started', async () => {
      api.on('getStory', (key) =>
        Promise.resolve(ok(aStory(key, { status: 'ready' })))
      );
      const { store, release } = await using();
      body.sendEvent(anEvent(1, 'story.started', {}, 'PROJ-300'));
      await clock.advance(STORY_REFRESH_DEBOUNCE_MS);
      expect(store.find('PROJ-300')?.status).toBe('ready');
      expect(store.stories()).toHaveLength(8);
      release();
    });

    it('removes a story the API no longer has', async () => {
      const notFound = problems.find((p) => p.code === 'not_found')!;
      api.on('getStory', () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 404,
            code: notFound.code,
            title: notFound.title,
          })
        )
      );
      const { store, release } = await using();
      body.sendEvent(anEvent(1, 'story.halted', {}, 'PROJ-101'));
      await clock.advance(STORY_REFRESH_DEBOUNCE_MS);
      expect(store.find('PROJ-101')).toBeUndefined();
      release();
    });

    it('keeps a story as it was when its refresh fails for another reason', async () => {
      api.on('getStory', () => Promise.resolve(fail({ kind: 'network' })));
      const { store, release } = await using();
      body.sendEvent(anEvent(1, 'story.halted', {}, 'PROJ-101'));
      await clock.advance(STORY_REFRESH_DEBOUNCE_MS);
      expect(store.find('PROJ-101')?.status).toBe('running');
      release();
    });

    it('ignores run.progress and event types it does not know', async () => {
      const { release } = await using();
      body.sendEvent(anEvent(1, 'run.progress', { kind: 'spend' }, 'PROJ-101'));
      body.sendEvent(anEvent(2, 'story.teleported', {}, 'PROJ-101'));
      await clock.advance(10 * STORY_REFRESH_DEBOUNCE_MS);
      expect(api.callsOf('getStory')).toHaveLength(0);
      release();
    });

    it('stops following events and cancels pending refreshes when the last user lets go', async () => {
      const { release } = await using();
      body.sendEvent(anEvent(1, 'story.halted', {}, 'PROJ-101'));
      await settle();
      release();
      expect(clock.pending).toBe(0);
      await clock.advance(10_000);
      expect(api.callsOf('getStory')).toHaveLength(0);
      expect(net.last!.signal?.aborted).toBe(true);
    });

    it('reads the list again when used again after a pause, since events were missed', async () => {
      const store = TestBed.inject(StoriesStore);
      const first = store.use();
      await settle();
      first();
      net.stream();
      const second = store.use();
      await settle();
      expect(api.callsOf('listStories')).toHaveLength(2);
      second();
    });

    it('lets go when the DestroyRef it was given is destroyed', async () => {
      const store = TestBed.inject(StoriesStore);
      const screen = createEnvironmentInjector(
        [],
        TestBed.inject(EnvironmentInjector)
      );
      store.use(screen.get(DestroyRef));
      await settle();
      expect(TestBed.inject(EventBus).subscribers()).toBe(1);
      screen.destroy();
      expect(TestBed.inject(EventBus).subscribers()).toBe(0);
    });

    it('reads the list again every 10 s while the stream is degraded', async () => {
      net.answer(
        new TypeError('down'),
        new TypeError('down'),
        new TypeError('down')
      );
      body.fail();
      const { release } = await using();
      await clock.advance(1_000);
      await clock.advance(2_000);
      expect(TestBed.inject(EventBus).degraded()).toBe(true);
      const before = api.callsOf('listStories').length;
      await clock.advance(10_000);
      expect(api.callsOf('listStories')).toHaveLength(before + 1);
      release();
    });
  });
});
