import {
  canRefreshIntake,
  headerActions,
  primaryAction,
} from './primary-action';

describe('primaryAction', () => {
  it('sends a voyage whose crew asks to the Questions tab', () => {
    expect(primaryAction('awaiting_input', null)).toEqual({
      kind: 'tab',
      label: 'Answer questions',
      tab: 'questions',
    });
  });

  it('asks to decide on the plan at the plan gate, and just to decide at another gate', () => {
    expect(primaryAction('awaiting_decision', 'plan_accepted')).toEqual({
      kind: 'tab',
      label: 'Decide on the plan',
      tab: 'plan',
    });
    expect(primaryAction('awaiting_decision', 'delivery_accepted')).toEqual({
      kind: 'tab',
      label: 'Decide',
      tab: 'plan',
    });
    expect(primaryAction('awaiting_decision', null)).toEqual({
      kind: 'tab',
      label: 'Decide',
      tab: 'plan',
    });
  });

  it('offers Resume… for an anchored voyage', () => {
    expect(primaryAction('halted', null)).toEqual({
      kind: 'resume',
      label: 'Resume…',
    });
  });

  it('offers none while the voyage sails, waits in the queue or is done', () => {
    expect(primaryAction('running', null)).toBeNull();
    expect(primaryAction('ready', null)).toBeNull();
    expect(primaryAction('terminal', null)).toBeNull();
  });
});

describe('headerActions', () => {
  it('offers Stop and Budget while the voyage moves or waits on people', () => {
    for (const status of [
      'ready',
      'running',
      'awaiting_input',
      'awaiting_decision',
    ] as const) {
      expect(headerActions(status)).toEqual({ stop: true, budget: true });
    }
  });

  it('offers Budget but not Stop for an anchored voyage', () => {
    expect(headerActions('halted')).toEqual({ stop: false, budget: true });
  });

  it('offers neither for a voyage that is done', () => {
    expect(headerActions('terminal')).toEqual({ stop: false, budget: false });
  });
});

describe('canRefreshIntake', () => {
  const planning = {
    phase: 'planning',
    status: 'awaiting_decision',
    currentRunId: null,
  } as const;

  it('offers Back to intake in planning and plan review once the runs are read and none is an implementation', () => {
    expect(canRefreshIntake(planning, [])).toBe(true);
    expect(
      canRefreshIntake({ ...planning, phase: 'plan_review' }, [
        { phase: 'intake' },
        { phase: 'planning' },
      ])
    ).toBe(true);
  });

  it('offers nothing while the runs are not read, because an implementation run may be among them', () => {
    expect(canRefreshIntake(planning, null)).toBe(false);
  });

  it('refuses a voyage that ever implemented, one under way or done, and the other phases', () => {
    expect(canRefreshIntake(planning, [{ phase: 'implementation' }])).toBe(
      false
    );
    expect(canRefreshIntake({ ...planning, status: 'running' }, [])).toBe(
      false
    );
    expect(canRefreshIntake({ ...planning, status: 'terminal' }, [])).toBe(
      false
    );
    expect(canRefreshIntake({ ...planning, currentRunId: 'run-1' }, [])).toBe(
      false
    );
    expect(canRefreshIntake({ ...planning, phase: 'implementation' }, [])).toBe(
      false
    );
  });
});
