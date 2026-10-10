import type { StoryStateView } from '@core/api/story-state';
import type {
  AhoyEvent,
  Diagnosis,
  Question,
  Run,
  Story,
} from '@core/api/types';
import { GATE_FOR_PHASE } from '@domain/phases';
import { crewLabel } from '@domain/models';
import { diagnosisLine } from '@domain/diagnosis';
import { explainHalt, isHaltReason } from '@domain/halt';
import { currentQuestions } from '@domain/questions';

/** What the last `story.halted` event says (G7): the code and the person's or the worker's words. */
export interface HaltInfo {
  readonly reason: string | null;
  readonly detail: string | null;
}

/** What one row of the inbox has read about its voyage; `null` until it is read. */
export interface RowDetail {
  /** The voyage's questions, for Crew asks. */
  readonly questions: readonly Question[] | null;
  /** The story state, for the revision round of Your orders. */
  readonly state: StoryStateView | null;
  /** The gate that is open (G11): from the last `story.awaiting_decision` event. */
  readonly gate: string | null;
  /** The last `story.halted` event, for Anchored. */
  readonly halt: HaltInfo | null;
  /** The diagnosis of a halted voyage (`getStoryDiagnosis`), for Anchored. */
  readonly diagnosis: Diagnosis | null;
}

/** The "What's needed" cell: the sentence, and the small line under it. */
export interface Needed {
  readonly headline: string;
  readonly sub: string | null;
  /** For a halted voyage, once its diagnosis is read: the cause and who acts on it, in one line. */
  readonly diagnosis?: string;
}

/** The action that ends a row: its label, how it looks and where it goes. */
export interface NeedsAction {
  readonly label: string;
  readonly variant: 'primary' | 'default';
  readonly link: readonly string[];
}

/** The model and effort a run works on: what "At sea" shows once the run is known. */
export type RunModel = Pick<Run, 'model' | 'reasoningEffort'>;

/** The "Crew member" cell of a voyage at sea: who is working, and on what model and effort when the run is known. */
export interface AtSeaCrew {
  readonly member: string;
  readonly runtime: string | null;
}

/** The last event of a type, or `undefined`. */
function lastOf(
  events: readonly AhoyEvent[],
  type: string
): AhoyEvent | undefined {
  return events.filter((event) => event.type === type).at(-1);
}

/** The crew member of a phase, in the crew's words (G14). */
export function crewOfPhase(phase: string): string {
  return phase === 'pr_review' ? 'Lookout' : crewLabel(phase);
}

/** The gate that is open: the event's (G11), else the one the phase has. `null` when neither says. */
function gateOf(story: Story, known: string | null): string | null {
  if (known !== null) return known;
  const byPhase: Readonly<Record<string, string>> = GATE_FOR_PHASE;
  return byPhase[story.phase] ?? null;
}

/** Reads the reason and the detail of the last `story.halted` event; `null` when there is none. */
export function haltOf(events: readonly AhoyEvent[]): HaltInfo | null {
  const last = lastOf(events, 'story.halted');
  if (last === undefined) return null;
  const reason = last.payload['reason'];
  const detail = last.payload['detail'];
  const trimmed = typeof detail === 'string' ? detail.trim() : '';
  return {
    reason: typeof reason === 'string' ? reason : null,
    detail: trimmed !== '' ? trimmed : null,
  };
}

/** The gate of the last `story.awaiting_decision` event (G11); `null` when there is none. */
export function gateOpen(events: readonly AhoyEvent[]): string | null {
  const gate = lastOf(events, 'story.awaiting_decision')?.payload['gate'];
  return typeof gate === 'string' && gate !== '' ? gate : null;
}

