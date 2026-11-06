/**
 * Team settings › Defects in words (`ahoy-hosted` design §5 "Defect watch"): the state the side navigation shows, how
 * the priorities are typed and read back, and what one entry of the section's history says.
 * Pure.
 */

import { NANO_AIU_PER_AIU } from './aiu';
import { aiuLabel } from './phase-settings';
import { isRecord } from './records';

/** What the section keeps that the navigation and the history name. */
export interface DefectChoice {
  readonly watchOn: boolean;
  readonly autoStart?: boolean;
}

/** The highest AIU cap per defect the API takes: 200 AIU. */
export const MAX_DEFECT_BUDGET_NANO_AIU = 200 * NANO_AIU_PER_AIU;
/** The highest cap on starts per day and on open voyages the API takes. */
export const MAX_DEFECT_STARTS = 20;

/** A cap on starts as typed: a whole number from 1 to {@link MAX_DEFECT_STARTS}, or why it is refused. */
export function startCapOf(
  typed: string
): { readonly value: number } | { readonly problem: string } {
  const text = typed.trim();
  if (!/^\d{1,3}$/.test(text))
    return { problem: `Type a whole number from 1 to ${MAX_DEFECT_STARTS}.` };
  const value = Number(text);
  return value >= 1 && value <= MAX_DEFECT_STARTS
    ? { value }
    : { problem: `Type a whole number from 1 to ${MAX_DEFECT_STARTS}.` };
}

/**
 * The most AIU automatic starts may spend in a day: the cap per defect times the starts per day ("40 AIU"), or null
 * without a cap.
 */
export function dailySpendText(
  budgetNanoAiu: number | null,
  maxStartsPerDay: number
): string | null {
  return budgetNanoAiu === null
    ? null
    : aiuLabel(budgetNanoAiu * maxStartsPerDay);
}

/** What the spend confirmation weighs of the settings. */
export interface DefectSpend {
  readonly watchOn: boolean;
  readonly autoStart: boolean;
  readonly budgetNanoAiu: number | null;
  readonly maxStartsPerDay: number;
}

/**
 * Whether going from `was` to `now` lets the watch spend more by itself, which needs the admin's yes (`confirmSpend`):
 * turning automatic starts on, or raising the cap per defect or the starts per day while they are on. Mirrors
 * `ahoy-hosted`'s `spendsMore`.
 */
export function spendsMore(was: DefectSpend, now: DefectSpend): boolean {
  if (!now.watchOn || !now.autoStart) return false;
  if (!was.watchOn || !was.autoStart) return true;
  return (
    (now.budgetNanoAiu ?? 0) > (was.budgetNanoAiu ?? 0) ||
    now.maxStartsPerDay > was.maxStartsPerDay
  );
}

/** The most priorities the settings keep, as the contract says. */
export const MAX_PRIORITIES = 20;

/** The side navigation's word for the section: "Watching" or "Off". */
export function defectsStateLabel(settings: DefectChoice): {
  readonly label: string;
  readonly off: boolean;
} {
  if (!settings.watchOn) return { label: 'Off', off: true };
  return settings.autoStart === true
    ? { label: 'Fixing', off: false }
    : { label: 'Watching', off: false };
}

/** The priorities as typed, comma-separated: each trimmed, each once (case ignored), or why they are refused. */
export function prioritiesOf(
  typed: string
): { readonly value: readonly string[] } | { readonly problem: string } {
  const names = typed
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (names.length > MAX_PRIORITIES)
    return { problem: `Name at most ${MAX_PRIORITIES} priorities.` };
  if (names.some((p) => p.length > 60))
    return { problem: 'A priority is at most 60 characters.' };
  const lower = names.map((p) => p.toLowerCase());
  if (new Set(lower).size !== lower.length)
    return { problem: 'Name each priority once.' };
  return { value: names };
}

/** The priorities as the form shows them: "Highest, High". */
export function prioritiesText(priorities: readonly string[]): string {
  return priorities.join(', ');
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  watchOn: 'Watch',
  defectsJql: 'Query',
  priorities: 'Priorities',
  autoStart: 'Automatic starts',
  budgetNanoAiu: 'AIU cap per defect',
  maxStartsPerDay: 'Starts per day',
  maxActive: 'Open voyages',
  // Kept so the history still names a change the component map once made.
  components: 'Components',
};

/** A field's new value in words, for the history. */
function toWords(field: string, value: unknown): string {
  if (field === 'watchOn' || field === 'autoStart')
    return value === true ? 'on' : 'off';
  if (field === 'budgetNanoAiu')
    return typeof value === 'number' ? aiuLabel(value) : 'none';
  if (field === 'maxStartsPerDay' || field === 'maxActive')
    return typeof value === 'number' ? String(value) : '?';
  if (field === 'defectsJql')
    return typeof value === 'string' ? 'changed' : 'removed';
  if (Array.isArray(value))
    return value.length === 0 ? 'none' : String(value.length);
  return '?';
}

/** What one Defects entry of the settings history says happened, or undefined for another section's. */
export function describeDefectEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'defect_settings.updated') return undefined;
  const p = isRecord(payload) ? payload : {};
  const changes = p['changes'];
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([field, change]) =>
        isRecord(change)
          ? [`${FIELD_NAMES[field] ?? field}: ${toWords(field, change['to'])}`]
          : []
      )
    : [];
  return words.length === 0 ? 'Saved the defect settings' : words.join('; ');
}
