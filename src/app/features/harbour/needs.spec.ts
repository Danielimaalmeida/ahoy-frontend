import { readStoryState } from '@core/api/story-state';
import type { Question, Story } from '@core/api/types';
import { aStory, anEvent } from '@core/realtime/testing/events';
import {
  atSeaCrew,
  crewOfPhase,
  gateOpen,
  haltOf,
  needsAction,
  whatsNeeded,
  type RowDetail,
} from './needs';

const NONE: RowDetail = {
  questions: null,
  state: null,
  gate: null,
  halt: null,
};

function question(id: string, round: number, answered: boolean): Question {
  return {
    id,
    round,
    runId: 'proj-131-planning-001-aaaa',
    text: `Question ${id}?`,
    recommendation: null,
    answer: answered ? 'An answer.' : null,
    answeredBy: answered ? 'sam@example.com' : null,
    answeredAt: answered ? '2026-10-06T09:30:00.000Z' : null,
    consumed: false,
  };
}

describe('crewOfPhase', () => {
  it('names the crew member of each phase, including the one Lookout for pr_review', () => {
    expect(crewOfPhase('intake')).toBe('Navigator');
    expect(crewOfPhase('planning')).toBe('Cartographer');
    expect(crewOfPhase('implementation')).toBe('Implementer');
    expect(crewOfPhase('pr_review')).toBe('Lookout');
  });

  it('falls back to the API word for a phase it does not know', () => {
    expect(crewOfPhase('quality_gate')).toBe('quality_gate');
  });
});

describe('whatsNeeded: Crew asks', () => {
  const story = aStory('PROJ-131', {
    status: 'awaiting_input',
    phase: 'planning',
  });

  it('says who asked, how many questions, the round and how many are answered', () => {
    const questions = [
      question('Q1', 1, true),
      question('Q2', 1, false),
      question('Q3', 1, false),
    ];
    expect(whatsNeeded(story, { ...NONE, questions })).toEqual({
      headline: 'Cartographer asked 3 questions',
      sub: 'Round 1 · 1 of 3 answered',
    });
  });

  it('counts only the latest round, which is the one waiting for answers', () => {
    const questions = [
      question('Q1', 1, true),
      question('Q2', 1, true),
      question('Q3', 2, false),
    ];
    expect(whatsNeeded(story, { ...NONE, questions })).toEqual({
      headline: 'Cartographer asked 1 question',
      sub: 'Round 2 · 0 of 1 answered',
    });
  });

  it('still says the crew is waiting while the questions are not read yet', () => {
    expect(whatsNeeded(story, NONE)).toEqual({
      headline: 'Cartographer is waiting for answers',
      sub: null,
    });
    expect(whatsNeeded(story, { ...NONE, questions: [] })).toEqual({
      headline: 'Cartographer is waiting for answers',
      sub: null,
    });
  });

  it('names the Navigator when intake is the phase that asks', () => {
    const intake = aStory('PROJ-132', {
      status: 'awaiting_input',
      phase: 'intake',
    });
    expect(
      whatsNeeded(intake, { ...NONE, questions: [question('Q1', 1, false)] })
        .headline
    ).toBe('Navigator asked 1 question');
  });
});

