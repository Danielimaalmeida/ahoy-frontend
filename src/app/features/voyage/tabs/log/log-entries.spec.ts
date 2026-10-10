import { describe, expect, it } from 'vitest';
import type { AhoyEvent } from '@core/api/types';
import {
  INITIAL_VISIBLE,
  PAGE_SIZE,
  logEntries,
  visibleCount,
} from './log-entries';

let nextId = 1;

/** An event `n` minutes after the start of the day, with the payload given. */
function event(
  type: string,
  payload: Record<string, unknown>,
  actor = 'ahoy-reconciler'
): AhoyEvent {
  const id = String(nextId++);
  const at = new Date(
    Date.UTC(2026, 9, 5, 10, 0) + nextId * 60_000
  ).toISOString();
  return {
    id,
    storyKey: 'PROJ-123',
    type,
    actor,
    payload: payload as AhoyEvent['payload'],
    createdAt: at,
  };
}

const link = (runId: string): string => `/voyages/PROJ-123/runs/${runId}`;

describe('logEntries', () => {
  it('lists the newest event first', () => {
    const entries = logEntries(
      [
        event('story.started', {}),
        event('story.resumed', {}),
        event('run.queued', {}),
      ],
      link
    );
    expect(entries.map((entry) => entry.title)).toEqual([
      'Run queued',
      'Resumed',
      'Voyage started',
    ]);
  });

  it('never lists run.progress', () => {
    const entries = logEntries(
      [
        event('run.dispatched', { runId: 'r-1', runtime: 'fake' }),
        event('run.progress', { runId: 'r-1', line: 1 }),
      ],
      link
    );
    expect(entries.map((entry) => entry.title)).toEqual(['Run dispatched']);
  });

  it('gives an entry its id, time, actor, dot and a link to its run', () => {
    const [entry] = logEntries(
      [event('run.dispatched', { runId: 'r-7', runtime: 'docker' })],
      link
    );
    expect(entry).toMatchObject({
      title: 'Run dispatched',
      details: 'on docker',
      actor: 'ahoy-reconciler',
      kind: 'system',
      run: { id: 'r-7', link: '/voyages/PROJ-123/runs/r-7' },
    });
    expect(entry?.id).toMatch(/^\d+$/);
  });

  it('leaves out the details and the run when the event has none', () => {
    const [entry] = logEntries([event('story.awaiting_input', {})], link);
    expect(entry).not.toHaveProperty('details');
    expect(entry).not.toHaveProperty('run');
  });

  it('counts the round of a gate from the send-backs before the wait', () => {
    const entries = logEntries(
      [
        event('story.awaiting_decision', {
          phase: 'plan_review',
          gate: 'plan_accepted',
        }),
        event(
          'decision.recorded',
          { gate: 'plan_accepted', decision: 'send_back', round: 1 },
          'jordan@example.com'
        ),
        event('story.awaiting_decision', {
          phase: 'plan_review',
          gate: 'plan_accepted',
        }),
      ],
      link
    );
    const waits = entries.filter(
      (entry) => entry.title === 'Waiting at the human gate'
    );
    expect(waits.map((entry) => entry.details)).toEqual([
      'plan_accepted, round 2',
      'plan_accepted, round 1',
    ]);
  });

  it('does not count an approval, or a send-back at another gate, as a round', () => {
    const entries = logEntries(
      [
        event(
          'decision.recorded',
          { gate: 'plan_accepted', decision: 'approve', round: 1 },
          'jordan@example.com'
        ),
        event(
          'decision.recorded',
          { gate: 'pr_accepted', decision: 'send_back', round: 1 },
          'jordan@example.com'
        ),
        event('story.awaiting_decision', {
          phase: 'plan_review',
          gate: 'plan_accepted',
        }),
      ],
      link
    );
    expect(entries[0]?.details).toBe('plan_accepted, round 1');
  });

  it('names the crew member of a finished run from its queued event', () => {
    const entries = logEntries(
      [
        event('run.queued', {
          runId: 'r-4',
          phase: 'planning',
          agent: 'cartographer',
          model: 'm',
          reasoningEffort: 'high',
        }),
        event('run.finished', {
          runId: 'r-4',
          status: 'succeeded',
          nanoAiu: 3_840_000_000,
          requests: 3,
        }),
      ],
      link
    );
    expect(entries[0]?.details).toBe('Cartographer · succeeded · 3.84 AIU');
  });

  it('does not name a crew for a run it never saw queued', () => {
    const [entry] = logEntries(
      [event('run.finished', { runId: 'r-9', status: 'failed', nanoAiu: 0 })],
      link
    );
    expect(entry?.details).toBe('failed · 0 AIU');
  });

  it('keeps an event of an unknown type, under its type', () => {
    const [entry] = logEntries(
      [event('story.teleported', { to: 'Mars' })],
      link
    );
    expect(entry).toMatchObject({
      title: 'story.teleported',
      details: 'to: Mars',
    });
  });
});

describe('visibleCount', () => {
  it('shows the newest 14 first, then 20 more per click, never more than there are', () => {
    expect(INITIAL_VISIBLE).toBe(14);
    expect(PAGE_SIZE).toBe(20);
    expect(visibleCount(100, 0)).toBe(14);
    expect(visibleCount(100, 1)).toBe(34);
    expect(visibleCount(100, 2)).toBe(54);
    expect(visibleCount(30, 1)).toBe(30);
    expect(visibleCount(5, 0)).toBe(5);
    expect(visibleCount(0, 3)).toBe(0);
  });
});
