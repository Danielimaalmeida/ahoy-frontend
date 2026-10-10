import {
  DestroyRef,
  EnvironmentInjector,
  createEnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fail, ok } from '@core/api/api-error';
import { EventBus } from '@core/realtime/event-bus';
import { KNOWN_EVENT_TYPES } from '@core/realtime/event-types';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch, type SseBody } from '@core/realtime/testing/fake-fetch';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { provideFakes } from '@core/realtime/testing/providers';
import { StoriesStore } from './stories-store';
import {
  RESOURCE_REFRESH_DEBOUNCE_MS,
  STALE_AFTER,
  STORY_RESOURCES,
  StoryStore,
} from './story-store';

describe('StoryStore', () => {
  let api: FakeApi;
  let clock: FakeClock;
  let net: FakeFetch;
  let body: SseBody;
  let version: number;

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock();
    net = new FakeFetch();
    body = net.stream();
    version = 1;
    api
      .on('getStory', (key) => Promise.resolve(ok(aStory(key, { version }))))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version, state: {} }))
      )
      .on('listStoryRuns', () => Promise.resolve(ok([])))
      .on('listQuestions', () => Promise.resolve(ok([])))
      .on('listGateRecords', () => Promise.resolve(ok([])))
      .on('getStoryModels', (key) =>
        Promise.resolve(ok({ storyKey: key, version, slots: [] }))
      )
      .on('listArtifacts', () =>
        Promise.resolve(ok({ revision: 1, items: [] }))
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: [], lastEventId: null }))
      );
    TestBed.configureTestingModule({
      providers: provideFakes({ api, clock, net }),
    });
  });

  /** How many times each read operation was called. */
  function reads(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const call of api.calls) counts[call.op] = (counts[call.op] ?? 0) + 1;
    return counts;
  }

  it('says which resources every known event type touches', () => {
    expect(Object.keys(STALE_AFTER).sort()).toEqual(
      [...KNOWN_EVENT_TYPES].sort()
    );
    for (const names of Object.values(STALE_AFTER))
      for (const name of names) expect(STORY_RESOURCES).toContain(name);
    expect(STALE_AFTER['run.progress']).toEqual([]);
  });

  it('reads only the resources a screen observes', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: ['story', 'runs'],
    });
    await settle();
    expect(reads()).toEqual({ getStory: 1, listStoryRuns: 1 });
    expect(voyage.story.status()).toBe('ready');
    expect(voyage.story.value()?.key).toBe('PROJ-123');
    expect(voyage.runs.status()).toBe('ready');
    expect(voyage.questions.status()).toBe('idle');
    expect(voyage.models.status()).toBe('idle');
    voyage.release();
  });

  it('reads each of the seven resources when observed', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: STORY_RESOURCES,
    });
    await settle();
    expect(reads()).toEqual({
      getStory: 1,
      getStoryState: 1,
      listStoryRuns: 1,
      listQuestions: 1,
      listGateRecords: 1,
      getStoryModels: 1,
      listArtifacts: 1,
    });
    for (const name of STORY_RESOURCES)
      expect(voyage[name].status(), name).toBe('ready');
    voyage.release();
  });

  it('reads again, once, what the events of 300 ms touch, and only what is observed', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: ['story', 'runs', 'questions'],
    });
    await settle();
    version = 2;
    body.sendEvent(anEvent(1, 'run.queued'));
    body.sendEvent(anEvent(2, 'run.dispatched'));
    await clock.advance(200);
    body.sendEvent(anEvent(3, 'run.finished'));
    await clock.advance(RESOURCE_REFRESH_DEBOUNCE_MS - 201);
    expect(reads()).toEqual({
      getStory: 1,
      listStoryRuns: 1,
      listQuestions: 1,
    });
    await clock.advance(1);
    expect(reads()).toEqual({
      getStory: 2,
      listStoryRuns: 2,
      listQuestions: 1,
    });
    expect(voyage.story.value()?.version).toBe(2);
    voyage.release();
  });

  it('ignores run.progress, unknown event types and other stories', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: STORY_RESOURCES,
    });
    await settle();
    const before = api.calls.length;
    body.sendEvent(
      anEvent(1, 'run.progress', {
        runId: 'r-04',
        kind: 'tool',
        line: 1,
        tool: 'view',
      })
    );
    body.sendEvent(anEvent(2, 'story.teleported'));
    body.sendEvent(anEvent(3, 'story.halted', {}, 'PROJ-131'));
    await clock.advance(10 * RESOURCE_REFRESH_DEBOUNCE_MS);
    expect(api.calls).toHaveLength(before);
    voyage.release();
  });

  it('marks what nobody observes as stale, and reads it when someone does', async () => {
    const store = TestBed.inject(StoryStore);
    const questionsTab = store.for('PROJ-123', { watch: ['questions'] });
    const shell = store.for('PROJ-123', { watch: ['story'] });
    await settle();
    questionsTab.release();
    body.sendEvent(anEvent(1, 'question.asked'));
    await clock.advance(RESOURCE_REFRESH_DEBOUNCE_MS);
    expect(reads()).toEqual({ getStory: 2, listQuestions: 1 });
    const again = store.for('PROJ-123', { watch: ['questions'] });
    await settle();
    expect(reads()).toEqual({ getStory: 2, listQuestions: 2 });
    again.release();
    // Not touched since: observing it again reads nothing.
    const once = store.for('PROJ-123', { watch: ['questions'] });
    await settle();
    expect(reads()).toEqual({ getStory: 2, listQuestions: 2 });
    once.release();
    shell.release();
  });

  it('observes more resources later with watch', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123');
    await settle();
    expect(api.calls).toHaveLength(0);
    voyage.watch('gates', 'artifacts');
    await settle();
    expect(reads()).toEqual({ listGateRecords: 1, listArtifacts: 1 });
    voyage.release();
  });

  it('shares one voyage between holders', async () => {
    const store = TestBed.inject(StoryStore);
    const a = store.for('PROJ-123', { watch: ['story'] });
    const b = store.for('PROJ-123', { watch: ['story'] });
    await settle();
    expect(b.story).toBe(a.story);
    expect(reads()).toEqual({ getStory: 1 });
    expect(TestBed.inject(EventBus).subscribers()).toBe(1);
    a.release();
    b.release();
  });

  it('keeps the story list in step with what it reads', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: ['story'],
    });
    await settle();
    expect(TestBed.inject(StoriesStore).find('PROJ-123')?.version).toBe(1);
    voyage.release();
  });

  it("shows a command's answer at once, in the voyage and in the list, unless it holds a newer version", async () => {
    const store = TestBed.inject(StoryStore);
    const voyage = store.for('PROJ-123', { watch: ['story'] });
    await settle();
    store.accept(aStory('PROJ-123', { version: 7, status: 'halted' }));
    expect(voyage.story.value()?.status).toBe('halted');
    expect(TestBed.inject(StoriesStore).find('PROJ-123')?.status).toBe(
      'halted'
    );
    store.accept(aStory('PROJ-123', { version: 6, status: 'running' }));
    expect(voyage.story.value()?.version).toBe(7);
    expect(TestBed.inject(StoriesStore).find('PROJ-123')?.version).toBe(7);
    voyage.release();
  });

  it("does not let a slow read undo a command's answer", async () => {
    let answer: (() => void) | null = null;
    api.on(
      'getStory',
      (key) =>
        new Promise((resolve) => {
          answer = () => resolve(ok(aStory(key, { version: 3 })));
        })
    );
    const store = TestBed.inject(StoryStore);
    const voyage = store.for('PROJ-123', { watch: ['story'] });
    await settle();
    store.accept(
      aStory('PROJ-123', { version: 4, status: 'awaiting_decision' })
    );
    answer!();
    await settle();
    expect(voyage.story.value()?.version).toBe(4);
    voyage.release();
  });

  it('shows the model plan a command answered with', async () => {
    const store = TestBed.inject(StoryStore);
    const voyage = store.for('PROJ-123', { watch: ['models'] });
    await settle();
    store.acceptModels({ storyKey: 'PROJ-123', version: 5, slots: [] });
    expect(voyage.models.value()?.version).toBe(5);
    voyage.release();
  });

  it("keeps a resource's value and reports the error when a read fails", async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: ['runs'],
    });
    await settle();
    api.on('listStoryRuns', () => Promise.resolve(fail({ kind: 'network' })));
    await voyage.runs.refresh();
    expect(voyage.runs.status()).toBe('error');
    expect(voyage.runs.value()).toEqual([]);
    voyage.release();
  });

  it('holds the event history with the handle', async () => {
    const voyage = TestBed.inject(StoryStore).for('PROJ-123');
    const events = voyage.events();
    expect(voyage.events()).toBe(events);
    await settle();
    expect(events.status()).toBe('ready');
    expect(reads()).toEqual({ listStoryEvents: 1 });
    voyage.release();
    expect(TestBed.inject(EventBus).subscribers()).toBe(0);
    expect(() => voyage.events()).toThrow(/released/);
  });

  it('leaves nothing running after the last release: no subscription, no timer, no late answer', async () => {
    let answer: (() => void) | null = null;
    const voyage = TestBed.inject(StoryStore).for('PROJ-123', {
      watch: ['story', 'runs'],
    });
    await settle();
    api.on(
      'listStoryRuns',
      () =>
        new Promise((resolve) => {
          answer = () => resolve(ok([]));
        })
    );
    body.sendEvent(anEvent(1, 'run.queued'));
    await clock.advance(RESOURCE_REFRESH_DEBOUNCE_MS);
    body.sendEvent(anEvent(2, 'run.finished'));
    await settle();
    expect(clock.delays).toContain(RESOURCE_REFRESH_DEBOUNCE_MS);
    voyage.release();
    expect(TestBed.inject(EventBus).subscribers()).toBe(0);
    expect(clock.pending).toBe(0);
    const calls = api.calls.length;
    answer!();
    await clock.advance(60_000);
    expect(api.calls).toHaveLength(calls);
  });

  it('lets go when the DestroyRef it was given is destroyed', async () => {
    const screen = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector)
    );
    TestBed.inject(StoryStore).for('PROJ-123', {
      watch: ['story'],
      destroyRef: screen.get(DestroyRef),
    });
    await settle();
    expect(TestBed.inject(EventBus).subscribers()).toBe(1);
    screen.destroy();
    expect(TestBed.inject(EventBus).subscribers()).toBe(0);
  });

  it('stops every open voyage when the app is destroyed', async () => {
    TestBed.inject(StoryStore).for('PROJ-123', { watch: ['story'] });
    await settle();
    const bus = TestBed.inject(EventBus);
    const request = net.last!;
    TestBed.resetTestingModule();
    expect(bus.subscribers()).toBe(0);
    expect(request.signal?.aborted).toBe(true);
    expect(clock.pending).toBe(0);
  });
});
