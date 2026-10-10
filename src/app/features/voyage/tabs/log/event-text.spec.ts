import { describe, expect, it } from 'vitest';
import type { AhoyEvent } from '@core/api/types';
import { KNOWN_EVENT_TYPES } from '@core/realtime/event-types';
import {
  MAX_DETAIL_LENGTH,
  SYSTEM_ACTOR,
  clip,
  eventText,
  genericDetails,
} from './event-text';

/** An event with the payload given (the payload type is loose on purpose: the API's is untrusted). */
function event(
  type: string,
  payload: Record<string, unknown>,
  actor = SYSTEM_ACTOR
): AhoyEvent {
  return {
    id: '1',
    storyKey: 'PROJ-123',
    type,
    actor,
    payload: payload as AhoyEvent['payload'],
    createdAt: '',
  };
}

const NO_CONTEXT = { round: null, crew: null };

describe('eventText: the types whose payload is confirmed', () => {
  it('says a voyage started with its budget and the planning model', () => {
    const started = event(
      'story.started',
      {
        phase: 'intake',
        controlSha: 'a41f9c2',
        budgetNanoAiu: 20_000_000_000,
        models: {
          planning: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
        },
      },
      'alex@example.com'
    );
    expect(eventText(started)).toEqual({
      title: 'Voyage started',
      details: 'budget 20 AIU · planning on claude-sonnet-5 · high',
      kind: 'human',
      runId: null,
    });
  });

  it('says only the budget when the start has no model plan', () => {
    const started = event('story.started', {
      phase: 'intake',
      budgetNanoAiu: 12_400_000_000,
    });
    expect(eventText(started).details).toBe('budget 12.4 AIU');
  });

  it('reads a story.started without usable fields as an empty detail, not an error', () => {
    expect(
      eventText(event('story.started', { budgetNanoAiu: 'lots', models: [] }))
        .details
    ).toBe('');
  });

  it("shows an anchored voyage with the API's reason and the detail", () => {
    const halted = event('story.halted', {
      reason: 'run_failed',
      detail: 'exit 137',
      runId: 'r-02',
      workerLog: 'x',
    });
    expect(eventText(halted)).toMatchObject({
      title: 'Halted',
      details: 'run_failed · exit 137',
      runId: 'r-02',
    });
  });

  it('shows only the reason when a halt has no detail, and clips a long detail on one line', () => {
    expect(
      eventText(event('story.halted', { reason: 'budget_exhausted' })).details
    ).toBe('budget_exhausted');
    const long = eventText(
      event('story.halted', {
        reason: 'run_failed',
        detail: `line 1\nline 2 ${'x'.repeat(300)}`,
      })
    );
    expect(long.details.length).toBeLessThanOrEqual(MAX_DETAIL_LENGTH);
    expect(long.details).not.toContain('\n');
    expect(long.details.endsWith('…')).toBe(true);
  });

  it('marks the wait at a human gate with its round', () => {
    const waiting = event('story.awaiting_decision', {
      phase: 'plan_review',
      gate: 'plan_accepted',
    });
    expect(eventText(waiting, { round: 2, crew: null })).toEqual({
      title: 'Waiting at the human gate',
      details: 'plan_accepted, round 2',
      kind: 'wait',
      runId: null,
    });
    expect(eventText(waiting, NO_CONTEXT).details).toBe('plan_accepted');
  });

  it('shows a phase change as from → to', () => {
    const changed = event(
      'story.phase_changed',
      { from: 'plan_review', to: 'planning' },
      'jordan@example.com'
    );
    expect(eventText(changed)).toMatchObject({
      title: 'Phase changed',
      details: 'plan_review → planning',
      kind: 'human',
    });
  });

  it('shows a queued run with its crew member, model and effort, and links the run', () => {
    const queued = event('run.queued', {
      runId: 'r-04',
      phase: 'planning',
      agent: 'cartographer',
      model: 'claude-sonnet-5',
      reasoningEffort: 'high',
      modelSource: 'story',
      effortSource: 'story',
    });
    expect(eventText(queued)).toMatchObject({
      title: 'Run queued',
      details: 'Cartographer · claude-sonnet-5 · high',
      runId: 'r-04',
    });
  });

  it("says a model or effort the run was not given is the agent's own", () => {
    const queued = event('run.queued', {
      runId: 'r-04',
      phase: 'planning',
      agent: 'cartographer',
      model: null,
    });
    expect(eventText(queued).details).toBe(
      "Cartographer · the agent's own model · default"
    );
  });

  it('shows a dispatched run with its runtime', () => {
    expect(
      eventText(event('run.dispatched', { runId: 'r-04', runtime: 'docker' }))
    ).toMatchObject({
      title: 'Run dispatched',
      details: 'on docker',
      runId: 'r-04',
    });
  });

  it('shows a finished run with its crew, status and spend in AIU', () => {
    const finished = event('run.finished', {
      runId: 'r-04',
      status: 'succeeded',
      nanoAiu: 3_840_000_000,
      requests: 31,
    });
    expect(
      eventText(finished, { round: null, crew: 'Cartographer' })
    ).toMatchObject({
      title: 'Run finished',
      details: 'Cartographer · succeeded · 3.84 AIU',
      runId: 'r-04',
    });
    expect(eventText(finished, NO_CONTEXT).details).toBe(
      'succeeded · 3.84 AIU'
    );
  });

  it('shows a gate evaluation as gate · result, with a green dot for a pass only', () => {
    const pass = eventText(
      event('gate.evaluated', {
        gate: 'plan',
        code: 0,
        result: 'pass',
        message: 'ok',
        runId: 'r-04',
      })
    );
    expect(pass).toEqual({
      title: 'Gate evaluated',
      details: 'plan · pass',
      kind: 'pass',
      runId: 'r-04',
    });
    expect(
      eventText(event('gate.evaluated', { gate: 'plan', result: 'branch' }))
        .kind
    ).toBe('system');
  });

  it("shows a recorded decision with gate, decision and round, as a person's act", () => {
    const decided = event(
      'decision.recorded',
      {
        gate: 'plan_accepted',
        decision: 'send_back',
        round: 1,
        recordId: 'g-4',
      },
      'jordan@example.com'
    );
    expect(eventText(decided)).toEqual({
      title: 'Decision recorded',
      details: 'plan_accepted · send_back · round 1',
      kind: 'human',
      runId: null,
    });
  });

  it('shows the revision of an artifact update', () => {
    expect(
      eventText(event('artifacts.updated', { revision: 5 }))
    ).toMatchObject({
      title: 'Artifacts updated',
      details: 'revision 5',
    });
  });

  it('reads a field of the wrong type as absent', () => {
    expect(
      eventText(event('artifacts.updated', { revision: '5' })).details
    ).toBe('');
    expect(
      eventText(
        event('decision.recorded', { gate: 7, decision: null, round: 1.5 })
      ).details
    ).toBe('');
    expect(eventText(event('story.phase_changed', { from: 'a' })).details).toBe(
      ''
    );
  });
});

