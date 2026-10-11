/**
 * What the ship's log says of each event type (lane 5B, plan phase 5): a title, a detail and the dot's kind.
 *
 * Only the payloads confirmed in the hosted code (phase 5 file, 2026-10-06) are read field by field. For every other type
 * the title comes from the table and the detail is {@link genericDetails}: short scalar fields only, never a dump. A
 * payload is untrusted and a field of the wrong type reads as absent, so no event can break the log.
 */
import type { AhoyEvent } from '@core/api/types';
import { formatAiu } from '@domain/aiu';
import { crewLabel } from '@domain/models';
import type { LogEntryKind } from '@ui/ships-log/ships-log';

/** The actor the reconciler writes events as; anyone else is a person. */
export const SYSTEM_ACTOR = 'ahoy-reconciler';

/** The most characters of a detail or of one generic field. */
export const MAX_DETAIL_LENGTH = 120;

/** The most characters of an event type used as its own title. */
const MAX_TITLE_LENGTH = 80;

/** What the log shows of one event. */
export interface EventText {
  /** In bold: "Gate evaluated". */
  readonly title: string;
  /** Plain text after the title; empty when the event has nothing to add. */
  readonly details: string;
  readonly kind: LogEntryKind;
  /** The run the event is about, if the payload names one (the log links it). */
  readonly runId: string | null;
}

/** What the log knows from the events around this one and cannot read from its own payload. */
export interface EventContext {
  /** The revision round of the gate this event is at (1 + earlier send-backs), if it is about a gate. */
  readonly round: number | null;
  /** The crew member of the run named by the payload, from the run's own `run.queued`. */
  readonly crew: string | null;
}

/** Titles of the types whose payload has not been confirmed, and of the confirmed ones that need no special detail. */
const TITLES: Readonly<Record<string, string>> = {
  'story.started': 'Voyage started',
  'story.halted': 'Halted',
  'story.resumed': 'Resumed',
  'story.intake_refreshed': 'Sent back to intake',
  'story.budget_changed': 'Budget changed',
  'story.models_changed': 'Models changed',
  'story.phase_changed': 'Phase changed',
  'story.awaiting_input': 'Waiting for answers',
  'story.awaiting_decision': 'Waiting at the human gate',
  'run.queued': 'Run queued',
  'run.dispatched': 'Run dispatched',
  'run.finished': 'Run finished',
  'gate.evaluated': 'Gate evaluated',
  'question.asked': 'Questions asked',
  'question.answered': 'Question answered',
  'decision.recorded': 'Decision recorded',
  'artifacts.updated': 'Artifacts updated',
  'review.resolved': 'Review resolved',
  'run.waiting': 'Run waiting for a slot',
  'work_package.decided': 'Work package decided',
  'work.reopened': 'Work reopened',
  'story.unblocked': 'Voyage unblocked',
  'implementation.reported': 'Implementation reported',
  'review.reported': 'Review reported',
  'story.routed': 'Voyage routed',
};

/** Cuts a text to `max` characters, ending in an ellipsis when it was longer. */
export function clip(text: string, max = MAX_DETAIL_LENGTH): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** One line: runs of whitespace (newlines among them) become one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

type Payload = Readonly<Record<string, unknown>>;

/** A non-blank string field, on one line; null when absent or not a string. */
function str(payload: Payload, key: string): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const line = oneLine(value);
  return line === '' ? null : line;
}