function questionsNeeded(
  story: Story,
  questions: readonly Question[] | null
): Needed {
  const crew = crewOfPhase(story.phase);
  const asked = questions === null ? [] : currentQuestions(questions);
  if (asked.length === 0)
    return { headline: `${crew} is waiting for answers`, sub: null };
  const round = Math.max(...asked.map((question) => question.round));
  const current = asked.filter((question) => question.round === round);
  const answered = current.filter(
    (question) => question.answer !== null
  ).length;
  const count = current.length;
  return {
    headline: `${crew} asked ${count} ${count === 1 ? 'question' : 'questions'}`,
    sub: `Round ${round} · ${answered} of ${count} answered`,
  };
}

function decisionNeeded(story: Story, detail: RowDetail): Needed {
  const gate = gateOf(story, detail.gate);
  const headline =
    gate === GATE_FOR_PHASE.plan_review
      ? 'The plan is ready for review'
      : gate === GATE_FOR_PHASE.delivery_gate
        ? 'The delivery is ready for review'
        : 'A decision is waiting';
  if (gate === null) return { headline, sub: null };
  if (detail.state === null) return { headline, sub: `Gate ${gate}` };
  const round = (detail.state.revisions.get(gate) ?? 0) + 1;
  return {
    headline,
    sub: `Gate ${gate} · revision round ${round} of ${detail.state.revisionCeiling}`,
  };
}

/** What a halted voyage needs, with the line of its diagnosis once it is read. */
function haltNeeded(
  story: Story,
  halt: HaltInfo | null,
  diagnosis: Diagnosis | null
): Needed {
  const needed = haltReasonNeeded(story, halt);
  const line = diagnosis === null ? null : diagnosisLine(diagnosis.findings);
  return line === null ? needed : { ...needed, diagnosis: line };
}

function haltReasonNeeded(story: Story, halt: HaltInfo | null): Needed {
  const reason = story.haltReason;
  if (reason === null) return { headline: 'The voyage is halted', sub: null };
  const detail = halt?.detail ?? null;
  const headline = explainHalt(reason).short;
  if (!isHaltReason(reason)) return { headline, sub: detail };
  if (detail === null) return { headline, sub: reason };
  return {
    headline,
    sub: `${reason} · ${reason === 'stopped_by_user' ? `"${detail}"` : detail}`,
  };
}

/** What a voyage of the inbox needs from a person, by status: the text of the "What's needed" column. */
export function whatsNeeded(story: Story, detail: RowDetail): Needed {
  switch (story.status) {
    case 'awaiting_input':
      return questionsNeeded(story, detail.questions);
    case 'awaiting_decision':
      return decisionNeeded(story, detail);
    case 'halted':
      return haltNeeded(story, detail.halt, detail.diagnosis);
    default:
      return { headline: story.status, sub: null };
  }
}

/** The action that ends a row of the inbox, by status. `gate` is the open gate, if known (G11). */
export function needsAction(story: Story, gate: string | null): NeedsAction {
  const voyage = ['/voyages', story.key] as const;
  switch (story.status) {
    case 'awaiting_input':
      return {
        label: 'Answer',
        variant: 'primary',
        link: [...voyage, 'questions'],
      };
    case 'awaiting_decision':
      return gateOf(story, gate) === GATE_FOR_PHASE.plan_review
        ? {
            label: 'Review plan',
            variant: 'primary',
            link: [...voyage, 'plan'],
          }
        : { label: 'Decide', variant: 'primary', link: voyage };
    default:
      return {
        label: 'Review & resume',
        variant: 'default',
        link: [...voyage, 'models'],
      };
  }
}

/**
 * The "Crew member" cell of a voyage at sea: who is working, and on which model and effort once the run is known.
 * A queued voyage says who goes next.
 */
export function atSeaCrew(story: Story, run: RunModel | null): AtSeaCrew {
  const member = crewOfPhase(story.phase);
  if (story.status === 'ready')
    return { member: `${member} goes next`, runtime: null };
  if (run === null || run.model === null) return { member, runtime: null };
  return {
    member,
    runtime:
      run.reasoningEffort === null
        ? run.model
        : `${run.model} · ${run.reasoningEffort}`,
  };
}
