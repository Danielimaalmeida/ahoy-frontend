/**
 * Team settings › Defects in words (`ahoy-hosted` design §5 "Defect watch"): the state the side navigation shows, how
 * the priorities and the component map are typed and read back, and what one entry of the section's history says.
 * Pure.
 */

import { isRecord } from './records';

/** Which repository fixes the defects of one Jira component, as the API names it. */
export interface ComponentPair {
  readonly component: string;
  readonly repository: string;
}

/** What the section keeps that the navigation and the history name. */
export interface DefectChoice {
  readonly watchOn: boolean;
}

/** The most priorities and components the settings keep, as the contract says. */
export const MAX_PRIORITIES = 20;
export const MAX_COMPONENTS = 100;

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

/**
 * The component map as typed, one `component = repository` a line: blank lines are skipped, each component once (case
 * ignored), or why the map is refused, naming the line.
 */
export function componentsOf(
  typed: string
): { readonly value: readonly ComponentPair[] } | { readonly problem: string } {
  const pairs: ComponentPair[] = [];
  const seen = new Set<string>();
  const lines = typed.split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === '') continue;
    const at = line.indexOf('=');
    const component = at < 0 ? '' : line.slice(0, at).trim();
    const repository = at < 0 ? '' : line.slice(at + 1).trim();
    if (component === '' || repository === '')
      return {
        problem: `Line ${index + 1}: write it as "component = repository".`,
      };
    if (component.length > 200 || repository.length > 200)
      return {
        problem: `Line ${index + 1}: a name is at most 200 characters.`,
      };
    const key = component.toLowerCase();
    if (seen.has(key))
      return {
        problem: `Line ${index + 1}: ${component} is already listed.`,
      };
    seen.add(key);
    pairs.push({ component, repository });
  }
  if (pairs.length > MAX_COMPONENTS)
    return { problem: `List at most ${MAX_COMPONENTS} components.` };
  return { value: pairs };
}

/** The component map as the form shows it, one `component = repository` a line. */
export function componentsText(pairs: readonly ComponentPair[]): string {
  return pairs.map((p) => `${p.component} = ${p.repository}`).join('\n');
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  watchOn: 'Watch',
  defectsJql: 'Query',
  priorities: 'Priorities',
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
