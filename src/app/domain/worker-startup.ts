import type { RuntimeStatus } from './types';

/** Startup information is separate from the run lifecycle: holding a slot does not mean the worker is ready. */
export interface WorkerStartup {
  readonly heading: string;
  readonly detail: string;
  readonly evidence: string;
}

/** Explains an observed startup state, never inferring node creation from a generic pending worker. */
export function workerStartup(
  run: {
    readonly status: string;
    readonly cancelRequested?: boolean;
    readonly runtimeStatus?: RuntimeStatus | null;
  },
  now = new Date()
): WorkerStartup | null {
  if (
    (run.status !== 'queued' && run.status !== 'running') ||
    run.cancelRequested
  )
    return null;
  const runtime = run.runtimeStatus;
  if (runtime === undefined || runtime === null || runtime.state === 'running')
    return null;
  if (now.getTime() - Date.parse(runtime.observedAt) >= 30_000)
    return {
      heading: 'Worker status unavailable',
      detail:
        'The last worker update is out of date. Waiting for a fresh update.',
      evidence: '',
    };
  const evidence = [runtime.reason, runtime.message]
    .filter((value) => value !== null && value !== '')
    .join(' · ');
  switch (runtime.state) {
    case 'starting':
      return {
        heading: 'Creating the worker',
        detail: 'The worker is starting.',
        evidence,
      };
    case 'scheduling':
      return {
        heading: 'Creating the worker',
        detail: 'Waiting for a node to schedule the worker.',
        evidence,
      };
    case 'waiting_for_node':
      return {
        heading: 'Creating the worker',
        detail: 'Waiting for a new node. The cluster is adding capacity.',
        evidence,
      };
    case 'blocked':
      return {
        heading: 'Worker startup is blocked',
        detail: 'The worker cannot start yet. See the worker status details.',
        evidence,
      };
    case 'unknown':
      return {
        heading: 'Worker status unavailable',
        detail: 'Could not confirm whether the worker has started.',
        evidence,
      };
  }
}
