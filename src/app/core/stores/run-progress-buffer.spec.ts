import { TestBed } from '@angular/core/testing';
import { ok } from '@core/api/api-error';
import { isEventPage } from '@core/api/guards';
import type { AhoyEvent, ListEventsQuery } from '@core/api/types';
import { EventBus } from '@core/realtime/event-bus';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { anEvent } from '@core/realtime/testing/events';
import { provideFakes } from '@core/realtime/testing/providers';
import listStoryEvents from '@testing/fixtures/listStoryEvents.json';
import {
  MAX_PROGRESS_EVENTS_PER_RUN,
  MAX_PROGRESS_RUNS,
  RunProgressBuffer,
  type ProgressEntry,
} from './run-progress-buffer';

let spendCount = 0;

/** A `tool` step of run r-02 at `line`. */
function tool(id: number, line: number, runId = 'r-02'): AhoyEvent {
  return anEvent(
    id,
    'run.progress',
    { runId, kind: 'tool', line, tool: 'view', summary: `file-${line}.md` },
    'PROJ-140'
  );
}

/** A `message` step of run r-02 at `line`, without its own time. */
function message(
  id: number,
  line: number,
  text = 'Reading the plan.'
): AhoyEvent {
  return anEvent(
    id,
    'run.progress',
    { runId: 'r-02', kind: 'message', line, text },
    'PROJ-140'
  );
}

/** A `spend` of run r-02 with `omitted` steps left out so far. */
function spend(
  id: number,
  omitted: number,
  nanoAiu = 1_000_000_000 * id
): AhoyEvent {
  return anEvent(
    id,
    'run.progress',
    {
      runId: 'r-02',
      kind: 'spend',
      line: id,
      offset: id * 100,
      nanoAiu,
      requests: id,
      steps: id,
      omitted,
      skipped: 0,
      events: ++spendCount,
    },
    'PROJ-140'
  );
}

/** Rows as short strings: `L3` for the step at line 3, `gap 38` for a gap. */
function rows(entries: readonly ProgressEntry[]): string[] {
  return entries.map((e) =>
    e.kind === 'gap' ? `gap ${e.count}` : `L${e.step.line}`
  );
}

