import { IN_PORT, statusPresentation } from '@domain/status';
import { outcomePresentation } from '@domain/outcome';
import {
  CREW,
  EFFORT_SOURCE_LABELS,
  MODEL_SOURCE_LABELS,
} from '@domain/models';
import {
  AGENT_DIAGNOSIS_MAX_NANO_AIU,
  REFINEMENT_MAX_NANO_AIU,
} from '@domain/refinement';
import type * as Domain from '@domain/types';
import type * as Panel from '@domain/plan-panel';
import type * as Planning from '@domain/planning-mode';
import {
  PANELIST_STATUSES,
  bestMembers,
  panelSummaryLine,
  rankMembers,
} from '@domain/plan-panel';
import { PLANNING_MODES, planningModeOf } from '@domain/planning-mode';
import contract from '@testing/fixtures/openapi.json';
import getRunPlanPanel from '@testing/fixtures/getRunPlanPanel.json';
import getStoryModels from '@testing/fixtures/getStoryModels.json';
import { isModelPlan, isPlanPanel } from './guards';
import * as Api from './types';

/**
 * `domain/` may not import `core/`, so `@domain/types` repeats the shapes of the contract. The contract is sovereign:
 * these tests fail, at `npm run typecheck` or here, when the two drift apart, instead of a screen failing later.
 */
describe('@domain/types is the contract', () => {
  it('has the same enums as the generated types', () => {
    expectTypeOf<Domain.StoryStatus>().toEqualTypeOf<Api.StoryStatus>();
    expectTypeOf<Domain.RunStatus>().toEqualTypeOf<Api.RunStatus>();
    expectTypeOf<Domain.GateOutcome>().toEqualTypeOf<Api.GateOutcome>();
    expectTypeOf<Domain.ModelSlot>().toEqualTypeOf<Api.ModelSlot>();
    expectTypeOf<Domain.ReasoningEffort>().toEqualTypeOf<Api.ReasoningEffort>();
    expectTypeOf<Domain.ModelSource>().toEqualTypeOf<Api.ModelSource>();
    expectTypeOf<Domain.EffortSource>().toEqualTypeOf<Api.EffortSource>();
    expectTypeOf<Domain.DiagnosisActor>().toEqualTypeOf<Api.DiagnosisActor>();
    expectTypeOf<Domain.DiagnosisKind>().toEqualTypeOf<Api.DiagnosisKind>();
    expectTypeOf<Domain.RefinementStatus>().toEqualTypeOf<Api.RefinementStatus>();
  });

  it('has the same resources as the generated types, field for field', () => {
    expectTypeOf<Domain.Story>().toEqualTypeOf<Api.Story>();
    expectTypeOf<Domain.Usage>().toEqualTypeOf<Api.Usage>();
    expectTypeOf<Domain.RuntimeStatus>().toEqualTypeOf<Api.RuntimeStatus>();
    expectTypeOf<Domain.GateVerdict>().toEqualTypeOf<Api.GateVerdict>();
    expectTypeOf<Domain.Run>().toEqualTypeOf<Api.Run>();
    expectTypeOf<Domain.Question>().toEqualTypeOf<Api.Question>();
    expectTypeOf<Domain.GateRecord>().toEqualTypeOf<Api.GateRecord>();
    expectTypeOf<Domain.Artifact>().toEqualTypeOf<Api.Artifact>();
    expectTypeOf<Domain.AhoyEvent>().toEqualTypeOf<Api.AhoyEvent>();
    expectTypeOf<Domain.ModelChoice>().toEqualTypeOf<Api.ModelChoice>();
    expectTypeOf<Domain.SlotModel>().toEqualTypeOf<Api.SlotModel>();
    expectTypeOf<Domain.ModelPlan>().toEqualTypeOf<Api.ModelPlan>();
    expectTypeOf<Planning.PlanningMode>().toEqualTypeOf<Api.PlanningMode>();
    expectTypeOf<Panel.PanelistStatus>().toEqualTypeOf<Api.PanelistStatus>();
    expectTypeOf<Domain.FitReason>().toEqualTypeOf<Api.FitReason>();
    expectTypeOf<Domain.BacklogReadiness>().toEqualTypeOf<Api.BacklogReadiness>();
    expectTypeOf<Domain.PlanFit>().toEqualTypeOf<Api.PlanFit>();
  });

  it('takes a phase as the contract does: any string', () => {
    expectTypeOf<Domain.Phase>().toEqualTypeOf<string>();
    expectTypeOf<Api.Story['phase']>().toEqualTypeOf<string>();
  });
});