describe('whatsNeeded: Your orders', () => {
  const story = aStory('PROJ-123', {
    status: 'awaiting_decision',
    phase: 'plan_review',
  });

  it('says the plan is ready, with the gate and the revision round from the story state', () => {
    const state = readStoryState({
      revisions: { plan_accepted: 1 },
      revision_ceiling: 4,
    });
    expect(
      whatsNeeded(story, { ...NONE, state, gate: 'plan_accepted' })
    ).toEqual({
      headline: 'The plan is ready for review',
      sub: 'Gate plan_accepted · revision round 2 of 4',
    });
  });

  it('starts at round 1 when nothing was sent back, and uses the default ceiling of 4', () => {
    const state = readStoryState({});
    expect(
      whatsNeeded(story, { ...NONE, state, gate: 'plan_accepted' }).sub
    ).toBe('Gate plan_accepted · revision round 1 of 4');
  });

  it('uses the ceiling the state sets', () => {
    const state = readStoryState({
      revisions: { plan_accepted: 2 },
      revision_ceiling: 6,
    });
    expect(
      whatsNeeded(story, { ...NONE, state, gate: 'plan_accepted' }).sub
    ).toBe('Gate plan_accepted · revision round 3 of 6');
  });

  it('names the gate of the phase when no awaiting_decision event is known (G11)', () => {
    expect(whatsNeeded(story, NONE)).toEqual({
      headline: 'The plan is ready for review',
      sub: 'Gate plan_accepted',
    });
    const delivery = aStory('PROJ-124', {
      status: 'awaiting_decision',
      phase: 'delivery_gate',
    });
    expect(whatsNeeded(delivery, NONE)).toEqual({
      headline: 'The delivery is ready for review',
      sub: 'Gate delivery_accepted',
    });
  });

  it('does not guess when the gate is unknown', () => {
    const other = aStory('PROJ-125', {
      status: 'awaiting_decision',
      phase: 'something_new',
    });
    expect(whatsNeeded(other, NONE)).toEqual({
      headline: 'A decision is waiting',
      sub: null,
    });
    expect(whatsNeeded(other, { ...NONE, gate: 'new_gate' })).toEqual({
      headline: 'A decision is waiting',
      sub: 'Gate new_gate',
    });
  });
});

describe('whatsNeeded: Anchored', () => {
  it("uses the short text of the halt reason and the API code with the event's detail", () => {
    const story = aStory('PROJ-118', {
      status: 'halted',
      haltReason: 'run_failed',
    });
    expect(
      whatsNeeded(story, {
        ...NONE,
        halt: {
          reason: 'run_failed',
          detail: 'the worker refused the model (0 AIU)',
        },
      })
    ).toEqual({
      headline:
        "A crew member's run failed, for example a refused model or a crash.",
      sub: 'run_failed · the worker refused the model (0 AIU)',
    });
  });

  it('quotes the words of the person who stopped the voyage', () => {
    const story = aStory('PROJ-126', {
      status: 'halted',
      haltReason: 'stopped_by_user',
    });
    expect(
      whatsNeeded(story, {
        ...NONE,
        halt: {
          reason: 'stopped_by_user',
          detail: 'Waiting for the Jira ticket to be split',
        },
      })
    ).toEqual({
      headline: 'Someone on the crew stopped it.',
      sub: 'stopped_by_user · "Waiting for the Jira ticket to be split"',
    });
  });

  it('shows only the code while the event is not read, and when it has no detail', () => {
    const story = aStory('PROJ-118', {
      status: 'halted',
      haltReason: 'budget_exhausted',
    });
    expect(whatsNeeded(story, NONE).sub).toBe('budget_exhausted');
    expect(
      whatsNeeded(story, {
        ...NONE,
        halt: { reason: 'budget_exhausted', detail: null },
      }).sub
    ).toBe('budget_exhausted');
  });

  it('shows a reason it does not know as the API sent it, never as a verdict', () => {
    const story = aStory('PROJ-119', {
      status: 'halted',
      haltReason: 'cosmic_rays',
    });
    expect(whatsNeeded(story, NONE)).toEqual({
      headline: 'cosmic_rays',
      sub: null,
    });
    expect(
      whatsNeeded(story, {
        ...NONE,
        halt: { reason: 'cosmic_rays', detail: 'A bit flipped.' },
      })
    ).toEqual({
      headline: 'cosmic_rays',
      sub: 'A bit flipped.',
    });
  });

  it('says the voyage is halted when the API gave no reason', () => {
    const story = aStory('PROJ-120', { status: 'halted', haltReason: null });
    expect(whatsNeeded(story, NONE)).toEqual({
      headline: 'The voyage is halted',
      sub: null,
    });
  });
});

describe('haltOf', () => {
  it('reads the reason and detail of the last story.halted event', () => {
    const events = [
      anEvent(
        1,
        'story.halted',
        { reason: 'run_failed', detail: 'First time.' },
        'PROJ-118'
      ),
      anEvent(2, 'story.resumed', {}, 'PROJ-118'),
      anEvent(
        3,
        'story.halted',
        { reason: 'stopped_by_user', detail: '  Second time.  ' },
        'PROJ-118'
      ),
      anEvent(4, 'run.queued', {}, 'PROJ-118'),
    ];
    expect(haltOf(events)).toEqual({
      reason: 'stopped_by_user',
      detail: 'Second time.',
    });
  });

  it('gives null when there is none, and treats a payload of the wrong shape as having no detail', () => {
    expect(haltOf([])).toBeNull();
    expect(
      haltOf([anEvent(1, 'story.halted', { reason: 7, detail: { x: 1 } })])
    ).toEqual({
      reason: null,
      detail: null,
    });
  });
});

