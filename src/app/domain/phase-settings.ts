/**
 * Team settings › Phases in words: the phases and their fields, reading what an admin types (AIU, minutes), which
 * changes raise a cap, and what one entry of the phases' history says. Pure.
 */

import { formatAiu, parseAiu } from './aiu';
import { isRecord } from './records';

/** A field of a phase the team settings can set, as the API names it. */
export type PhaseField =
  | 'model'
  | 'reasoningEffort'
  | 'budgetNanoAiu'
  | 'timeoutSeconds'
  | 'ciWaitMinutes';

/** The fields in words, for the table and the history. */
export const PHASE_FIELD_NAMES: Readonly<Record<PhaseField, string>> = {
  model: 'Model',
  reasoningEffort: 'Effort',
  budgetNanoAiu: 'AIU cap per run',
  timeoutSeconds: 'Timeout',
  ciWaitMinutes: 'Wait for CI',
};

/** The phases in words, in the order a story meets them; a phase the deployment adds keeps its own name. */
const PHASE_NAMES: Readonly<Record<string, string>> = {
  intake: 'Intake',
  planning: 'Planning',
  design: 'Design',
  implementation: 'Implementation',
  pr_review: 'Review',
  refinement: 'Pre-refinement',
  diagnosis: 'Halt diagnosis',
  knowledge: 'Business-rule review',
  meeting_story: 'Story drafts',
};

/** The fields as a sentence of the history names them. */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  model: 'model',
  reasoningEffort: 'effort',
  budgetNanoAiu: 'AIU cap per run',
  timeoutSeconds: 'timeout',
  ciWaitMinutes: 'wait for CI',
};

/** A phase's name, for the page. */
export function phaseName(phase: string): string {
  return PHASE_NAMES[phase] ?? phase;
}

/** The phases of a story, before the agents' jobs outside one. */
const STORY_PHASES = [
  'intake',
  'planning',
  'design',
  'implementation',
  'pr_review',
];

/** Whether a phase runs inside a story (its runs spend the story's budget), not as one of the agents' jobs. */
export function isStoryPhase(phase: string): boolean {
  return STORY_PHASES.includes(phase);
}

/** The shortest and longest timeout the API takes, in minutes: one minute and one day. */
export const MIN_TIMEOUT_MINUTES = 1;
export const MAX_TIMEOUT_MINUTES = 24 * 60;
/** The longest wait for CI the API takes, in minutes: one week. */
export const MAX_CI_WAIT_MINUTES = 7 * 24 * 60;
/** The smallest AIU cap the API takes: 0.1 AIU. */
export const MIN_BUDGET_NANO_AIU = 100_000_000;

const WHOLE = /^\d{1,7}$/;

/** A whole number of minutes from `min` to `max` typed by an admin, or why it is refused. */
export function readMinutes(
  typed: string,
  min: number,
  max: number
): { readonly minutes: number } | { readonly problem: string } {
  const text = typed.trim();
  if (!WHOLE.test(text)) return { problem: 'Give a whole number of minutes.' };
  const minutes = Number(text);
  if (minutes < min || minutes > max)
    return { problem: `Give ${min} to ${max} minutes.` };
  return { minutes };
}

/** An AIU cap typed by an admin, in nano-AIU, or why it is refused: at least 0.1 AIU and at most `cap`. */
export function readBudget(
  typed: string,
  capNanoAiu: number
): { readonly nanoAiu: number } | { readonly problem: string } {
  const nanoAiu = parseAiu(typed);
  if (nanoAiu === null)
    return { problem: 'Give an amount of AIU, such as 25 or 2.5.' };
  if (nanoAiu < MIN_BUDGET_NANO_AIU)
    return { problem: `Give at least ${formatAiu(MIN_BUDGET_NANO_AIU)} AIU.` };
  if (nanoAiu > capNanoAiu)
    return { problem: `The most allowed is ${aiuLabel(capNanoAiu)}.` };
  return { nanoAiu };
}

/** "60 AIU", "2.5 AIU": an amount without trailing zeros. */
export function aiuLabel(nanoAiu: number): string {
  return `${formatAiu(nanoAiu, 9).replace(/\.?0+$/, '')} AIU`;
}

/** "15 min", "1 h", "1 h 30 min". */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** One phase's cap before and after a change, by phase. */
export interface CapChange {
  readonly phase: string;
  readonly from: number;
  readonly to: number;
}

/** The changes that raise a phase's cap: saving them asks the admin to confirm the AIU each run may then spend. */
export function capsRaised(changes: readonly CapChange[]): CapChange[] {
  return changes.filter((c) => c.to > c.from);
}

/** A value of a field in words, for the history: null is the deployment's. */
function valueWords(field: string, value: unknown): string {
  if (value === null || value === undefined) return 'the deployment’s';
  if (typeof value !== 'number') return String(value);
  if (field === 'budgetNanoAiu') return aiuLabel(value);
  if (field === 'timeoutSeconds') return minutesLabel(Math.round(value / 60));
  if (field === 'ciWaitMinutes') return minutesLabel(value);
  return String(value);
}

/** The ids of a catalogue in the history, or "the built-in list". */
function catalogWords(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((id) => typeof id === 'string').join(', ')
    : 'the built-in list';
}

/** What one Phases entry of the settings history says happened, or undefined for an entry of another section. */
export function describePhaseEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'phase_settings.updated') return undefined;
  const p = isRecord(payload) ? payload : {};
  const changes = p['changes'];
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([key, change]) => {
        if (!isRecord(change)) return [];
        if (key === 'models')
          return [
            `Models: ${catalogWords(change['from'])} → ${catalogWords(change['to'])}`,
          ];
        const [phase = key, field = ''] = key.split('.');
        const name = FIELD_WORDS[field] ?? field;
        return [
          `${phaseName(phase)} ${name}: ${valueWords(field, change['from'])} → ${valueWords(field, change['to'])}`,
        ];
      })
    : [];
  const text = words.length === 0 ? 'Saved the phases' : words.join('; ');
  return p['confirmSpend'] === true
    ? `${text} (confirmed the higher AIU cap)`
    : text;
}
