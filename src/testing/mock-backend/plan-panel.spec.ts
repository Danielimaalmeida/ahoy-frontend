import type { PlanPanel } from '@core/api/types';
import { isRecord } from './http';
import type { MockAhoyServer } from './server';
import type { ManualClock } from './clock';
import { planPanelMetrics, simulatedPanel } from './plan-panel';
import {
  call,
  field,
  problemCode,
  testServer,
  type Answer,
} from './spec-helpers';

const AIU = 1_000_000_000;

/** The story as the API answers it now. */
function story(server: MockAhoyServer, key: string): Record<string, unknown> {
  const body = call(server, 'GET', `/stories/${key}`).body;
  if (!isRecord(body)) throw new Error('not a story');
  return body;
}

/** Lets the simulated reconciler work, a second at a time, until `done` holds for the story. */
function advanceUntil(
  server: MockAhoyServer,
  clock: ManualClock,
  key: string,
  done: (story: Record<string, unknown>) => boolean
): void {
  for (let i = 0; i < 120 && !done(story(server, key)); i++)
    clock.advance(1_000);
  if (!done(story(server, key))) throw new Error(`${key} never got there`);
}

/** Starts a story, by panel unless `mode` says otherwise, and lets it ask its questions. */
function startAndAsk(
  server: MockAhoyServer,
  clock: ManualClock,
  key: string,
  mode: 'panel' | 'standard' | null
): void {
  const started = call(server, 'POST', '/stories', {
    key,
    title: 'Panel story',
    budgetNanoAiu: 40 * AIU,
    ...(mode === null ? {} : { planningMode: mode }),
  });
  expect(started.status).toBe(201);
  advanceUntil(server, clock, key, (s) => s['status'] === 'awaiting_input');
}

/** Answers the planner's questions and lets the story reach plan review. */
function answerAndPlan(
  server: MockAhoyServer,
  clock: ManualClock,
  key: string
): void {
  const questions = call(server, 'GET', `/stories/${key}/questions`).body as {
    items: { id: string }[];
  };
  for (const q of questions.items)
    call(server, 'POST', `/stories/${key}/questions/${q.id}/answer`, {
      answer: 'POC test answer, not a product decision',
      expectedVersion: story(server, key)['version'],
    });
  advanceUntil(
    server,
    clock,
    key,
    (s) => s['phase'] === 'plan_review' && s['status'] === 'awaiting_decision'
  );
}

function panelsOf(server: MockAhoyServer, key: string): Answer {
  return call(server, 'GET', `/stories/${key}/plan-panels`);
}

