import type { ApiError } from '@core/api/api-error';
import type { ModelPlan, Run, SlotModel, Story } from '@core/api/types';
import {
  changedModels,
  choiceOf,
  draftsOf,
  draftOf,
  modelsRequest,
  parseChangeSlot,
  refusedSlots,
  resetChange,
  rowSpecs,
  slotErrors,
  type SlotDrafts,
} from './models-change';

/** A slot of the plan; `chosen` is what a person chose, the rest what the next run gets. */
function slot(
  overrides: Partial<SlotModel> & Pick<SlotModel, 'slot'>
): SlotModel {
  return {
    phase: overrides.slot === 'review' ? 'pr_review' : overrides.slot,
    chosen: null,
    model: 'gpt-5.6-terra',
    reasoningEffort: 'medium',
    modelSource: 'configuration',
    effortSource: 'configuration',
    ...overrides,
  } as SlotModel;
}

function plan(
  overrides: Partial<Record<SlotModel['slot'], Partial<SlotModel>>> = {}
): ModelPlan {
  const base: Record<SlotModel['slot'], Partial<SlotModel>> = {
    intake: {},
    planning: {},
    implementation: { model: 'claude-sonnet-5', reasoningEffort: null },
    review: { model: 'gpt-5.6-terra', reasoningEffort: 'high' },
  };
  const slots = (Object.keys(base) as SlotModel['slot'][]).map((name) =>
    slot({ slot: name, ...base[name], ...overrides[name] })
  );
  return { storyKey: 'PROJ-118', version: 14, slots };
}

describe('choiceOf', () => {
  it('is null for a blank slot: the default', () => {
    expect(choiceOf({ model: '', effort: '' })).toBeNull();
    expect(choiceOf({ model: '   ', effort: '' })).toBeNull();
  });

  it('sends only the model when no effort is chosen', () => {
    expect(choiceOf({ model: ' claude-sonnet-5 ', effort: '' })).toEqual({
      model: 'claude-sonnet-5',
    });
  });

  it('sends model and effort together, and an effort alone', () => {
    expect(choiceOf({ model: 'claude-sonnet-5', effort: 'high' })).toEqual({
      model: 'claude-sonnet-5',
      reasoningEffort: 'high',
    });
    expect(choiceOf({ model: '', effort: 'low' })).toEqual({
      reasoningEffort: 'low',
    });
  });
});

describe('draftOf', () => {
  it('starts from what was chosen, and is blank when nothing was', () => {
    const chosen = slot({
      slot: 'planning',
      chosen: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
    });
    expect(draftOf(chosen)).toEqual({
      model: 'claude-sonnet-5',
      effort: 'high',
    });
    expect(draftOf(slot({ slot: 'intake' }))).toEqual({
      model: '',
      effort: '',
    });
    expect(
      draftOf(slot({ slot: 'planning', chosen: { model: 'gpt-5.6-terra' } }))
    ).toEqual({
      model: 'gpt-5.6-terra',
      effort: '',
    });
  });
});

describe('changedModels', () => {
  it('is empty when nothing was touched: no request is ever an empty object', () => {
    const current = plan();
    expect(changedModels(current, draftsOf(current))).toEqual({});
  });

  it('carries only the slots that changed, with model and effort', () => {
    const current = plan();
    const drafts: SlotDrafts = {
      ...draftsOf(current),
      planning: { model: 'claude-sonnet-5', effort: 'high' },
    };
    expect(changedModels(current, drafts)).toEqual({
      planning: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
    });
  });

  it('sends only {model} for a model without an effort', () => {
    const current = plan();
    const drafts: SlotDrafts = {
      ...draftsOf(current),
      planning: { model: 'claude-sonnet-5', effort: '' },
    };
    expect(changedModels(current, drafts)).toEqual({
      planning: { model: 'claude-sonnet-5' },
    });
  });

  it('sends null for a chosen slot that went back to blank, and nothing for a blank one that stayed blank', () => {
    const current = plan({
      planning: { chosen: { model: 'gpt-5.6-terra', reasoningEffort: 'high' } },
    });
    const drafts: SlotDrafts = {
      ...draftsOf(current),
      planning: { model: '', effort: '' },
    };
    expect(changedModels(current, drafts)).toEqual({ planning: null });
  });

  it('does not resend a slot whose text only differs by spaces', () => {
    const current = plan({
      planning: { chosen: { model: 'claude-sonnet-5' } },
    });
    const drafts: SlotDrafts = {
      ...draftsOf(current),
      planning: { model: ' claude-sonnet-5 ', effort: '' },
    };
    expect(changedModels(current, drafts)).toEqual({});
  });

  it('never contains an empty choice object', () => {
    const current = plan({ planning: { chosen: { model: 'x' } } });
    const drafts: SlotDrafts = {
      ...draftsOf(current),
      planning: { model: '  ', effort: '' },
    };
    for (const choice of Object.values(changedModels(current, drafts))) {
      expect(choice === null || Object.keys(choice).length > 0).toBe(true);
    }
  });
});

