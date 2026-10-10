import type { AhoyEvent } from '@core/api/types';
import {
  WORKER_LOG_MAX_BYTES,
  blockedAt,
  lastHalt,
  openGateKey,
  readHalt,
  revisingGateKey,
  tailLog,
} from './voyage-events';

let nextId = 1;

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = 'ahoy-reconciler'
): AhoyEvent {
  const id = nextId++;
  return {
    id: String(id),
    storyKey: 'PROJ-118',
    type,
    actor,
    payload,
    createdAt: `2026-10-06T08:${String(id % 60).padStart(2, '0')}:00.000Z`,
  };
}

describe('readHalt', () => {
  it('reads the reason, run, phase, detail and worker log of a story.halted', () => {
    const halt = readHalt(
      event('story.halted', {
        reason: 'run_failed',
        runId: 'r-03',
        phase: 'planning',
        detail: ' preflight: model gpt-5.6-terra is not enabled ',
        workerLog: 'line 1\nline 2\n',
      })
    );
    expect(halt).toMatchObject({
      reason: 'run_failed',
      runId: 'r-03',
      phase: 'planning',
      detail: 'preflight: model gpt-5.6-terra is not enabled',
      workerLog: 'line 1\nline 2',
      actor: 'ahoy-reconciler',
    });
  });

  it('reads fields of the wrong type as absent rather than failing', () => {
    const halt = readHalt(
      event('story.halted', {
        reason: 'run_lost',
        runId: 42,
        detail: { x: 1 },
        workerLog: [],
      })
    );
    expect(halt).toMatchObject({
      reason: 'run_lost',
      runId: null,
      phase: null,
      detail: null,
      workerLog: null,
    });
  });

  it('gives null for a halt without a reason', () => {
    expect(readHalt(event('story.halted', { detail: '?' }))).toBeNull();
    expect(readHalt(event('story.halted', { reason: '  ' }))).toBeNull();
  });
});

describe('lastHalt', () => {
  it('takes the newest story.halted of the history', () => {
    const events = [
      event('story.halted', { reason: 'stopped_by_user', detail: 'first' }),
      event('story.resumed', {}),
      event('story.halted', { reason: 'run_failed', detail: 'second' }),
      event('run.queued', {}),
    ];
    expect(lastHalt(events)?.detail).toBe('second');
  });

  it('gives null for a voyage that never halted', () => {
    expect(lastHalt([event('story.started', {})])).toBeNull();
    expect(lastHalt([])).toBeNull();
  });
});

describe('tailLog', () => {
  it('keeps the last 20 lines', () => {
    const log = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join(
      '\n'
    );
    const tail = tailLog(log).split('\n');
    expect(tail).toHaveLength(20);
    expect(tail[0]).toBe('line 11');
    expect(tail.at(-1)).toBe('line 30');
  });

  it('keeps at most the last 4 KB', () => {
    const log = `${'a'.repeat(5000)}\nend`;
    const tail = tailLog(log);
    expect(new TextEncoder().encode(tail).length).toBeLessThanOrEqual(
      WORKER_LOG_MAX_BYTES
    );
    expect(tail.endsWith('\nend')).toBe(true);
  });

  it('counts the 4 KB in bytes, and never starts with half a character', () => {
    const tail = tailLog('é'.repeat(3000));
    expect(new TextEncoder().encode(tail).length).toBeLessThanOrEqual(
      WORKER_LOG_MAX_BYTES
    );
    expect(tail).toMatch(/^é+$/);
  });

  it('drops trailing blank lines and reads Windows line ends', () => {
    expect(tailLog('one\r\ntwo\r\n\r\n')).toBe('one\ntwo');
  });
});

describe('openGateKey', () => {
  it('takes the gate of the last story.awaiting_decision (G11)', () => {
    const events = [
      event('story.awaiting_decision', {
        phase: 'plan_review',
        gate: 'plan_accepted',
      }),
      event('story.awaiting_decision', {
        phase: 'delivery_gate',
        gate: 'delivery_accepted',
      }),
    ];
    expect(openGateKey(events, 'delivery_gate')).toBe('delivery_accepted');
  });

  it('falls back to the gate named after the phase', () => {
    expect(openGateKey([], 'plan_review')).toBe('plan_accepted');
    expect(openGateKey([], 'delivery_gate')).toBe('delivery_accepted');
    expect(
      openGateKey(
        [event('story.awaiting_decision', { gate: 7 })],
        'plan_review'
      )
    ).toBe('plan_accepted');
  });

  it('gives null when neither the history nor the phase names a gate', () => {
    expect(openGateKey([], 'implementation')).toBeNull();
    expect(openGateKey([], 'hasOwnProperty')).toBeNull();
  });
});

describe('revisingGateKey', () => {
  const waited = event('story.awaiting_decision', {
    phase: 'plan_review',
    gate: 'plan_accepted',
  });

  it('takes the last gate while the voyage is back before it (a plan sent back to planning)', () => {
    expect(revisingGateKey([waited, event('run.queued', {})], 'planning')).toBe(
      'plan_accepted'
    );
  });

  it('gives null once the voyage has passed the gate, or if it never waited on one', () => {
    expect(revisingGateKey([waited], 'implementation')).toBeNull();
    expect(revisingGateKey([waited], 'blocked')).toBeNull();
    expect(revisingGateKey([event('run.queued', {})], 'planning')).toBeNull();
    expect(
      revisingGateKey(
        [event('story.awaiting_decision', { gate: 'plan_accepted' })],
        'planning'
      )
    ).toBeNull();
  });
});

describe('blockedAt', () => {
  it('takes the from of the last phase change to blocked (G12)', () => {
    const events = [
      event('story.phase_changed', { from: 'intake', to: 'planning' }),
      event('story.phase_changed', { from: 'planning', to: 'plan_review' }),
      event('story.phase_changed', { from: 'plan_review', to: 'blocked' }),
    ];
    expect(blockedAt(events)).toBe('plan_review');
  });

  it('gives null without a change to blocked', () => {
    expect(
      blockedAt([
        event('story.phase_changed', { from: 'intake', to: 'planning' }),
      ])
    ).toBeNull();
  });
});