describe('the mock · planning mode', () => {
  it('says standard for every seeded story, and for one started without a mode', () => {
    const { server, clock } = testServer();
    for (const key of server.state.voyages.keys())
      expect(story(server, key)['planningMode'], key).toBe('standard');
    startAndAsk(server, clock, 'DEMO-1', null);
    expect(story(server, 'DEMO-1')['planningMode']).toBe('standard');
  });

  it('starts a story by panel when asked, and records it on story.started only then', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    startAndAsk(server, clock, 'DEMO-1', null);
    const started = (key: string): Record<string, unknown> | undefined => {
      const events = call(server, 'GET', `/stories/${key}/events?limit=500`)
        .body as {
        items: { type: string; payload: Record<string, unknown> }[];
      };
      return events.items.find((e) => e.type === 'story.started')?.payload;
    };
    expect(story(server, 'PANEL-1')['planningMode']).toBe('panel');
    expect(started('PANEL-1')?.['planningMode']).toBe('panel');
    expect(started('DEMO-1')).not.toHaveProperty('planningMode');
  });

  it('refuses a mode the contract does not list when a story starts', () => {
    const { server } = testServer();
    const refused = call(server, 'POST', '/stories', {
      key: 'PANEL-2',
      budgetNanoAiu: 10 * AIU,
      planningMode: 'duo',
    });
    expect([refused.status, problemCode(refused)]).toEqual([
      400,
      'validation_failed',
    ]);
  });

  it('changes the mode at a new version, with story.planning_mode_changed and the reason, and no phase change', () => {
    const { server } = testServer();
    const before = story(server, 'PROJ-123');
    const changed = call(server, 'POST', '/stories/PROJ-123/planning-mode', {
      expectedVersion: before['version'],
      planningMode: 'panel',
      reason: 'A hard story',
    });
    expect(changed.status).toBe(202);
    expect(field(changed, 'planningMode')).toBe('panel');
    expect(field(changed, 'version')).toBe((before['version'] as number) + 1);
    expect(field(changed, 'phase')).toBe(before['phase']);
    expect(field(changed, 'status')).toBe(before['status']);
    const events = (
      call(server, 'GET', '/stories/PROJ-123/events?limit=500').body as {
        items: { type: string; payload: Record<string, unknown> }[];
      }
    ).items;
    expect(events.at(-1)).toMatchObject({
      type: 'story.planning_mode_changed',
      payload: { from: 'standard', to: 'panel', detail: 'A hard story' },
    });
  });

  it('answers a stale version with 409 and the current one, and a terminal story with invalid_state', () => {
    const { server } = testServer();
    const stale = call(server, 'POST', '/stories/PROJ-123/planning-mode', {
      expectedVersion: 1,
      planningMode: 'panel',
    });
    expect([
      stale.status,
      problemCode(stale),
      field(stale, 'currentVersion'),
    ]).toEqual([409, 'stale_version', story(server, 'PROJ-123')['version']]);
    const terminal = call(server, 'POST', '/stories/PROJ-097/planning-mode', {
      expectedVersion: story(server, 'PROJ-097')['version'],
      planningMode: 'panel',
    });
    expect([terminal.status, problemCode(terminal)]).toEqual([
      409,
      'invalid_state',
    ]);
  });

  it('refuses a request without a mode, with an unknown mode or with an empty reason', () => {
    const { server } = testServer();
    const version = story(server, 'PROJ-123')['version'];
    for (const body of [
      { expectedVersion: version },
      { expectedVersion: version, planningMode: 'duo' },
      { expectedVersion: version, planningMode: 'panel', reason: '' },
    ]) {
      const refused = call(
        server,
        'POST',
        '/stories/PROJ-123/planning-mode',
        body
      );
      expect([refused.status, problemCode(refused)]).toEqual([
        400,
        'validation_failed',
      ]);
    }
    expect(story(server, 'PROJ-123')['version']).toBe(version);
  });

  it('answers 404 for a story that does not exist', () => {
    const { server } = testServer();
    const missing = call(server, 'POST', '/stories/NOPE-1/planning-mode', {
      expectedVersion: 1,
      planningMode: 'panel',
    });
    expect([missing.status, problemCode(missing)]).toEqual([404, 'not_found']);
    expect(panelsOf(server, 'NOPE-1').status).toBe(404);
  });
});