/** A safe-integer field; null otherwise. */
function int(payload: Payload, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

/** A plain object field; null otherwise. */
function record(payload: Payload, key: string): Payload | null {
  const value = payload[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

/** AIU for a sentence: "20", "12.4", "3.84" (at most two decimals, no trailing zeros). */
function aiu(nanoAiu: number): string {
  const text = formatAiu(nanoAiu, 2);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** "claude-sonnet-5 · high"; a missing model or effort reads as the agent's own. */
function modelEffort(model: string | null, effort: string | null): string {
  return `${model ?? "the agent's own model"} · ${effort ?? 'default'}`;
}

/**
 * The detail of a type whose payload is not confirmed: its scalar fields (text, numbers, booleans) as `key: value`, the
 * ones longer than {@link MAX_DETAIL_LENGTH} left out, the whole cut to the same length. Objects and lists are never
 * shown, so a payload cannot be dumped into the log.
 */
export function genericDetails(payload: Payload): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    let shown: string | null = null;
    if (typeof value === 'string') shown = oneLine(value);
    else if (typeof value === 'number' && Number.isFinite(value))
      shown = String(value);
    else if (typeof value === 'boolean') shown = String(value);
    if (shown === null || shown === '' || shown.length > MAX_DETAIL_LENGTH)
      continue;
    parts.push(`${clip(oneLine(key), 40)}: ${shown}`);
  }
  return clip(parts.join(' · '));
}

/** The details of the types whose payload is confirmed; null for any other (they take the generic detail). */
function confirmedDetails(
  event: AhoyEvent,
  context: EventContext
): string | null {
  const payload: Payload = event.payload;
  switch (event.type) {
    case 'story.started': {
      const budget = int(payload, 'budgetNanoAiu');
      const planning = record(record(payload, 'models') ?? {}, 'planning');
      const model = planning === null ? null : str(planning, 'model');
      const effort =
        planning === null ? null : str(planning, 'reasoningEffort');
      const parts: string[] = [];
      if (budget !== null) parts.push(`budget ${aiu(budget)} AIU`);
      if (model !== null)
        parts.push(`planning on ${modelEffort(model, effort)}`);
      return parts.join(' · ');
    }
    case 'story.halted': {
      const reason = str(payload, 'reason');
      const detail = str(payload, 'detail');
      return clip([reason, detail].filter((part) => part !== null).join(' · '));
    }
    case 'story.awaiting_decision': {
      const gate = str(payload, 'gate');
      if (gate === null) return '';
      return context.round === null ? gate : `${gate}, round ${context.round}`;
    }
    case 'story.intake_refreshed': {
      const from = str(payload, 'from');
      const reason = str(payload, 'reason');
      const superseded = payload['supersededQuestions'];
      const count = Array.isArray(superseded) ? superseded.length : null;
      return clip(
        [
          from === null ? null : `${from} → intake`,
          reason,
          count === null || count === 0
            ? null
            : `${count} ${count === 1 ? 'question' : 'questions'} kept as history`,
        ]
          .filter((part) => part !== null)
          .join(' · ')
      );
    }
    case 'story.phase_changed': {
      const from = str(payload, 'from');
      const to = str(payload, 'to');
      return from !== null && to !== null ? `${from} → ${to}` : '';
    }
    case 'run.queued': {
      const phase = str(payload, 'phase') ?? '';
      const agent = str(payload, 'agent');
      const parts: string[] = [];
      if (agent !== null) parts.push(crewLabel(phase, agent));
      parts.push(
        modelEffort(str(payload, 'model'), str(payload, 'reasoningEffort'))
      );
      return parts.join(' · ');
    }
    case 'run.dispatched': {
      const runtime = str(payload, 'runtime');
      return runtime === null ? '' : `on ${runtime}`;
    }
    case 'run.finished': {
      const status = str(payload, 'status');
      const nano = int(payload, 'nanoAiu');
      return [context.crew, status, nano === null ? null : `${aiu(nano)} AIU`]
        .filter((part) => part !== null)
        .join(' · ');
    }
    case 'gate.evaluated': {
      const gate = str(payload, 'gate');
      const result = str(payload, 'result');
      return [gate, result].filter((part) => part !== null).join(' · ');
    }
    case 'decision.recorded': {
      const gate = str(payload, 'gate');
      const decision = str(payload, 'decision');
      const round = int(payload, 'round');
      return [gate, decision, round === null ? null : `round ${round}`]
        .filter((part) => part !== null)
        .join(' · ');
    }
    case 'artifacts.updated': {
      const revision = int(payload, 'revision');
      return revision === null ? '' : `revision ${revision}`;
    }
    default:
      return null;
  }
}

/** The dot of an event: waiting, a gate that passed, a person's act, or the system's. */
function kindOf(event: AhoyEvent): LogEntryKind {
  if (
    event.type === 'story.awaiting_input' ||
    event.type === 'story.awaiting_decision'
  )
    return 'wait';
  if (
    event.type === 'gate.evaluated' &&
    str(event.payload, 'result') === 'pass'
  )
    return 'pass';
  return event.actor === SYSTEM_ACTOR ? 'system' : 'human';
}

/** The title and detail of one event, with the round and the crew the surrounding events give it. */
export function eventText(
  event: AhoyEvent,
  context: EventContext = { round: null, crew: null }
): EventText {
  const known = Object.hasOwn(TITLES, event.type);
  const title = known
    ? (TITLES[event.type] ?? event.type)
    : clip(oneLine(event.type), MAX_TITLE_LENGTH);
  const details =
    confirmedDetails(event, context) ?? genericDetails(event.payload);
  const runId = str(event.payload, 'runId');
  return {
    title: title === '' ? 'Unknown event' : title,
    details,
    kind: kindOf(event),
    runId,
  };
}
