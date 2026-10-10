/**
 * What the voyage page reads from the story's event history, where the `Story` itself has no field for it: the detail of
 * the last halt (G7), the key of the open human gate (G11) and the phase a blocked voyage stopped in (G12).
 *
 * A payload is untrusted and type-specific: every field is checked, and one that is missing or of the wrong type reads
 * as absent rather than failing the page.
 */
import type { AhoyEvent } from '@core/api/types';
import { GATE_FOR_PHASE, phaseIndex } from '@domain/phases';

/** The most of a worker log the banner keeps, in UTF-8 bytes: its last 4 KB. */
export const WORKER_LOG_MAX_BYTES = 4096;

/** The most lines of a worker log the banner keeps, after the 4 KB cut. */
export const WORKER_LOG_MAX_LINES = 20;

/** The last `story.halted` of a voyage, as the Anchored banner shows it. */
export interface HaltRecord {
  /** The API's `reason`, such as `run_failed`; free text. */
  readonly reason: string;
  readonly runId: string | null;
  /** The phase the payload names, if it names one. */
  readonly phase: string | null;
  /** The plain-text detail (for `stopped_by_user`, the person's reason). */
  readonly detail: string | null;
  /** The tail of the worker's log, plain text, already cut to {@link WORKER_LOG_MAX_LINES} lines. */
  readonly workerLog: string | null;
  readonly actor: string;
  readonly at: string;
}

/** A non-blank string field of a payload, trimmed; null otherwise. */
function text(
  payload: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The newest event of `type`, searching from the end (events are oldest first). */
function lastOfType(
  events: readonly AhoyEvent[],
  type: string
): AhoyEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === type) return event;
  }
  return null;
}

/** The last {@link WORKER_LOG_MAX_LINES} lines of the last {@link WORKER_LOG_MAX_BYTES} bytes (UTF-8) of a log. */
export function tailLog(log: string): string {
  const bytes = new TextEncoder().encode(log);
  // A cut inside a multi-byte character decodes to U+FFFD at the start: drop it.
  const recent =
    bytes.length > WORKER_LOG_MAX_BYTES
      ? new TextDecoder()
          .decode(bytes.subarray(bytes.length - WORKER_LOG_MAX_BYTES))
          .replace(/^\uFFFD+/, '')
      : log;
  const lines = recent.replace(/\s+$/, '').split(/\r?\n/);
  return lines.slice(-WORKER_LOG_MAX_LINES).join('\n');
}

/** Reads a `story.halted` event; null when it has no reason. */
export function readHalt(event: AhoyEvent): HaltRecord | null {
  const reason = text(event.payload, 'reason');
  if (reason === null) return null;
  const log = event.payload['workerLog'];
  return {
    reason,
    runId: text(event.payload, 'runId'),
    phase: text(event.payload, 'phase'),
    detail: text(event.payload, 'detail'),
    workerLog:
      typeof log === 'string' && log.trim() !== '' ? tailLog(log) : null,
    actor: event.actor,
    at: event.createdAt,
  };
}

/** The last halt of the history (G7), or null if it never halted or the event cannot be read. */
export function lastHalt(events: readonly AhoyEvent[]): HaltRecord | null {
  const event = lastOfType(events, 'story.halted');
  return event === null ? null : readHalt(event);
}

/**
 * The key of the human gate a voyage waits on (G11): the `gate` of the last `story.awaiting_decision`, or, when the
 * history has none yet, the gate named after the phase (`plan_review` → `plan_accepted`). Null when there is neither.
 */
export function openGateKey(
  events: readonly AhoyEvent[],
  phase: string
): string | null {
  const event = lastOfType(events, 'story.awaiting_decision');
  const gate = event === null ? null : text(event.payload, 'gate');
  if (gate !== null) return gate;
  return Object.hasOwn(GATE_FOR_PHASE, phase)
    ? GATE_FOR_PHASE[phase as keyof typeof GATE_FOR_PHASE]
    : null;
}

/**
 * The gate whose send-back rounds the header counts when no gate is open: the gate of the last
 * `story.awaiting_decision`, while the voyage is still before that gate's phase (a plan sent back to planning is in
 * the plan gate's rounds; a voyage that passed the gate is not). Null otherwise.
 */
export function revisingGateKey(
  events: readonly AhoyEvent[],
  phase: string
): string | null {
  const event = lastOfType(events, 'story.awaiting_decision');
  if (event === null) return null;
  const gate = text(event.payload, 'gate');
  const gatePhase = phaseIndex(text(event.payload, 'phase') ?? '');
  const now = phaseIndex(phase);
  return gate !== null && gatePhase !== null && now !== null && now < gatePhase
    ? gate
    : null;
}

/** The phase a blocked voyage was in (G12): the `from` of the last `story.phase_changed` to `blocked`. */
export function blockedAt(events: readonly AhoyEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type !== 'story.phase_changed') continue;
    if (text(event.payload, 'to') === 'blocked')
      return text(event.payload, 'from');
  }
  return null;
}