describe('the mock · plan panels', () => {
  it('has none for a story planned by one planner, whose runs are not panel runs', () => {
    const { server, clock } = testServer();
    expect(panelsOf(server, 'PROJ-123').body).toEqual({ items: [] });
    const runs = call(server, 'GET', '/stories/PROJ-123/runs').body as {
      items: { id: string }[];
    };
    const missing = call(
      server,
      'GET',
      `/runs/${runs.items[0]!.id}/plan-panel`
    );
    expect([missing.status, problemCode(missing)]).toEqual([404, 'not_found']);
    expect(field(missing, 'detail')).toBe(
      `Run ${runs.items[0]!.id} was not planned by a panel`
    );
    startAndAsk(server, clock, 'DEMO-1', null);
    answerAndPlan(server, clock, 'DEMO-1');
    expect(panelsOf(server, 'DEMO-1').body).toEqual({ items: [] });
  });

  it('answers 404 for a run that does not exist', () => {
    const { server } = testServer();
    const missing = call(server, 'GET', '/runs/r-nope/plan-panel');
    expect([missing.status, problemCode(missing)]).toEqual([404, 'not_found']);
  });

  it('leaves a panel when the planners ask their questions: no scores, no plans, the questions on each draft', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    const list = panelsOf(server, 'PANEL-1').body as {
      items: { members: Record<string, unknown>[]; judge: unknown }[];
    };
    expect(list.items).toHaveLength(1);
    const [panel] = list.items;
    expect(panel!.members.map((m) => m['label'])).toEqual(['A', 'B', 'C']);
    for (const member of panel!.members) {
      expect(member['score']).toBeNull();
      expect(member['gate']).toBeNull();
      expect(member['questions']).toHaveLength(1);
      expect(member).not.toHaveProperty('plan');
    }
    expect(panel!.judge).not.toBeNull();
  });

  it('rates the drafts once the questions are answered, newest panel first, with the plans only in getRunPlanPanel', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    answerAndPlan(server, clock, 'PANEL-1');
    const list = panelsOf(server, 'PANEL-1').body as {
      items: { runId: string; members: Record<string, unknown>[] }[];
    };
    expect(list.items).toHaveLength(2);
    const [latest, first] = list.items;
    expect(first!.members.every((m) => m['score'] === null)).toBe(true);
    const scores = latest!.members.map((m) => m['score']);
    expect(scores).toEqual([8, 6, 7]);
    expect(latest!.members.every((m) => !('plan' in m))).toBe(true);
    expect(
      latest!.members.map((m) => (m['gate'] as { result: string }).result)
    ).toEqual(['pass', 'pass', 'pass']);
    const detail = call(server, 'GET', `/runs/${latest!.runId}/plan-panel`);
    expect(detail.status).toBe(200);
    const members = field(detail, 'members') as { plan: string }[];
    expect(members[0]!.plan).toContain('# Draft A for PANEL-1');
    expect(field(detail, 'summary')).toContain('Simulated judge');
  });

  it('uses the models the catalogue lists under planPanel, and its first judge model', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    const catalogue = call(server, 'GET', '/models').body as {
      planPanel: {
        panelists: { model: string }[];
        judge: { models: string[] };
      };
    };
    const panel = (
      panelsOf(server, 'PANEL-1').body as {
        items: { members: { model: string }[]; judge: { model: string } }[];
      }
    ).items[0]!;
    expect(panel.members.map((m) => m.model)).toEqual(
      catalogue.planPanel.panelists.map((p) => p.model)
    );
    expect(panel.judge.model).toBe(catalogue.planPanel.judge.models[0]);
  });

  it('turns the scores round for a re-plan, so the best draft is not always the same seat', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    answerAndPlan(server, clock, 'PANEL-1');
    call(server, 'POST', '/stories/PANEL-1/decisions', {
      gate: 'plan_accepted',
      decision: 'send_back',
      reason: 'Add the empty state.',
      expectedVersion: story(server, 'PANEL-1')['version'],
    });
    advanceUntil(server, clock, 'PANEL-1', (s) => s['phase'] === 'planning');
    advanceUntil(
      server,
      clock,
      'PANEL-1',
      (s) => s['phase'] === 'plan_review' && s['status'] === 'awaiting_decision'
    );
    const panels = (
      panelsOf(server, 'PANEL-1').body as {
        items: { members: { label: string; score: number | null }[] }[];
      }
    ).items;
    expect(panels).toHaveLength(3);
    const best = (index: number): string | undefined =>
      panels[index]!.members.reduce((a, b) =>
        (b.score ?? 0) > (a.score ?? 0) ? b : a
      ).label;
    expect(best(0)).not.toBe(best(1));
  });

  it('gives a panel run twice the planning run cap and spends more on it', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    startAndAsk(server, clock, 'DEMO-1', null);
    const planning = (key: string) =>
      (
        call(server, 'GET', `/stories/${key}/runs`).body as {
          items: {
            phase: string;
            budgetNanoAiu: number;
            usage: { nanoAiu: number };
          }[];
        }
      ).items.find((r) => r.phase === 'planning')!;
    expect(planning('PANEL-1').budgetNanoAiu).toBe(
      2 * planning('DEMO-1').budgetNanoAiu
    );
    expect(planning('PANEL-1').usage.nanoAiu).toBeGreaterThan(
      planning('DEMO-1').usage.nanoAiu
    );
  });

  it('keeps the mode a run was queued with: a change while it runs applies from the next planning run', () => {
    const { server, clock } = testServer();
    call(server, 'POST', '/stories', {
      key: 'DEMO-1',
      budgetNanoAiu: 40 * AIU,
    });
    advanceUntil(
      server,
      clock,
      'DEMO-1',
      (s) => s['phase'] === 'planning' && s['status'] === 'running'
    );
    call(server, 'POST', '/stories/DEMO-1/planning-mode', {
      expectedVersion: story(server, 'DEMO-1')['version'],
      planningMode: 'panel',
    });
    advanceUntil(
      server,
      clock,
      'DEMO-1',
      (s) => s['status'] === 'awaiting_input'
    );
    expect(panelsOf(server, 'DEMO-1').body).toEqual({ items: [] });
    answerAndPlan(server, clock, 'DEMO-1');
    expect(
      (panelsOf(server, 'DEMO-1').body as { items: unknown[] }).items
    ).toHaveLength(1);
  });
});

