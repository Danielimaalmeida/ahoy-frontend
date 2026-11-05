/**
 * Team settings › Defects in words (`ahoy-hosted` design §5 "Defect watch"): the state the side navigation shows, how
 * the priorities are typed and read back, and what one entry of the section's history says.
 * Pure.
 */

import { isRecord } from './records';

/** What the section keeps that the navigation and the history name. */
export interface DefectChoice {
  readonly watchOn: boolean;
}

/** The most priorities the settings keep, as the contract says. */
export const MAX_PRIORITIES = 20;

/** The side navigation's word for the section: "Watching" or "Off". */
export function defectsStateLabel(settings: DefectChoice): {
  readonly label: string;
  readonly off: boolean;
} {
  return settings.watchOn
    ? { label: 'Watching', off: false }
    : { label: 'Off', off: true };
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
  // Kept so the history still names a change the component map once made.
  components: 'Components',
};

/** A field's new value in words, for the history. */
function toWords(field: string, value: unknown): string {
  if (field === 'watchOn') return value === true ? 'on' : 'off';
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