describe('gateOpen', () => {
  it('reads the gate of the last story.awaiting_decision event (G11)', () => {
    const events = [
      anEvent(1, 'story.awaiting_decision', {
        phase: 'plan_review',
        gate: 'plan_accepted',
      }),
      anEvent(2, 'decision.recorded', { gate: 'plan_accepted' }),
      anEvent(3, 'story.awaiting_decision', {
        phase: 'delivery_gate',
        gate: 'delivery_accepted',
      }),
    ];
    expect(gateOpen(events)).toBe('delivery_accepted');
  });

  it('gives null when there is none or the payload has no gate', () => {
    expect(gateOpen([])).toBeNull();
    expect(
      gateOpen([anEvent(1, 'story.awaiting_decision', { gate: 3 })])
    ).toBeNull();
  });
});

describe('needsAction', () => {
  it('answers questions with a primary Answer that opens the Questions tab', () => {
    const story = aStory('PROJ-131', { status: 'awaiting_input' });
    expect(needsAction(story, null)).toEqual({
      label: 'Answer',
      variant: 'primary',
      link: ['/voyages', 'PROJ-131', 'questions'],
    });
  });

  it('reviews the plan at plan_accepted with a primary button that opens the Plan tab', () => {
    const story = aStory('PROJ-123', {
      status: 'awaiting_decision',
      phase: 'plan_review',
    });
    expect(needsAction(story, 'plan_accepted')).toEqual({
      label: 'Review plan',
      variant: 'primary',
      link: ['/voyages', 'PROJ-123', 'plan'],
    });
  });

  it('falls back to the gate of the phase, and says Decide for any other gate', () => {
    const plan = aStory('PROJ-123', {
      status: 'awaiting_decision',
      phase: 'plan_review',
    });
    expect(needsAction(plan, null).label).toBe('Review plan');
    const delivery = aStory('PROJ-124', {
      status: 'awaiting_decision',
      phase: 'delivery_gate',
    });
    expect(needsAction(delivery, 'delivery_accepted')).toEqual({
      label: 'Decide',
      variant: 'primary',
      link: ['/voyages', 'PROJ-124'],
    });
    expect(needsAction(delivery, null).label).toBe('Decide');
  });

  it('reviews and resumes an anchored voyage with a secondary button that opens the Models tab', () => {
    const story = aStory('PROJ-118', { status: 'halted' });
    expect(needsAction(story, null)).toEqual({
      label: 'Review & resume',
      variant: 'default',
      link: ['/voyages', 'PROJ-118', 'models'],
    });
  });
});

describe('atSeaCrew', () => {
  const running: Story = aStory('PROJ-140', {
    status: 'running',
    phase: 'planning',
  });

  it('names the crew member and, once the run is known, its model and effort', () => {
    expect(
      atSeaCrew(running, { model: 'claude-sonnet-5', reasoningEffort: 'high' })
    ).toEqual({
      member: 'Cartographer',
      runtime: 'claude-sonnet-5 · high',
    });
  });

  it('shows only the model when the run has no effort, and nothing before the run is known', () => {
    expect(
      atSeaCrew(running, { model: 'claude-sonnet-5', reasoningEffort: null })
        .runtime
    ).toBe('claude-sonnet-5');
    expect(atSeaCrew(running, null)).toEqual({
      member: 'Cartographer',
      runtime: null,
    });
    expect(
      atSeaCrew(running, { model: null, reasoningEffort: 'high' }).runtime
    ).toBeNull();
  });

  it('says who goes next for a queued voyage', () => {
    const queued = aStory('PROJ-109', { status: 'ready', phase: 'intake' });
    expect(atSeaCrew(queued, null)).toEqual({
      member: 'Navigator goes next',
      runtime: null,
    });
  });
});