describe('the mock · plan panel metrics', () => {
  it('says that no panel ran in the period of a world with none', () => {
    const { server } = testServer();
    const answer = call(server, 'GET', '/metrics/plan-panel');
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ panels: 0, models: [], judges: [] });
  });

  it('works the ratings out from the panels that ran, best average first, with the judges counted apart', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    answerAndPlan(server, clock, 'PANEL-1');
    // The period ends before now: a panel written this very instant is not in it yet.
    clock.advance(1_000);
    const answer = call(server, 'GET', '/metrics/plan-panel');
    const body = answer.body as {
      panels: number;
      models: {
        model: string;
        judgeModel: string | null;
        plans: number;
        rated: number;
        averageScore: number | null;
        minScore: number | null;
        maxScore: number | null;
        best: number;
        gatePassed: number;
        gateChecked: number;
        unfinished: number;
      }[];
      judges: { model: string; panels: number }[];
    };
    expect(body.panels).toBe(2);
    expect(body.judges).toEqual([{ model: 'claude-opus-5.5', panels: 2 }]);
    expect(body.models.map((m) => m.model)).toEqual([
      'claude-haiku-4.5',
      'gemini-3.8-flash',
      'gpt-5.6-terra',
    ]);
    const [top, mid, low] = body.models;
    expect([top!.averageScore, mid!.averageScore, low!.averageScore]).toEqual([
      8, 7, 6,
    ]);
    expect(top).toMatchObject({
      judgeModel: 'claude-opus-5.5',
      plans: 2,
      rated: 1,
      minScore: 8,
      maxScore: 8,
      best: 1,
      gatePassed: 1,
      gateChecked: 1,
      unfinished: 0,
    });
    expect(mid!.best).toBe(0);
  });

  it('gives a model a row for each judge, never averaging two judges’ scores together', () => {
    const at = Date.parse('2026-10-01T10:00:00.000Z');
    const judgedBy = (model: string, earlier: number): PlanPanel => {
      const panel = simulatedPanel(
        `run-${earlier}`,
        'PANEL-1',
        at,
        true,
        earlier
      );
      return panel.judge === null
        ? panel
        : { ...panel, judge: { ...panel.judge, model } };
    };
    const body = planPanelMetrics(
      [
        judgedBy('claude-opus-5.5', 0),
        judgedBy('claude-opus-5.5', 1),
        judgedBy('claude-sonnet-5', 4),
        { ...judgedBy('claude-opus-5.5', 0), judge: null },
      ],
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z'
    );
    expect(body.panels).toBe(4);
    expect(body.judges).toEqual([
      { model: 'claude-opus-5.5', panels: 2 },
      { model: 'claude-sonnet-5', panels: 1 },
    ]);
    const rows = body.models.map((m) => [m.model, m.judgeModel, m.plans]);
    expect(rows).toHaveLength(9);
    expect(rows).toContainEqual(['claude-haiku-4.5', 'claude-opus-5.5', 2]);
    expect(rows).toContainEqual(['claude-haiku-4.5', 'claude-sonnet-5', 1]);
    expect(rows).toContainEqual(['claude-haiku-4.5', null, 1]);
    const opus = body.models.find(
      (m) =>
        m.model === 'claude-haiku-4.5' && m.judgeModel === 'claude-opus-5.5'
    )!;
    const sonnet = body.models.find(
      (m) =>
        m.model === 'claude-haiku-4.5' && m.judgeModel === 'claude-sonnet-5'
    )!;
    expect([opus.averageScore, sonnet.averageScore]).toEqual([7, 4]);
  });

  it('counts only the panels kept in the period asked for', () => {
    const { server, clock } = testServer();
    startAndAsk(server, clock, 'PANEL-1', 'panel');
    const now = new Date(clock.now());
    const later = new Date(now.getTime() + 86_400_000).toISOString();
    const muchLater = new Date(now.getTime() + 2 * 86_400_000).toISOString();
    const empty = call(
      server,
      'GET',
      `/metrics/plan-panel?from=${later}&to=${muchLater}`
    );
    expect(empty.body).toMatchObject({ panels: 0, from: later, to: muchLater });
    const earlier = new Date(now.getTime() - 86_400_000).toISOString();
    const full = call(
      server,
      'GET',
      `/metrics/plan-panel?from=${earlier}&to=${later}`
    );
    expect(full.body).toMatchObject({ panels: 1 });
  });

  it('refuses a period that ends before it starts, or spans more than 366 days', () => {
    const { server } = testServer();
    const backwards = call(
      server,
      'GET',
      '/metrics/plan-panel?from=2026-10-05T00:00:00.000Z&to=2026-10-01T00:00:00.000Z'
    );
    expect([backwards.status, problemCode(backwards)]).toEqual([
      400,
      'validation_failed',
    ]);
    const long = call(
      server,
      'GET',
      '/metrics/plan-panel?from=2025-01-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z'
    );
    expect([long.status, problemCode(long)]).toEqual([
      400,
      'validation_failed',
    ]);
  });
});
