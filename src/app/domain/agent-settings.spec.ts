import { describe, expect, it } from 'vitest';
import {
  AGENT_JOB_WORDS,
  describeAgentEvent,
  jobsOnLabel,
  jobsTurnedOn,
  knowledgeRepoProblem,
  type AgentJobChoice,
} from './agent-settings';
import { describeSettingsEvent } from './settings';

const SAVED: AgentJobChoice = {
  refinementAgent: 'story-refiner',
  diagnosisAgent: 'halt-diagnoser',
  storyDraftAgent: null,
  knowledgeAgent: null,
};

describe('the agents’ jobs', () => {
  it('list the four jobs, and only Story drafts and Business-rule review can be off', () => {
    expect(AGENT_JOB_WORDS.map((j) => [j.name, j.optional])).toEqual([
      ['Pre-refinement', false],
      ['Halt diagnosis', false],
      ['Story drafts', true],
      ['Business-rule review', true],
    ]);
  });

  it('find the jobs a change turns on, which saving asks to confirm, but not a change of profile', () => {
    expect(
      jobsTurnedOn(SAVED, {
        ...SAVED,
        knowledgeAgent: 'knowledge-curator',
      }).map((j) => j.key)
    ).toEqual(['knowledgeAgent']);
    expect(
      jobsTurnedOn(SAVED, {
        ...SAVED,
        storyDraftAgent: 'story-drafter',
        knowledgeAgent: 'knowledge-curator',
      }).map((j) => j.key)
    ).toEqual(['storyDraftAgent', 'knowledgeAgent']);
    const on = { ...SAVED, knowledgeAgent: 'knowledge-curator' };
    expect(
      jobsTurnedOn(on, { ...on, knowledgeAgent: 'knowledge-curator-v2' })
    ).toEqual([]);
    expect(jobsTurnedOn(on, SAVED)).toEqual([]);
    expect(
      jobsTurnedOn(SAVED, { ...SAVED, refinementAgent: 'story-refiner-v2' })
    ).toEqual([]);
  });

  it('warn that each job spends AIU outside a story’s budget, and count the jobs on', () => {
    for (const job of AGENT_JOB_WORDS)
      if (job.optional) expect(job.warning).toMatch(/spends AIU outside/);
      else expect(job.warning).toBeNull();
    expect(jobsOnLabel(SAVED)).toBe('2 of 4 on');
    expect(
      jobsOnLabel({
        ...SAVED,
        storyDraftAgent: 'story-drafter',
        knowledgeAgent: 'x',
      })
    ).toBe('4 of 4 on');
  });

  it('take a knowledge repository as owner/name, or nothing', () => {
    expect(knowledgeRepoProblem('')).toBeNull();
    expect(knowledgeRepoProblem(' acme/business-rules ')).toBeNull();
    for (const bad of [
      'acme',
      'acme/rules/more',
      'https://github.com/acme/rules',
      '../rules',
      'acme/..',
      'a b/c',
    ])
      expect(knowledgeRepoProblem(bad), bad).toMatch(/owner\/name/);
    expect(knowledgeRepoProblem(`acme/${'r'.repeat(200)}`)).toMatch(
      /owner\/name/
    );
  });
});

describe('the Agents entries of the settings history', () => {
  it('name each job by its name and say when the change was confirmed to spend AIU', () => {
    expect(
      describeSettingsEvent('agent_settings.updated', {
        changes: {
          knowledgeAgent: { from: null, to: 'knowledge-curator' },
          knowledgeRepo: { from: null, to: 'acme/business-rules' },
        },
        confirmSpend: true,
      })
    ).toBe(
      'Business-rule review: off → knowledge-curator; Knowledge repository: none → acme/business-rules (confirmed it spends AIU)'
    );
    expect(
      describeAgentEvent('agent_settings.updated', {
        changes: {
          refinementAgent: { from: 'story-refiner', to: 'story-refiner-v2' },
        },
      })
    ).toBe('Pre-refinement: story-refiner → story-refiner-v2');
  });

  it('read a broken payload as a plain sentence, and leave other sections alone', () => {
    expect(describeAgentEvent('agent_settings.updated', [])).toBe(
      'Saved the agents’ jobs'
    );
    expect(
      describeAgentEvent('agent_settings.updated', {
        changes: { other: { from: 1, to: 2 } },
      })
    ).toBe('other: off → off');
    expect(describeAgentEvent('figma_settings.updated', {})).toBeUndefined();
  });
});
