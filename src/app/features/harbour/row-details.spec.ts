import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type {
  AhoyEvent,
  Diagnosis,
  Question,
  Run,
  Story,
} from '@core/api/types';
import { EventBus } from '@core/realtime/event-bus';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch, type SseBody } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { RowDetails } from './row-details';

function question(id: string, answered: boolean): Question {
  return {
    id,
    round: 1,
    runId: 'proj-131-planning-001-aaaa',
    text: `Question ${id}?`,
    recommendation: null,
    answer: answered ? 'An answer.' : null,
    answeredBy: answered ? 'sam@example.com' : null,
    answeredAt: answered ? '2026-10-06T09:30:00.000Z' : null,
    consumed: false,
    supersededAt: null,
  };
}

const RUN: Run = {
  id: 'proj-140-planning-001-5c54',
  storyKey: 'PROJ-140',
  phase: 'planning',
  agent: 'cartographer',
  model: 'claude-sonnet-5',
  reasoningEffort: 'high',
  status: 'running',
  runtime: 'fake',
  controlSha: 'a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302',
  budgetNanoAiu: 8_000_000_000,
  usage: { requests: 9, nanoAiu: 600_000_000, inputTokens: 0, outputTokens: 0 },
  replayOf: null,
  exitReason: null,
  gate: null,
  startedBy: 'jordan@example.com',
  createdAt: '2026-10-06T10:00:00.000Z',
  startedAt: '2026-10-06T10:00:00.000Z',
  endedAt: null,
};

const HALTED_EVENTS: readonly AhoyEvent[] = [
  anEvent(
    1,
    'story.halted',
    { reason: 'run_failed', detail: 'Refused.' },
    'PROJ-118'
  ),
];

/** A `RowDetails` over fakes, in an injector of its own so that the spec can destroy it as a page would. */
function rig() {
  const clock = new FakeClock();
  const net = new FakeFetch();
  const stream: SseBody = net.stream();
  const api = new FakeApi();
  api.on('listQuestions', () =>
    Promise.resolve(ok([question('Q1', true), question('Q2', false)]))
  );
  api.on('getStoryState', (key) =>
    Promise.resolve(
      ok({
        key,
        version: 1,
        state: { revisions: { plan_accepted: 1 }, revision_ceiling: 4 },
      })
    )
  );
  api.on('listStoryEvents', (key) =>
    Promise.resolve(
      ok({ items: key === 'PROJ-118' ? HALTED_EVENTS : [], lastEventId: null })
    )
  );
  api.on('listStoryRuns', () => Promise.resolve(ok([RUN])));
  TestBed.configureTestingModule({
    providers: provideFakes({ api, clock, net }),
  });
  const page = createEnvironmentInjector(
    [RowDetails],
    TestBed.inject(EnvironmentInjector)
  );
  const details = page.get(RowDetails);
  const bus = TestBed.inject(EventBus);
  return { api, clock, stream, page, details, bus };
}

const asking: Story = aStory('PROJ-131', {
  status: 'awaiting_input',
  phase: 'planning',
});
const deciding: Story = aStory('PROJ-123', {
  status: 'awaiting_decision',
  phase: 'plan_review',
});
const anchored: Story = aStory('PROJ-118', {
  status: 'halted',
  haltReason: 'run_failed',
});
const running: Story = aStory('PROJ-140', {
  status: 'running',
  currentRunId: RUN.id,
});
const docked: Story = aStory('PROJ-097', { status: 'terminal', phase: 'done' });

