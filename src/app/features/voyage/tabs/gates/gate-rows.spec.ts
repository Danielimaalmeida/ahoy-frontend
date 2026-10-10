import { describe, expect, it } from 'vitest';
import type { GateRecord } from '@core/api/types';
import { oldestFirst, sourceLabel, waitingRow } from './gate-rows';

function record(
  id: string,
  createdAt: string,
  overrides: Partial<GateRecord> = {}
): GateRecord {
  return {
    id,
    source: 'gate',
    gate: 'plan',
    phase: 'planning',
    outcome: 'pass',
    message: null,
    actor: 'ahoy-reconciler',
    runId: null,
    createdAt,
    ...overrides,
  };
}

describe('oldestFirst', () => {
  it("sorts by time, keeps the API's order for records made together, and leaves its input alone", () => {
    const input = [
      record('c', '2026-10-05T16:40:00Z'),
      record('a', '2026-10-05T10:06:00Z'),
      record('b1', '2026-10-05T14:12:00Z'),
      record('b2', '2026-10-05T14:12:00Z'),
    ];
    expect(oldestFirst(input).map((r) => r.id)).toEqual(['a', 'b1', 'b2', 'c']);
    expect(input.map((r) => r.id)).toEqual(['c', 'a', 'b1', 'b2']);
  });

  it('keeps a record whose time cannot be read, in place', () => {
    const list = [
      record('a', 'not a time'),
      record('b', '2026-10-05T14:12:00Z'),
    ];
    expect(oldestFirst(list).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('sourceLabel', () => {
  it('says Automated for a gate and Human for a person, and shows an unknown source as it came', () => {
    expect(sourceLabel('gate')).toBe('Automated');
    expect(sourceLabel('human')).toBe('Human');
    expect(sourceLabel('robot')).toBe('robot');
    expect(sourceLabel('constructor')).toBe('constructor');
  });
});

describe('waitingRow', () => {
  const waiting = {
    status: 'awaiting_decision',
    phase: 'plan_review',
  } as const;

  it('says which round of how many is open', () => {
    expect(waitingRow(waiting, 'plan_accepted', 2, 4)).toEqual({
      phase: 'plan_review',
      gate: 'plan_accepted',
      message: 'Round 2 of 4 is open.',
    });
  });

  it('says less, not a guessed number, while the round or the ceiling is unknown', () => {
    expect(waitingRow(waiting, 'plan_accepted', 2, null)?.message).toBe(
      'Round 2 is open.'
    );
    expect(waitingRow(waiting, 'plan_accepted', null, 4)?.message).toBe(
      'Waiting for a human decision.'
    );
  });

  it('is absent unless the voyage is awaiting a decision at a known gate', () => {
    expect(
      waitingRow(
        { status: 'running', phase: 'planning' },
        'plan_accepted',
        1,
        4
      )
    ).toBeNull();
    expect(
      waitingRow(
        { status: 'halted', phase: 'plan_review' },
        'plan_accepted',
        1,
        4
      )
    ).toBeNull();
    expect(waitingRow(waiting, null, 1, 4)).toBeNull();
    expect(waitingRow(null, 'plan_accepted', 1, 4)).toBeNull();
  });
});
