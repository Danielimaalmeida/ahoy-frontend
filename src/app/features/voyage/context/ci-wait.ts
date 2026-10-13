/**
 * Whether Ahoy is waiting for a pull request's CI, read from the story and its event history.
 *
 * Once every work package is done, the reconciler verifies each repository with the `child_ready` gate. While a pull
 * request still has checks running, that gate fails with "PR #7 has 2 check(s) still running (build, e2e); poll again
 * rather than recording ready"; the router then waits (the story stays `ready` in `implementation`, no run is queued)
 * and asks the gate again later. Those verdicts are written as one batch of `gate.evaluated` events in the same
 * transaction, and not written again while they repeat (ahoy-hosted `apps/reconciler/src/delivery.ts`,
 * `verifyImplementation` and `applyRouting`; `packages/core/src/gates/child-ready.ts`, `verifyChecks`).
 *
 * The contract has no structured field for this wait: the pull request, the count and the names come from the gate's
 * message, and this reader recognises only that message. Any other `fail` (a repository not `ready` yet, a pull request
 * not opened yet) is not a CI wait, and neither is a `ready` or `queued` status on its own.
 */
import type { StoryPullRequest } from '@core/api/story-state';
import type { AhoyEvent, Story } from '@core/api/types';
import { isKnownEventType } from '@core/realtime/event-types';

/** One pull request whose checks Ahoy waits for. */
export interface CiPendingPullRequest {
  readonly prNumber: number;
  /** How many checks were still running, as the gate counted them. */
  readonly pendingCount: number;
  /** The names of those checks, as the gate listed them; empty when it listed none. */
  readonly pendingChecks: readonly string[];
  /** The repository's pull request in the state, when exactly one has this number; null otherwise. */
  readonly pullRequest: StoryPullRequest | null;
  /** The gate's message, plain text. */
  readonly message: string;
}

/** Ahoy is waiting for CI: the implementer has finished and the pull requests' checks are still running. */
export interface CiWait {
  readonly pullRequests: readonly CiPendingPullRequest[];
  /** When the gate recorded this set of verdicts: it is not written again while they repeat. */
  readonly seenAt: string;
}

/** The `child_ready` message for checks still running (`verifyChecks`), with the number, the count and the names. */
const CHECKS_RUNNING =
  /^PR #(\d+) has (\d+) check\(s\) still running \(([\s\S]*)\); poll again rather than recording ready$/;

/** Events that may follow a gate batch without moving the story: the batch's own routing notes and owner edits. */
const NEUTRAL: ReadonlySet<string> = new Set([
  'story.routed',
  'story.budget_changed',
  'story.models_changed',
]);

/** A gate verdict from a `gate.evaluated` of a reconciler step (not a run's own gate, which carries its `runId`). */
interface StepVerdict {
  readonly gate: string;
  readonly result: string;
  readonly message: string;
}

function readStepVerdict(event: AhoyEvent): StepVerdict | null {
  if (event.type !== 'gate.evaluated') return null;
  const payload = event.payload;
  const runId = payload['runId'];
  if (runId !== undefined && runId !== null) return null;
  const gate = payload['gate'];
  const result = payload['result'];
  const message = payload['message'];
  return typeof gate === 'string' &&
    typeof result === 'string' &&
    typeof message === 'string'
    ? { gate, result, message }
    : null;
}

/**
 * The last batch of step verdicts, if nothing but neutral events came after it: the `gate.evaluated` events at the end of
 * the history that share the newest one's `createdAt` (one transaction). Null when another event came after them.
 */
function lastVerdictBatch(
  events: readonly AhoyEvent[]
): { readonly verdicts: readonly StepVerdict[]; readonly at: string } | null {
  const verdicts: StepVerdict[] = [];
  let at: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event === undefined) continue;
    // The contract asks clients to ignore types they do not know.
    if (!isKnownEventType(event.type) || event.type === 'run.progress')
      continue;
    if (at === null && NEUTRAL.has(event.type)) continue;
    const verdict = readStepVerdict(event);
    if (verdict === null) {
      if (at === null) return null;
      break;
    }
    if (at === null) at = event.createdAt;
    else if (event.createdAt !== at) break;
    verdicts.unshift(verdict);
  }
  return at === null ? null : { verdicts, at };
}

/** Reads a `child_ready` "checks still running" message; null for any other message. */
export function readChecksRunning(message: string): {
  readonly prNumber: number;
  readonly pendingCount: number;
  readonly pendingChecks: readonly string[];
} | null {
  const match = CHECKS_RUNNING.exec(message.trim());
  if (match === null) return null;
  const prNumber = Number(match[1]);
  const pendingCount = Number(match[2]);
  if (!Number.isSafeInteger(prNumber) || !Number.isSafeInteger(pendingCount))
    return null;
  const names = (match[3] ?? '')
    .split(', ')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return { prNumber, pendingCount, pendingChecks: names };
}

/**
 * Whether Ahoy waits for CI now, and on which pull requests. Only while the story is `ready` in `implementation` with no
 * run, and only when the last thing that happened is a batch of `child_ready`/`pr` verdicts that waits (every verdict a
 * `pass` or a `fail`) with at least one "checks still running". Anything after that batch (a run queued, a halt, a
 * resume, a decision, a phase change) means the wait is over, and the next batch replaces it. Null otherwise.
 */
export function ciWait(
  story: Pick<Story, 'phase' | 'status' | 'currentRunId'> | null,
  events: readonly AhoyEvent[],
  pullRequests: readonly StoryPullRequest[]
): CiWait | null {
  if (
    story === null ||
    story.phase !== 'implementation' ||
    story.status !== 'ready' ||
    story.currentRunId !== null
  )
    return null;
  const batch = lastVerdictBatch(events);
  if (batch === null) return null;
  if (batch.verdicts.some((v) => v.result !== 'pass' && v.result !== 'fail'))
    return null;
  const pending: CiPendingPullRequest[] = [];
  for (const verdict of batch.verdicts) {
    if (verdict.gate !== 'child_ready' || verdict.result !== 'fail') continue;
    const running = readChecksRunning(verdict.message);
    if (running === null) continue;
    const matches = pullRequests.filter((pr) => pr.number === running.prNumber);
    pending.push({
      ...running,
      pullRequest: matches.length === 1 ? (matches[0] ?? null) : null,
      message: verdict.message,
    });
  }
  return pending.length === 0
    ? null
    : { pullRequests: pending, seenAt: batch.at };
}