describe('RunProgressBuffer', () => {
  let api: FakeApi;
  let clock: FakeClock;
  let net: FakeFetch;
  let buffer: RunProgressBuffer;

  beforeEach(() => {
    api = new FakeApi();
    clock = new FakeClock();
    net = new FakeFetch();
    spendCount = 0;
    TestBed.configureTestingModule({
      providers: provideFakes({ api, clock, net }),
    });
    buffer = TestBed.inject(RunProgressBuffer);
  });

  it('starts empty for a run it has no events of', () => {
    expect(buffer.run('r-99')()).toEqual({
      runId: 'r-99',
      entries: [],
      spend: null,
      omitted: 0,
      steps: 0,
    });
  });

  it('keeps steps in order with the latest spend', () => {
    buffer.ingestAll([message(1, 1), tool(2, 2), spend(3, 0, 350_000_000)]);
    const view = buffer.run('r-02')();
    expect(rows(view.entries)).toEqual(['L1', 'L2']);
    expect(view.spend?.nanoAiu).toBe(350_000_000);
    expect(view.spend?.requests).toBe(3);
    expect(view.steps).toBe(2);
    expect(view.omitted).toBe(0);
  });

  it('shows each line once, whichever event carried it', () => {
    buffer.ingestAll([tool(1, 1), tool(2, 2), tool(3, 2), message(4, 1)]);
    expect(rows(buffer.run('r-02')().entries)).toEqual(['L1', 'L2']);
    expect(buffer.run('r-02')().steps).toBe(2);
  });

  it('keeps an event once by id, and puts a late one in its place', () => {
    buffer.ingestAll([tool(5, 5), tool(5, 5), tool(3, 3), tool(4, 4)]);
    expect(rows(buffer.run('r-02')().entries)).toEqual(['L3', 'L4', 'L5']);
  });

  it('puts a gap of the difference before each batch in which omitted rose (three batches)', () => {
    buffer.ingestAll([
      tool(1, 1),
      tool(2, 2),
      spend(3, 0),
      tool(4, 41),
      tool(5, 42),
      spend(6, 38),
      tool(7, 50),
      spend(8, 45),
    ]);
    const view = buffer.run('r-02')();
    expect(rows(view.entries)).toEqual([
      'L1',
      'L2',
      'gap 38',
      'L41',
      'L42',
      'gap 7',
      'L50',
    ]);
    expect(view.omitted).toBe(45);
  });

  it('shows no gap when nothing was left out', () => {
    buffer.ingestAll([tool(1, 1), spend(2, 0), tool(3, 3), spend(4, 0)]);
    expect(
      buffer
        .run('r-02')()
        .entries.some((e) => e.kind === 'gap')
    ).toBe(false);
  });

  it('shows a gap at the end for a batch that was all left out (past the 200-step limit)', () => {
    buffer.ingestAll([tool(1, 1), spend(2, 0), spend(3, 12)]);
    expect(rows(buffer.run('r-02')().entries)).toEqual(['L1', 'gap 12']);
  });

  it('shows steps that have no spend yet, and places their gap once it arrives', () => {
    buffer.ingestAll([tool(1, 1), spend(2, 0), tool(3, 30)]);
    expect(rows(buffer.run('r-02')().entries)).toEqual(['L1', 'L30']);
    buffer.ingest(spend(4, 20));
    expect(rows(buffer.run('r-02')().entries)).toEqual(['L1', 'gap 20', 'L30']);
  });

  it("uses the step's own time, or the event's when the worker gave none", () => {
    const timed = anEvent(1, 'run.progress', {
      runId: 'r-02',
      kind: 'tool',
      line: 1,
      at: '2026-10-06T09:11:09.000Z',
      tool: 'view',
    });
    const untimed = message(2, 2);
    buffer.ingestAll([timed, untimed]);
    const [first, second] = buffer.run('r-02')().entries;
    expect(first?.kind === 'step' && first.at).toBe('2026-10-06T09:11:09.000Z');
    expect(second?.kind === 'step' && second.at).toBe(untimed.createdAt);
  });

  it('ignores other events and progress it cannot read', () => {
    buffer.ingestAll([
      anEvent(1, 'run.finished', { runId: 'r-02' }),
      anEvent(2, 'run.progress', { runId: 'r-02', kind: 'thought', line: 2 }),
      anEvent(3, 'run.progress', {
        runId: 'r-02',
        kind: 'tool',
        line: 0,
        tool: 'view',
      }),
      anEvent(4, 'run.progress', {
        runId: 'r-02',
        kind: 'spend',
        nanoAiu: 1.5,
      }),
    ]);
    expect(buffer.run('r-02')().entries).toEqual([]);
  });

  it('keeps each run apart', () => {
    buffer.ingestAll([
      tool(1, 1, 'r-01'),
      tool(2, 1, 'r-02'),
      tool(3, 2, 'r-02'),
    ]);
    expect(buffer.run('r-01')().steps).toBe(1);
    expect(buffer.run('r-02')().steps).toBe(2);
  });

  it('holds at most 1000 events per run, and says how many earlier steps it let go', () => {
    const events = Array.from(
      { length: MAX_PROGRESS_EVENTS_PER_RUN + 5 },
      (_, i) => tool(i + 1, i + 1)
    );
    buffer.ingestAll(events);
    const view = buffer.run('r-02')();
    expect(view.steps).toBe(MAX_PROGRESS_EVENTS_PER_RUN);
    expect(rows(view.entries).slice(0, 2)).toEqual(['gap 5', 'L6']);
  });

  it('counts later gaps from the last spend it let go', () => {
    const events: AhoyEvent[] = [spend(1, 10)];
    for (let i = 2; i <= MAX_PROGRESS_EVENTS_PER_RUN + 1; i++)
      events.push(tool(i, i));
    events.push(spend(MAX_PROGRESS_EVENTS_PER_RUN + 2, 13));
    buffer.ingestAll(events);
    const entries = rows(buffer.run('r-02')().entries);
    expect(entries[0]).toBe('gap 1');
    expect(entries).toContain('gap 3');
    expect(entries).not.toContain('gap 13');
  });

  it('holds at most 50 runs, letting go of the one touched least recently', () => {
    for (let i = 0; i <= MAX_PROGRESS_RUNS; i++)
      buffer.ingest(tool(i + 1, 1, `r-${i}`));
    expect(buffer.run('r-0')().steps).toBe(0);
    expect(buffer.run(`r-${MAX_PROGRESS_RUNS}`)().steps).toBe(1);
  });

  it("follows a story's live events while held, and stops when let go", async () => {
    const body = net.stream();
    const release = buffer.follow('PROJ-140');
    await settle();
    body.sendEvent(tool(1, 1));
    body.sendEvent(spend(2, 0));
    await settle();
    expect(buffer.run('r-02')().steps).toBe(1);
    release();
    expect(TestBed.inject(EventBus).subscribers()).toBe(0);
  });

  it('shares one subscription between holders of the same story', async () => {
    net.stream();
    const a = buffer.follow('PROJ-140');
    const b = buffer.follow('PROJ-140');
    await settle();
    expect(TestBed.inject(EventBus).subscribers()).toBe(1);
    a();
    expect(TestBed.inject(EventBus).subscribers()).toBe(1);
    b();
    expect(TestBed.inject(EventBus).subscribers()).toBe(0);
  });

  it("reads a story's history from the start for runs that ended", async () => {
    if (!isEventPage(listStoryEvents)) throw new Error('fixture');
    const history = listStoryEvents.items;
    api.on('listStoryEvents', (_key: string, query: ListEventsQuery = {}) => {
      const items = query.after === undefined ? history : [];
      return Promise.resolve(
        ok({ items, lastEventId: items.at(-1)?.id ?? query.after ?? null })
      );
    });
    const result = await buffer.hydrate('PROJ-123');
    expect(result).toEqual({ ok: true, value: undefined });
    expect(api.callsOf('listStoryEvents')[0]?.args).toEqual([
      'PROJ-123',
      { limit: 500 },
    ]);
    const view = buffer.run('r-04')();
    expect(view.steps).toBe(2);
    expect(view.spend?.nanoAiu).toBe(350_000_000);
  });

  it('shares a history read already in flight, and passes on its error', async () => {
    let resolve: (() => void) | null = null;
    api.on(
      'listStoryEvents',
      () =>
        new Promise((r) => {
          resolve = () => r({ ok: false, error: { kind: 'network' } });
        })
    );
    const a = buffer.hydrate('PROJ-123');
    const b = buffer.hydrate('PROJ-123');
    expect(api.callsOf('listStoryEvents')).toHaveLength(1);
    resolve!();
    expect(await a).toEqual({ ok: false, error: { kind: 'network' } });
    expect(await b).toEqual({ ok: false, error: { kind: 'network' } });
    void buffer.hydrate('PROJ-123');
    expect(api.callsOf('listStoryEvents')).toHaveLength(2);
  });

  it('stops following when the app is destroyed', async () => {
    net.stream();
    buffer.follow('PROJ-140');
    await settle();
    const bus = TestBed.inject(EventBus);
    TestBed.resetTestingModule();
    expect(bus.subscribers()).toBe(0);
  });
});