describe('the domain functions take real API values', () => {
  it("statusPresentation takes a Story's status and phase as the API sends them", () => {
    const story: Api.Story = {
      key: 'PROJ-102',
      title: null,
      owner: 'jordan@example.com',
      phase: 'blocked',
      status: 'terminal',
      haltReason: null,
      budgetNanoAiu: 25_000_000_000,
      spentNanoAiu: 12_400_000_000,
      controlSha: '1890d5aa84819480275f79060cae5d529be21ee8',
      currentRunId: null,
      version: 7,
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:48:00.000Z',
    };
    expect(statusPresentation(story.status, story.phase).label).toBe('Blocked');
  });

  it('accepts the contract model plan fixture with its single review slot', () => {
    const plan: unknown = getStoryModels;
    if (!isModelPlan(plan))
      throw new Error('getStoryModels.json is not a ModelPlan');
    expect(Array.isArray(plan.slots)).toBe(true);
    expect(plan.slots.map((slot) => slot.slot)).toContain('review');
  });

  it('every status, outcome and effort source of the contract has a presentation, and none is neutral by accident', () => {
    const neutralOnPurpose = new Set(['queued', 'cancelled']);
    for (const value of [...Api.RUN_STATUSES, ...Api.GATE_OUTCOMES])
      if (!neutralOnPurpose.has(value))
        expect(outcomePresentation(value).modifier, value).not.toBe('queued');
    for (const status of Api.STORY_STATUSES)
      expect(statusPresentation(status, 'done').label, status).not.toBe('');
    expect(Object.keys(CREW).sort()).toEqual([...Api.MODEL_SLOTS].sort());
    expect(Object.keys(MODEL_SOURCE_LABELS).sort()).toEqual(
      [...Api.MODEL_SOURCES].sort()
    );
    expect(Object.keys(EFFORT_SOURCE_LABELS).sort()).toEqual(
      [...Api.EFFORT_SOURCES].sort()
    );
    expect(IN_PORT).toBe('terminal');
  });
  it('the planning modes and the planner endings of the domain are the contract’s', () => {
    expect([...PLANNING_MODES]).toEqual([...Api.PLANNING_MODES]);
    expect([...PANELIST_STATUSES]).toEqual([...Api.PANELIST_STATUSES]);
    expect(Api.PLANNING_MODES).toEqual(
      contract.components.schemas.PlanningMode.enum
    );
    expect(Api.PANELIST_STATUSES).toEqual(
      contract.components.schemas.PlanPanelMember.properties.status.enum
    );
  });

  it('planningModeOf takes a Story as the API sends it, with or without a planning mode', () => {
    const story: Api.Story = {
      key: 'PROJ-102',
      title: null,
      owner: 'jordan@example.com',
      phase: 'planning',
      status: 'running',
      haltReason: null,
      budgetNanoAiu: 25_000_000_000,
      spentNanoAiu: 0,
      controlSha: '1890d5aa84819480275f79060cae5d529be21ee8',
      currentRunId: null,
      version: 2,
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:48:00.000Z',
    };
    expect(planningModeOf(story)).toBe('standard');
    expect(planningModeOf({ ...story, planningMode: 'panel' })).toBe('panel');
  });

  it('the panel functions take a PlanPanel as the API sends it', () => {
    const panel: unknown = getRunPlanPanel;
    if (!isPlanPanel(panel))
      throw new Error('getRunPlanPanel.json is not a PlanPanel');
    expect(rankMembers(panel.members).map((m) => m.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(bestMembers(panel.members).map((m) => m.label)).toEqual(['A']);
    expect(panelSummaryLine(panel)).toBe(
      '2 of 3 planners finished, judged by claude-opus-5.5. Best draft: A, 8/10.'
    );
  });
});

describe('the domain limits that the contract states', () => {
  it('keeps the most a refinement and an agent diagnosis may be capped at equal to the contract’s maximum for each', () => {
    const schemas = contract.components.schemas;
    const maximum = (schema: {
      properties: { budgetNanoAiu: unknown };
    }): unknown =>
      (schema.properties.budgetNanoAiu as { maximum: number }).maximum;
    expect(maximum(schemas.RefinementRequest)).toBe(REFINEMENT_MAX_NANO_AIU);
    expect(maximum(schemas.AgentDiagnosisRequest)).toBe(
      AGENT_DIAGNOSIS_MAX_NANO_AIU
    );
  });
});
