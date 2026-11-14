import { describe, expect, it } from 'vitest';
import {
  agentMcpLabel,
  aiuLabel,
  capsRaised,
  describePhaseEvent,
  isStoryPhase,
  MAX_TIMEOUT_MINUTES,
  mcpServersLabel,
  minutesLabel,
  MIN_TIMEOUT_MINUTES,
  phaseName,
  readBudget,
  readMinutes,
} from './phase-settings';
import { describeSettingsEvent } from './settings';

const AIU = 1_000_000_000;

describe('the phases in words', () => {
  it('names the known phases and keeps the name of one the deployment adds', () => {
    expect(phaseName('pr_review')).toBe('Review');
    expect(phaseName('refinement')).toBe('Pre-refinement');
    expect(phaseName('security_scan')).toBe('security_scan');
  });

  it("says which MCP servers a phase's runs get and where they come from", () => {
    expect(
      mcpServersLabel({ from: 'deployment', names: ['Jira', 'Confluence'] })
    ).toBe('MCP servers: Jira, Confluence (set by the deployment)');
    expect(mcpServersLabel({ from: 'built_in', names: ['density-mcp'] })).toBe(
      'MCP servers: density-mcp (built in)'
    );
    expect(mcpServersLabel({ from: 'profile', names: [] })).toBe(
      "MCP servers: the agent profile's own"
    );
    expect(mcpServersLabel({ from: 'none', names: [] })).toBe(
      'MCP servers: none'
    );
    expect(
      agentMcpLabel({ agent: 'planner', servers: ['Jira', 'Confluence'] })
    ).toBe('planner: Jira, Confluence');
  });

  it("tells a story's phases from the agents' jobs outside one", () => {
    expect(isStoryPhase('implementation')).toBe(true);
    expect(isStoryPhase('diagnosis')).toBe(false);
  });

  it('writes AIU without trailing zeros and minutes as hours once past one', () => {
    expect(aiuLabel(60 * AIU)).toBe('60 AIU');
    expect(aiuLabel(2_500_000_000)).toBe('2.5 AIU');
    expect(aiuLabel(100_000_000)).toBe('0.1 AIU');
    expect(minutesLabel(15)).toBe('15 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(90)).toBe('1 h 30 min');
  });
});

describe('what an admin types', () => {
  it('takes a whole number of minutes within the limits, and says why it refuses one', () => {
    expect(
      readMinutes(' 30 ', MIN_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES)
    ).toEqual({ minutes: 30 });
    expect(readMinutes('1.5', 1, 60)).toEqual({
      problem: 'Give a whole number of minutes.',
    });
    expect(readMinutes('', 1, 60)).toEqual({
      problem: 'Give a whole number of minutes.',
    });
    expect(readMinutes('0', 1, 60)).toEqual({
      problem: 'Give 1 to 60 minutes.',
    });
    expect(readMinutes('61', 1, 60)).toEqual({
      problem: 'Give 1 to 60 minutes.',
    });
  });

  it('reads an AIU cap without floats, from 0.1 AIU to the cap', () => {
    expect(readBudget('2.5', 100 * AIU)).toEqual({ nanoAiu: 2_500_000_000 });
    expect(readBudget('100', 100 * AIU)).toEqual({ nanoAiu: 100 * AIU });
    expect(readBudget('lots', 100 * AIU)).toEqual({
      problem: 'Give an amount of AIU, such as 25 or 2.5.',
    });
    expect(readBudget('0.05', 100 * AIU)).toEqual({
      problem: 'Give at least 0.1 AIU.',
    });
    expect(readBudget('101', 100 * AIU)).toEqual({
      problem: 'The most allowed is 100 AIU.',
    });
  });

  it('finds the changes that raise a cap, and only those', () => {
    expect(
      capsRaised([
        { phase: 'design', from: 10 * AIU, to: 5 * AIU },
        { phase: 'planning', from: 60 * AIU, to: 80 * AIU },
        { phase: 'pr_review', from: 30 * AIU, to: 30 * AIU },
      ])
    ).toEqual([{ phase: 'planning', from: 60 * AIU, to: 80 * AIU }]);
  });
});

describe('an entry of the phases’ history', () => {
  it('says each field that changed, in words, and a confirmed higher cap', () => {
    const payload = {
      changes: {
        'planning.budgetNanoAiu': {
          from: 60 * AIU,
          to: 80 * AIU,
          ranOn: 60 * AIU,
          runsOn: 80 * AIU,
        },
        'planning.model': { from: null, to: 'claude-sonnet-5' },
        'implementation.timeoutSeconds': { from: 3600, to: 5400 },
        'implementation.ciWaitMinutes': { from: 30, to: null },
      },
      confirmSpend: true,
    };
    expect(describePhaseEvent('phase_settings.updated', payload)).toBe(
      'Planning AIU cap per run: 60 AIU → 80 AIU; Planning model: the deployment’s → claude-sonnet-5; ' +
        'Implementation timeout: 1 h → 1 h 30 min; Implementation wait for CI: 30 min → the deployment’s ' +
        '(confirmed the higher AIU cap)'
    );
  });

  it('says the catalogue it saved or gave back, and reads a payload it does not know without failing', () => {
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: {
          models: { from: null, to: ['claude-sonnet-5', 'gpt-5.6-luna'] },
        },
      })
    ).toBe('Models: the built-in list → claude-sonnet-5, gpt-5.6-luna');
    expect(describePhaseEvent('phase_settings.updated', 'odd')).toBe(
      'Saved the phases'
    );
    expect(describePhaseEvent('phase_settings.defaults_kept', {})).toBe(
      'Kept the defaults (from Setup)'
    );
    expect(describePhaseEvent('agent_settings.updated', {})).toBeUndefined();
  });

  it('says a plan panel set or given back as its planners and judge, not [object Object]', () => {
    const panel = {
      panelists: [
        { model: 'claude-sonnet-5', reasoningEffort: 'high' },
        { model: 'gpt-5.6-luna' },
      ],
      judge: { models: ['claude-opus-5', 'claude-sonnet-5'] },
    };
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: { planPanel: { from: null, to: panel } },
      })
    ).toBe(
      'Plan panel: the default panel → 2 planners (claude-sonnet-5 (high), gpt-5.6-luna), ' +
        'judge claude-opus-5 or claude-sonnet-5'
    );
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: { planPanel: { from: panel, to: null } },
      })
    ).toBe(
      'Plan panel: 2 planners (claude-sonnet-5 (high), gpt-5.6-luna), ' +
        'judge claude-opus-5 or claude-sonnet-5 → the default panel'
    );
  });

  it('says only the part of a saved plan panel that changed', () => {
    const before = {
      panelists: [{ model: 'a' }, { model: 'b' }],
      judge: { models: ['j'], reasoningEffort: 'high' },
    };
    const morePlanners = {
      ...before,
      panelists: [...before.panelists, { model: 'c' }],
    };
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: { planPanel: { from: before, to: morePlanners } },
      })
    ).toBe('Plan panel planners: a, b → a, b, c');
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: {
          planPanel: {
            from: before,
            to: {
              ...before,
              judge: { models: ['k'], reasoningEffort: 'medium' },
            },
          },
        },
      })
    ).toBe('Plan panel judge: j (high) → k (medium)');
    expect(
      describePhaseEvent('phase_settings.updated', {
        changes: { planPanel: { from: before, to: { ...before } } },
      })
    ).toBe('Saved the plan panel');
  });

  it('never shows [object Object] for a value it does not know', () => {
    const text = describePhaseEvent('phase_settings.updated', {
      changes: {
        planPanel: { from: { odd: 1 }, to: null },
        somethingNew: { from: { a: 1 }, to: 2 },
      },
    });
    expect(text).toBe(
      'Plan panel: a panel this page cannot read → the default panel; somethingNew: {"a":1} → 2'
    );
  });

  it('is what the settings history shows for a Phases entry', () => {
    expect(describeSettingsEvent('phase_settings.updated', {})).toBe(
      'Saved the phases'
    );
  });
});