describe('RowDetails (All hands)', () => {
  it('reads what each status needs for the voyages it is given', async () => {
    const { api, details } = rig();
    details.sync([asking, deciding, anchored, running]);
    await settle();
    expect(api.callsOf('listQuestions').map((c) => c.args[0])).toEqual([
      'PROJ-131',
    ]);
    expect(api.callsOf('getStoryState').map((c) => c.args[0])).toEqual([
      'PROJ-123',
    ]);
    expect(api.callsOf('listStoryRuns').map((c) => c.args[0])).toEqual([
      'PROJ-140',
    ]);
    expect(
      [...new Set(api.callsOf('listStoryEvents').map((c) => c.args[0]))].sort()
    ).toEqual(['PROJ-118', 'PROJ-123']);
  });

  it('does not open a voyage that needs nothing beyond its story', async () => {
    const { api, bus, details } = rig();
    details.sync([docked, aStory('PROJ-109', { status: 'ready' })]);
    await settle();
    expect(api.calls).toEqual([]);
    expect(bus.subscribers()).toBe(0);
  });

  it('gives what was read, and nothing before it is read', async () => {
    const { details } = rig();
    expect(details.detail('PROJ-131')).toEqual({
      questions: null,
      state: null,
      gate: null,
      halt: null,
      diagnosis: null,
    });
    details.sync([asking, anchored]);
    await settle();
    expect(details.detail('PROJ-131').questions?.map((q) => q.id)).toEqual([
      'Q1',
      'Q2',
    ]);
    expect(details.detail('PROJ-118').halt).toEqual({
      reason: 'run_failed',
      detail: 'Refused.',
    });
    expect(details.runOf(running)).toBeNull();
  });

  it('gives the run a voyage at sea is on, once its runs are read', async () => {
    const { details } = rig();
    details.sync([running]);
    await settle();
    expect(details.runOf(running)).toEqual(RUN);
    expect(
      details.runOf(
        aStory('PROJ-140', { status: 'running', currentRunId: 'another-run' })
      )
    ).toBeNull();
  });

  it('lets go of a voyage that leaves the list, and only of that one', async () => {
    const { bus, details } = rig();
    details.sync([asking, deciding]);
    await settle();
    const both = bus.subscribers();
    expect(both).toBeGreaterThan(0);
    details.sync([deciding]);
    await settle();
    expect(bus.subscribers()).toBeLessThan(both);
    expect(bus.subscribers()).toBeGreaterThan(0);
    details.sync([]);
    await settle();
    expect(bus.subscribers()).toBe(0);
  });

  it('lets go of every voyage when the page goes', async () => {
    const { bus, page, details } = rig();
    details.sync([asking, deciding, anchored, running]);
    await settle();
    expect(bus.subscribers()).toBeGreaterThan(0);
    page.destroy();
    expect(bus.subscribers()).toBe(0);
  });

  it('does not read again what it already holds when it is given the same voyages again', async () => {
    const { api, details } = rig();
    details.sync([asking]);
    await settle();
    details.sync([{ ...asking, version: 2 }]);
    await settle();
    expect(api.callsOf('listQuestions')).toHaveLength(1);
  });

  it('stops following what a voyage no longer needs once its status moves on', async () => {
    const { api, clock, stream, details } = rig();
    details.sync([asking]);
    await settle();
    expect(api.callsOf('listQuestions')).toHaveLength(1);
    details.sync([{ ...asking, status: 'running', version: 2 }]);
    await settle();
    stream.sendEvent(anEvent(900, 'question.answered', {}, 'PROJ-131'));
    await settle();
    await clock.advance(300);
    expect(api.callsOf('listQuestions')).toHaveLength(1);
  });

  it('keeps following what a voyage still needs when its status changes to one that needs it too', async () => {
    const { api, clock, stream, details } = rig();
    details.sync([deciding]);
    await settle();
    expect(api.callsOf('getStoryState')).toHaveLength(1);
    details.sync([{ ...deciding, version: 2 }]);
    await settle();
    stream.sendEvent(anEvent(901, 'decision.recorded', {}, 'PROJ-123'));
    await settle();
    await clock.advance(300);
    expect(api.callsOf('getStoryState')).toHaveLength(2);
  });
});

describe('RowDetails: the diagnosis of a halted voyage', () => {
  const diagnosisOf = (key: string, title: string): Diagnosis => ({
    key,
    status: 'halted',
    phase: 'planning',
    haltReason: 'run_failed',
    findings: [
      {
        kind: 'agent_failed',
        title,
        evidence: [],
        action: 'Resume it.',
        actor: 'story_owner',
        resumable: true,
        runId: null,
      },
    ],
  });

  it('reads it for the halted voyages on screen only, once per version', async () => {
    const { api, details } = rig();
    api.on('getStoryDiagnosis', (key) =>
      Promise.resolve(ok(diagnosisOf(key, 'First.')))
    );
    details.sync([asking, anchored, running]);
    await settle();
    expect(api.callsOf('getStoryDiagnosis').map((c) => c.args)).toEqual([
      ['PROJ-118'],
    ]);
    expect(details.detail('PROJ-118').diagnosis?.findings[0]?.title).toBe(
      'First.'
    );
    details.sync([asking, anchored, running]);
    await settle();
    expect(api.callsOf('getStoryDiagnosis')).toHaveLength(1);

    api.on('getStoryDiagnosis', (key) =>
      Promise.resolve(ok(diagnosisOf(key, 'Second.')))
    );
    details.sync([{ ...anchored, version: anchored.version + 1 }]);
    await settle();
    expect(api.callsOf('getStoryDiagnosis')).toHaveLength(2);
    expect(details.detail('PROJ-118').diagnosis?.findings[0]?.title).toBe(
      'Second.'
    );
  });

  it('forgets it when the voyage leaves the list or is no longer halted, and reads it again when it comes back', async () => {
    const { api, details } = rig();
    api.on('getStoryDiagnosis', (key) =>
      Promise.resolve(ok(diagnosisOf(key, 'Cause.')))
    );
    details.sync([anchored]);
    await settle();
    details.sync([{ ...anchored, status: 'ready', haltReason: null }]);
    await settle();
    expect(details.detail('PROJ-118').diagnosis).toBeNull();
    details.sync([anchored]);
    await settle();
    expect(api.callsOf('getStoryDiagnosis')).toHaveLength(2);
    expect(details.detail('PROJ-118').diagnosis).not.toBeNull();
  });

  it('shows nothing when it cannot be read, and drops an answer that comes after the page went', async () => {
    const { api, details, page } = rig();
    api.on('getStoryDiagnosis', () =>
      Promise.resolve(fail({ kind: 'network' }))
    );
    details.sync([anchored]);
    await settle();
    expect(details.detail('PROJ-118').diagnosis).toBeNull();

    let release: (value: ApiResult<Diagnosis>) => void = () => undefined;
    api.on(
      'getStoryDiagnosis',
      () => new Promise((resolve) => (release = resolve))
    );
    details.sync([{ ...anchored, version: anchored.version + 1 }]);
    page.destroy();
    release(ok(diagnosisOf('PROJ-118', 'Late.')));
    await settle();
    expect(details.detail('PROJ-118').diagnosis).toBeNull();
  });
});