describe('eventText: the types whose payload is not confirmed', () => {
  const TITLES: readonly (readonly [string, string])[] = [
    ['story.resumed', 'Resumed'],
    ['story.budget_changed', 'Budget changed'],
    ['story.models_changed', 'Models changed'],
    ['story.awaiting_input', 'Waiting for answers'],
    ['question.asked', 'Questions asked'],
    ['question.answered', 'Question answered'],
    ['review.resolved', 'Review resolved'],
    ['work_package.decided', 'Work package decided'],
    ['work.reopened', 'Work reopened'],
    ['story.unblocked', 'Voyage unblocked'],
    ['implementation.reported', 'Implementation reported'],
    ['review.reported', 'Review reported'],
    ['story.routed', 'Voyage routed'],
  ];

  it.each(TITLES)(
    'gives %s its title and only the short scalar fields of its payload',
    (type, title) => {
      const view = eventText(
        event(type, {
          reason: 'Revision needs more room',
          count: 2,
          nested: { secret: 'x' },
          list: ['a'],
          ok: true,
        })
      );
      expect(view.title).toBe(title);
      expect(view.details).toBe(
        'reason: Revision needs more room · count: 2 · ok: true'
      );
    }
  );

  it('has a title for every known type but run.progress', () => {
    for (const type of KNOWN_EVENT_TYPES) {
      if (type === 'run.progress') continue;
      const { title } = eventText(event(type, {}));
      expect(title, type).not.toBe(type);
    }
  });

  it('marks the wait for answers as waiting', () => {
    expect(eventText(event('story.awaiting_input', {})).kind).toBe('wait');
  });

  it('links a run only when the payload names one as text', () => {
    expect(eventText(event('review.reported', { runId: 'r-09' })).runId).toBe(
      'r-09'
    );
    expect(eventText(event('review.reported', { runId: 9 })).runId).toBeNull();
  });
});

describe('eventText: unknown types', () => {
  it('shows the type itself and the short scalar fields, never the payload', () => {
    const view = eventText(
      event('story.teleported', {
        to: 'Mars',
        crew: { names: ['a', 'b'] },
        note: 'y'.repeat(500),
        speed: 9,
      })
    );
    expect(view).toEqual({
      title: 'story.teleported',
      details: 'to: Mars · speed: 9',
      kind: 'system',
      runId: null,
    });
  });

  it('clips a very long type used as a title, and survives an empty one', () => {
    expect(
      eventText(event('x'.repeat(300), {})).title.length
    ).toBeLessThanOrEqual(80);
    expect(eventText(event('', {})).title).toBe('Unknown event');
  });

  it('does not take a type that is an Object.prototype name for a known one', () => {
    expect(eventText(event('constructor', {})).title).toBe('constructor');
    expect(eventText(event('__proto__', {})).title).toBe('__proto__');
  });

  it('marks an unknown type by a person as human', () => {
    expect(eventText(event('x.y', {}, 'priya@example.com')).kind).toBe('human');
  });
});

describe('genericDetails', () => {
  it('lists text, number and boolean fields, and skips objects, lists, null and long text', () => {
    expect(
      genericDetails({
        a: 'one',
        b: 2,
        c: false,
        d: null,
        e: {},
        f: [],
        g: 'z'.repeat(121),
      })
    ).toBe('a: one · b: 2 · c: false');
  });

  it('puts each field on one line and cuts the whole to 120 characters', () => {
    expect(genericDetails({ a: 'x\ny' })).toBe('a: x y');
    const many = genericDetails(
      Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`field${i}`, 'value'])
      )
    );
    expect(many.length).toBeLessThanOrEqual(MAX_DETAIL_LENGTH);
    expect(many.endsWith('…')).toBe(true);
  });

  it('skips non-finite numbers and blank text', () => {
    expect(genericDetails({ a: Number.POSITIVE_INFINITY, b: '   ' })).toBe('');
  });
});

describe('clip', () => {
  it('leaves a short text alone and cuts a long one with an ellipsis within the limit', () => {
    expect(clip('short')).toBe('short');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
  });
});
