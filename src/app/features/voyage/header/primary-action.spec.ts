import {
  canRefreshDesign,
  canRefreshIntake,
  headerActions,
  menuItems,
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

  it('asks to decide on the plan at the plan gate, and at another gate jumps to its decision above the tabs', () => {
    expect(primaryAction('awaiting_decision', 'plan_accepted')).toEqual({
      kind: 'tab',
      label: 'Decide on the plan',
      tab: 'plan',
    });
    expect(primaryAction('awaiting_decision', 'delivery_accepted')).toEqual({
      kind: 'decide',
      label: 'Decide',
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

  it('offers Start again… for a cancelled voyage', () => {
    expect(primaryAction('cancelled', null)).toEqual({
      kind: 'restart',
      label: 'Start again…',
    });
  });

  it('offers none while the voyage sails, waits in the queue or is done', () => {
    expect(primaryAction('running', null)).toBeNull();
    expect(primaryAction('ready', null)).toBeNull();
    expect(primaryAction('terminal', null)).toBeNull();
  });
});

describe('headerActions', () => {
  it('offers Stop, Budget and Cancel voyage while the voyage moves or waits on people', () => {
    for (const status of [
      'ready',
      'running',
      'awaiting_input',
      'awaiting_decision',
    ] as const) {
      expect(headerActions(status)).toEqual({
        stop: true,
        budget: true,
        cancel: true,
      });
    }
  });

  it('offers Budget and Cancel voyage but not Stop for an anchored voyage', () => {
    expect(headerActions('halted')).toEqual({
      stop: false,
      budget: true,
      cancel: true,
    });
  });

  it('offers none for a voyage that is done or cancelled', () => {
    for (const status of ['terminal', 'cancelled'] as const)
      expect(headerActions(status)).toEqual({
        stop: false,
        budget: false,
        cancel: false,
      });
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
    expect(canRefreshIntake({ ...planning, phase: 'design' }, [])).toBe(false);
  });
});

describe('canRefreshDesign', () => {
  const atDelivery = {
    phase: 'delivery_gate',
    status: 'awaiting_decision',
    currentRunId: null,
  } as const;
  const READ = { read: true, refreshed: false } as const;
  const NONE = { read: false, refreshed: false } as const;

  it('offers Refresh design at the delivery gate and on a halted implementation or review, once a design was read', () => {
    expect(canRefreshDesign(atDelivery, READ)).toBe(true);
    expect(
      canRefreshDesign(
        { ...atDelivery, phase: 'implementation', status: 'halted' },
        READ
      )
    ).toBe(true);
    expect(
      canRefreshDesign(
        { ...atDelivery, phase: 'pr_review', status: 'halted' },
        READ
      )
    ).toBe(true);
  });

  it('offers it in the design phase only after a refresh, so a person can correct links that could not be read', () => {
    const stopped = {
      ...atDelivery,
      phase: 'design',
      status: 'halted',
    } as const;
    expect(canRefreshDesign(stopped, { read: false, refreshed: true })).toBe(
      true
    );
    expect(canRefreshDesign(stopped, READ)).toBe(false);
    expect(
      canRefreshDesign(
        { ...stopped, status: 'running' },
        { read: false, refreshed: true }
      )
    ).toBe(false);
  });

  it('offers nothing without a design, with a run under way, or where the API refuses a refresh', () => {
    expect(canRefreshDesign(atDelivery, NONE)).toBe(false);
    expect(canRefreshDesign({ ...atDelivery, currentRunId: 'r-1' }, READ)).toBe(
      false
    );
    expect(
      canRefreshDesign(
        { ...atDelivery, phase: 'plan_review', status: 'awaiting_decision' },
        READ
      )
    ).toBe(false);
    expect(
      canRefreshDesign(
        { ...atDelivery, phase: 'implementation', status: 'running' },
        READ
      )
    ).toBe(false);
    expect(
      canRefreshDesign(
        { ...atDelivery, phase: 'done', status: 'terminal' },
        READ
      )
    ).toBe(false);
  });
});

describe('menuItems', () => {
  const all = {
    budget: true,
    stop: true,
    cancel: true,
    halted: false,
    modelsReady: true,
    intake: true,
    design: true,
    startFollowUp: false,
    raiseCeiling: false,
  };

  it('lists Budget, Models, Back to intake and Refresh design, then Stop and Cancel voyage apart at the end', () => {
    const items = menuItems(all);
    expect(items.map((i) => i.label)).toEqual([
      'Budget',
      'Models',
      'Back to intake',
      'Refresh design',
      'Stop',
      'Cancel voyage',
    ]);
    expect(items.filter((i) => i.danger).map((i) => i.id)).toEqual([
      'stop',
      'cancel',
    ]);
    expect(items.filter((i) => i.separated).map((i) => i.id)).toEqual(['stop']);
  });

  it('puts Start follow-up and Raise revision ceiling before Stop and Cancel voyage', () => {
    const items = menuItems({
      ...all,
      startFollowUp: true,
      raiseCeiling: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      'budget',
      'models',
      'intake',
      'design',
      'followUp',
      'raiseCeiling',
      'stop',
      'cancel',
    ]);
    expect(items.find((i) => i.id === 'followUp')?.danger).toBe(false);
  });

  it('lists only what applies: Change models and Cancel voyage for an anchored voyage', () => {
    const items = menuItems({
      ...all,
      stop: false,
      halted: true,
      intake: false,
      design: false,
    });
    expect(items.map((i) => i.label)).toEqual([
      'Budget',
      'Change models',
      'Cancel voyage',
    ]);
  });

  it('keeps Models, disabled until the models are read, as the only item of a voyage that is over', () => {
    const items = menuItems({
      budget: false,
      stop: false,
      cancel: false,
      halted: false,
      modelsReady: false,
      intake: false,
      design: false,
      startFollowUp: false,
      raiseCeiling: false,
    });
    expect(items).toEqual([
      {
        id: 'models',
        label: 'Models',
        danger: false,
        separated: false,
        disabled: true,
      },
    ]);
  });
});
