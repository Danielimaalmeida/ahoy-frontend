/**
 * Team settings › Product in words: the checks of the defaults as typed, and what one entry of its history says
 * happened. Pure: the payloads come from the API as `unknown` and are read field by field.
 */

import { isRecord } from './records';

/** The most Confluence spaces and repositories the defaults name, as the API takes them. */
export const PRODUCT_SPACES_MAX = 10;
export const PRODUCT_REPOSITORIES_MAX = 3;

const JIRA_PROJECT = /^[A-Z][A-Z0-9_]{0,49}$/;
const SPACE_KEY = /^[A-Za-z0-9_~-]{1,255}$/;

/** A Jira project key as typed (upper-cased; empty is none), or why it is refused. */
export function jiraProjectOf(
  typed: string
): { readonly value: string | null } | { readonly problem: string } {
  const value = typed.trim().toUpperCase();
  if (value === '') return { value: null };
  return JIRA_PROJECT.test(value)
    ? { value }
    : { problem: 'A Jira project key, such as PROJ: letters and digits.' };
}

/** Names as typed, separated by commas or spaces, each once, in order. */
function namesOf(typed: string): string[] {
  return [
    ...new Set(
      typed
        .split(/[\s,]+/)
        .map((k) => k.trim())
        .filter((k) => k !== '')
    ),
  ];
}

/** Confluence space keys as typed, separated by commas or spaces (each once), or why they are refused. */
export function confluenceSpacesOf(
  typed: string
): { readonly value: readonly string[] } | { readonly problem: string } {
  const keys = namesOf(typed);
  const bad = keys.find((k) => !SPACE_KEY.test(k));
  if (bad !== undefined)
    return { problem: `${bad} is not a Confluence space key, such as BILL.` };
  if (keys.length > PRODUCT_SPACES_MAX)
    return { problem: `At most ${PRODUCT_SPACES_MAX} spaces.` };
  return { value: keys };
}

/** Repository names as typed, separated by commas or spaces (each once), or why they are refused. */
export function repositoriesOf(
  typed: string
): { readonly value: readonly string[] } | { readonly problem: string } {
  const names = namesOf(typed);
  return names.length > PRODUCT_REPOSITORIES_MAX
    ? { problem: `At most ${PRODUCT_REPOSITORIES_MAX} repositories.` }
    : { value: names };
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  jiraProject: 'Jira project',
  confluenceSpaces: 'Confluence spaces',
  repositories: 'Repositories',
};

/** A value in the history: a key, a list of them, or "none". */
function shown(value: unknown): string {
  if (value === null) return 'none';
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.length === 0
      ? 'none'
      : value.filter((v) => typeof v === 'string').join(', ');
  return '?';
}

/** What one Product entry of the settings history says happened, or undefined for another section's. */
export function describeProductEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'product_settings.updated') return undefined;
  const changes = isRecord(payload) ? payload['changes'] : undefined;
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([field, change]) =>
        isRecord(change)
          ? [
              `${FIELD_NAMES[field] ?? field}: ${shown(change['from'])} → ${shown(change['to'])}`,
            ]
          : []
      )
    : [];
  return words.length === 0 ? 'Saved the Product defaults' : words.join('; ');
}