describe('modelsRequest', () => {
  it('is the exact body: expectedVersion and models, with the reason only when there is one', () => {
    expect(modelsRequest(14, { planning: null }, '')).toEqual({
      expectedVersion: 14,
      models: { planning: null },
    });
    expect(
      modelsRequest(14, { planning: { model: 'm' } }, 'Not enabled')
    ).toEqual({
      expectedVersion: 14,
      models: { planning: { model: 'm' } },
      reason: 'Not enabled',
    });
  });
});

describe('rowSpecs', () => {
  it('shows the model the slot falls back to as the default, only where nothing was chosen', () => {
    const current = plan({
      planning: { chosen: { model: 'claude-sonnet-5' }, modelSource: 'story' },
    });
    const specs = rowSpecs(current);
    expect(specs.map((s) => s.slot)).toEqual([
      'intake',
      'planning',
      'implementation',
      'review',
    ]);
    expect(specs[0]).toMatchObject({
      defaultModel: 'gpt-5.6-terra',
      defaultEffort: 'medium',
      chosen: false,
    });
    expect(specs[1]).toMatchObject({
      chosen: true,
      source: 'Chosen for this voyage',
    });
    expect(specs[1]?.defaultModel).toBeUndefined();
    expect(specs[1]?.defaultEffort).toBe('medium');
  });
});

describe('refusedSlots', () => {
  const halted = { status: 'halted', haltReason: 'run_failed' } as Story;
  const failed = (overrides: Partial<Run>): Run =>
    ({
      id: 'r-02',
      phase: 'planning',
      status: 'failed',
      model: 'gpt-5.6-terra',
      createdAt: '2026-10-05T10:00:00Z',
      ...overrides,
    }) as Run;

  it('marks the slot whose last run of the phase failed on the model it still has', () => {
    expect([...refusedSlots(halted, [failed({})], plan())]).toEqual([
      'planning',
    ]);
  });

  it('marks the review slot when a pr_review run failed on its configured model', () => {
    const current = plan({ review: { model: 'gpt-5.6-terra' } });
    const runs = [failed({ phase: 'pr_review' })];
    expect([...refusedSlots(halted, runs, current)]).toEqual(['review']);
  });

  it('does not mark anything when the voyage is not halted with run_failed', () => {
    const running = { status: 'running', haltReason: null } as Story;
    const stopped = {
      status: 'halted',
      haltReason: 'stopped_by_user',
    } as Story;
    expect(refusedSlots(running, [failed({})], plan()).size).toBe(0);
    expect(refusedSlots(stopped, [failed({})], plan()).size).toBe(0);
    expect(refusedSlots(null, [failed({})], plan()).size).toBe(0);
  });

  it('does not mark a slot that has been changed since, or whose last run did not fail', () => {
    expect(
      refusedSlots(halted, [failed({ model: 'another-model' })], plan()).size
    ).toBe(0);
    expect(
      refusedSlots(
        halted,
        [
          failed({}),
          failed({ status: 'succeeded', createdAt: '2026-10-05T11:00:00Z' }),
        ],
        plan()
      ).size
    ).toBe(0);
  });

  it('looks at the last run of the phase, not of the voyage', () => {
    const runs = [
      failed({}),
      failed({
        id: 'r-03',
        phase: 'implementation',
        status: 'succeeded',
        createdAt: '2026-10-05T12:00:00Z',
      }),
    ];
    expect([...refusedSlots(halted, runs, plan())]).toEqual(['planning']);
  });

  it('never marks a slot with no model, or a run with none', () => {
    const noModel = plan({ planning: { model: null } });
    expect(refusedSlots(halted, [failed({ model: null })], noModel).size).toBe(
      0
    );
  });
});

describe('parseChangeSlot', () => {
  it('reads a slot, and ignores anything else in the query string', () => {
    expect(parseChangeSlot('planning')).toBe('planning');
    expect(parseChangeSlot('review')).toBe('review');
    expect(parseChangeSlot('pr_review')).toBeNull();
    expect(parseChangeSlot('<script>')).toBeNull();
    expect(parseChangeSlot('')).toBeNull();
    expect(parseChangeSlot(null)).toBeNull();
  });
});

describe('slotErrors', () => {
  const problem = (errors: { path: string; message: string }[]): ApiError => ({
    kind: 'problem',
    status: 400,
    code: 'validation_failed',
    title: 'Validation failed',
    errors,
  });

  it('puts a message on the slot its path names', () => {
    const errors = slotErrors(
      problem([{ path: '/models/planning/model', message: 'unknown model' }])
    );
    expect(errors).toEqual({ planning: 'unknown model' });
  });

  it('leaves a model-level server error unassigned to a slot', () => {
    const errors = slotErrors(
      problem([
        {
          path: '/models',
          message: 'models are unavailable',
        },
      ])
    );
    expect(errors).toEqual({});
  });

  it('leaves a message it cannot place to the banner, and an error that is not a problem has none', () => {
    expect(
      slotErrors(problem([{ path: '/reason', message: 'too long' }]))
    ).toEqual({});
    const network: ApiError = { kind: 'network' };
    expect(slotErrors(network)).toEqual({});
  });
});

describe('resetChange', () => {
  it('is one slot set to null, which is how a slot goes back to the default', () => {
    expect(resetChange('planning')).toEqual({ planning: null });
  });
});
