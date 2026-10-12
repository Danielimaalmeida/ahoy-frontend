import type { RuntimeStatus } from './types';
import { workerStartup } from './worker-startup';

const observation = (state: RuntimeStatus['state']): RuntimeStatus => ({
  state,
  reason: null,
  message: null,
  observedAt: new Date().toISOString(),
});

describe('workerStartup', () => {
  it('replaces a stale node wait with unavailable status at thirty seconds', () => {
    const runtimeStatus = {
      ...observation('waiting_for_node'),
      observedAt: '2026-10-12T08:00:00.000Z',
    };
    expect(
      workerStartup(
        { status: 'running', runtimeStatus },
        new Date('2026-10-12T08:00:29.999Z')
      )?.detail
    ).toContain('new node');
    const stale = workerStartup(
      { status: 'running', runtimeStatus },
      new Date('2026-10-12T08:00:30.000Z')
    );
    expect(stale?.heading).toBe('Worker status unavailable');
    expect(stale?.detail).not.toContain('new node');
    expect(stale?.evidence).toBe('');
  });
  it('names a new node only when autoscaling is confirmed', () => {
    const waiting = workerStartup({
      status: 'running',
      runtimeStatus: observation('waiting_for_node'),
    });
    expect(waiting?.detail).toContain('Waiting for a new node');
    for (const state of [
      'starting',
      'scheduling',
      'blocked',
      'unknown',
    ] as const) {
      expect(
        workerStartup({ status: 'running', runtimeStatus: observation(state) })
          ?.detail
      ).not.toContain('new node');
    }
  });

  it('keeps absent or null observations compatible with the old backend', () => {
    expect(workerStartup({ status: 'running' })).toBeNull();
    expect(workerStartup({ status: 'queued', runtimeStatus: null })).toBeNull();
  });

  it('removes startup feedback once the worker runs, is cancelled or the lifecycle ends', () => {
    expect(
      workerStartup({
        status: 'running',
        runtimeStatus: observation('running'),
      })
    ).toBeNull();
    expect(
      workerStartup({
        status: 'running',
        cancelRequested: true,
        runtimeStatus: observation('waiting_for_node'),
      })
    ).toBeNull();
    for (const status of [
      'cancelled',
      'succeeded',
      'failed',
      'awaiting_input',
      'lost',
    ]) {
      expect(
        workerStartup({
          status,
          runtimeStatus: observation('waiting_for_node'),
        })
      ).toBeNull();
    }
  });

  it('states blocked and unavailable observations honestly and preserves their evidence', () => {
    const runtimeStatus = {
      ...observation('unknown'),
      reason: 'RuntimeObservationFailed',
      message: 'Could not read events',
    };
    expect(workerStartup({ status: 'running', runtimeStatus })).toEqual({
      heading: 'Worker status unavailable',
      detail: 'Could not confirm whether the worker has started.',
      evidence: 'RuntimeObservationFailed · Could not read events',
    });
    expect(
      workerStartup({
        status: 'running',
        runtimeStatus: observation('blocked'),
      })?.heading
    ).toBe('Worker startup is blocked');
  });
});
