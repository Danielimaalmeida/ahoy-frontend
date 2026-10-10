import { TestBed } from '@angular/core/testing';
import { fail, ok } from '@core/api/api-error';
import type { AhoyEvent, ListEventsQuery } from '@core/api/types';
import { EventBus } from '@core/realtime/event-bus';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch, type SseBody } from '@core/realtime/testing/fake-fetch';
import { anEvent } from '@core/realtime/testing/events';
import { provideFakes } from '@core/realtime/testing/providers';
import { RunProgressBuffer } from './run-progress-buffer';
import { MAX_FEED_EVENTS, StoryEventsFeed } from './story-events-feed';

describe('StoryEventsFeed', () => {
  let api: FakeApi;
  let clock: FakeClock;
  let net: FakeFetch;
  let body: SseBody;
  let history: AhoyEvent[];

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock();
    net = new FakeFetch();
    body = net.stream();
    history = [];
    api.on('listStoryEvents', (_key: string, query: ListEventsQuery = {}) => {
      const after = query.after !== undefined ? Number(query.after) : 0;
      const items = history
        .filter((e) => Number(e.id) > after)
        .slice(0, query.limit ?? 100);
      return Promise.resolve(
        ok({ items, lastEventId: items.at(-1)?.id ?? query.after ?? null })
      );
    });
    TestBed.configureTestingModule({
      providers: provideFakes({ api, clock, net }),
    });
  });

  const progress = (id: number) =>
    anEvent(id, 'run.progress', {
      runId: 'r-04',
      kind: 'tool',
      line: id,
      tool: 'view',
    });

  it('reads the whole history from the start, 500 at a time', async () => {
    history = Array.from({ length: 1_100 }, (_, i) =>
      anEvent(i + 1, 'gate.evaluated')
    );
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    expect(feed.status()).toBe('loading');
    await settle();
    expect(api.callsOf('listStoryEvents').map((c) => c.args[1])).toEqual([
      { limit: 500 },
      { after: '500', limit: 500 },
      { after: '1000', limit: 500 },
    ]);
    expect(feed.status()).toBe('ready');
    expect(feed.events()).toHaveLength(1_100);
    feed.release();
  });

  it('gives the events newest first without run.progress, which goes to the run buffer', async () => {
    history = [
      anEvent(1, 'run.queued'),
      progress(2),
      progress(3),
      anEvent(4, 'run.finished'),
    ];
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    expect(feed.events().map((e) => e.id)).toEqual(['1', '4']);
    expect(feed.newestFirst().map((e) => e.id)).toEqual(['4', '1']);
    expect(TestBed.inject(RunProgressBuffer).run('r-04')().steps).toBe(2);
    feed.release();
  });

  it('adds what the stream sends, once each and in order', async () => {
    history = [anEvent(1, 'run.queued'), anEvent(2, 'run.dispatched')];
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    body.sendEvent(anEvent(2, 'run.dispatched'));
    body.sendEvent(anEvent(3, 'run.finished'));
    body.sendEvent(anEvent(9, 'story.started', {}, 'PROJ-131'));
    body.sendEvent(progress(4));
    await settle();
    expect(feed.events().map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(TestBed.inject(RunProgressBuffer).run('r-04')().steps).toBe(1);
    feed.release();
  });

  it('merges stream events that arrive while the history is still being read', async () => {
    let answer: (() => void) | null = null;
    api.on(
      'listStoryEvents',
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve(
              ok({
                items: [anEvent(1, 'run.queued'), anEvent(2, 'run.dispatched')],
                lastEventId: '2',
              })
            );
        })
    );
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    body.sendEvent(anEvent(3, 'run.finished'));
    await settle();
    expect(feed.events().map((e) => e.id)).toEqual(['3']);
    answer!();
    await settle();
    expect(feed.events().map((e) => e.id)).toEqual(['1', '2', '3']);
    feed.release();
  });

  it('reads only what is new on refresh', async () => {
    history = [anEvent(1, 'run.queued')];
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    history.push(anEvent(2, 'run.dispatched'));
    await feed.refresh();
    expect(api.callsOf('listStoryEvents').at(-1)?.args[1]).toEqual({
      after: '1',
      limit: 500,
    });
    expect(feed.events().map((e) => e.id)).toEqual(['1', '2']);
    feed.release();
  });

  it('keeps what it read when a read fails, and says why', async () => {
    history = [anEvent(1, 'run.queued')];
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    api.on('listStoryEvents', () => Promise.resolve(fail({ kind: 'network' })));
    await feed.refresh();
    expect(feed.status()).toBe('error');
    expect(feed.error()).toEqual({ kind: 'network' });
    expect(feed.events()).toHaveLength(1);
    feed.release();
  });

  it('holds at most 2000 events, letting the oldest go', async () => {
    history = Array.from({ length: MAX_FEED_EVENTS + 10 }, (_, i) =>
      anEvent(i + 1, 'gate.evaluated')
    );
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    expect(feed.events()).toHaveLength(MAX_FEED_EVENTS);
    expect(feed.events()[0]?.id).toBe('11');
    expect(feed.truncated()).toBe(true);
    feed.release();
  });

  it('shares one feed between holders, and stops it with the last release', async () => {
    history = [anEvent(1, 'run.queued')];
    const feeds = TestBed.inject(StoryEventsFeed);
    const a = feeds.for('PROJ-123');
    const b = feeds.for('PROJ-123');
    await settle();
    expect(api.callsOf('listStoryEvents')).toHaveLength(1);
    expect(b.events()).toBe(a.events());
    a.release();
    expect(TestBed.inject(EventBus).subscribers()).toBe(1);
    b.release();
    expect(TestBed.inject(EventBus).subscribers()).toBe(0);
    body.sendEvent(anEvent(2, 'run.dispatched'));
    await settle();
    expect(a.events()).toHaveLength(1);
  });

  it('drops a history read that ends after the feed was released', async () => {
    let answer: (() => void) | null = null;
    api.on(
      'listStoryEvents',
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve(
              ok({ items: [anEvent(1, 'run.queued')], lastEventId: '1' })
            );
        })
    );
    const feed = TestBed.inject(StoryEventsFeed).for('PROJ-123');
    await settle();
    feed.release();
    answer!();
    await settle();
    expect(feed.events()).toEqual([]);
    expect(api.callsOf('listStoryEvents')).toHaveLength(1);
  });
});
