/**
 * Jira in the team settings, in words and rules the page needs before it asks the API: a fixed field's value typed as
 * JSON, the fields Ahoy writes itself, the history of Jira's changes and the last connection test. Pure: payloads come
 * from the API as `unknown` and are read field by field. Mirrors `ahoy-hosted`'s `domain/jira-settings.ts`.
 */

/** The fields Ahoy writes from the story itself, so none can be fixed (`ahoy-hosted` `RESERVED_STORY_FIELDS`). */
export const RESERVED_JIRA_FIELDS = [
  'project',
  'issuetype',
  'summary',
  'description',
  'labels',
  'customfield_11100',
] as const;

/** Most fixed fields a story can carry. */
export const MAX_FIXED_FIELDS = 30;
/** Most characters of one fixed field's value as JSON. */
export const MAX_FIXED_FIELD_JSON_CHARS = 2000;
/** Most characters of the summary prefix. */
export const MAX_SUMMARY_PREFIX_CHARS = 40;
/** Most characters of the backlog query. */
export const MAX_BACKLOG_JQL_CHARS = 4000;

/** Whether Ahoy writes the field itself, so it cannot be fixed. */
export function isReservedJiraField(id: string): boolean {
  return (RESERVED_JIRA_FIELDS as readonly string[]).includes(
    id.trim().toLowerCase()
  );
}

/** Whether a text holds an ASCII control character (U+0000 to U+001F, or U+007F), which the API refuses in a prefix. */
export function hasControlCharacter(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A fixed field's value read from what was typed: the value, or why it is not one. */
export type FieldValueReading =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly problem: string };

/** How a JSON text's brackets stand: the closers it still owes (innermost first), or the first one that is wrong. */
type BracketReading =
  | { readonly kind: 'owed'; readonly closers: readonly string[] }
  | {
      readonly kind: 'wrong';
      readonly found: string;
      readonly expected: string | null;
    };

/** Reads a JSON text's brackets, skipping strings. */
function bracketsOf(text: string): BracketReading {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') open.push(']');
    else if (ch === '{') open.push('}');
    else if (ch === ']' || ch === '}') {
      const expected = open.pop() ?? null;
      if (expected !== ch) return { kind: 'wrong', found: ch, expected };
    }
  }
  if (inString) open.push('"');
  return { kind: 'owed', closers: open.reverse() };
}

/** Why a text that is not JSON is not, in words. */
function notJsonProblem(text: string): string {
  const brackets = bracketsOf(text);
  if (brackets.kind === 'wrong')
    return brackets.expected === null
      ? `Not valid JSON: a ${brackets.found} closes nothing.`
      : `Not valid JSON: a ${brackets.found} stands where its ${brackets.expected} should close.`;
  if (brackets.closers.length > 0)
    return `Not valid JSON: the value ends before its ${closersLabel(brackets.closers)}.`;
  return 'Not valid JSON: check the quotes, commas and brackets. Text goes in double quotes, such as "4211".';
}

/** "closing } and ]" for the closers a text still owes, in the order they are typed. */
function closersLabel(closers: readonly string[]): string {
  const names = closers.map((c) => (c === '"' ? 'quote' : c));
  const list =
    names.length === 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
  return `closing ${list}`;
}

/**
 * Reads a fixed field's value as typed: JSON as Jira's create takes it (`"4211"`, `[{"value": "Checkout"}]`). A text
 * that is not JSON says what is missing, in words.
 */
export function fieldValueOf(typed: string): FieldValueReading {
  const text = typed.trim();
  if (text === '')
    return { ok: false, problem: "Type the value as Jira's create takes it." };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problem: notJsonProblem(text) };
  }
  if (value === null)
    return {
      ok: false,
      problem: 'null is not a value: remove the field instead.',
    };
  const json = JSON.stringify(value);
  // Postgres' jsonb takes no NUL character, so the API refuses one (ahoy-hosted `fixedFieldsOf`).
  if (json.includes('\\u0000'))
    return {
      ok: false,
      problem: 'The value must not hold a NUL character (\\u0000).',
    };
  if (json.length > MAX_FIXED_FIELD_JSON_CHARS)
    return {
      ok: false,
      problem: `At most ${MAX_FIXED_FIELD_JSON_CHARS.toLocaleString('en-GB')} characters of JSON.`,
    };
  return { ok: true, value };
}

/** A fixed field's value as it is shown and typed again: compact JSON with a space after `:` and `,`. */
export function fieldValueText(value: unknown): string {
  const json = JSON.stringify(value) ?? '';
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    out += ch;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === ':' || ch === ',') out += ' ';
  }
  return out;
}

/** Jira's schema type of a field in words, for "Found in Jira: customfield_14301, a multi-select". */
export function fieldTypeLabel(type: string | null): string {
  switch (type) {
    case 'array':
      return 'a list (often a multi-select)';
    case 'option':
      return 'a single select';
    case 'string':
      return 'text';
    case 'number':
      return 'a number';
    case 'date':
      return 'a date';
    case 'user':
      return 'a user';
    case null:
      return 'of a type Jira does not say';
    default:
      return `of type ${type}`;
  }
}

/** The summary prefix as people read it: the prefix and an example, or that there is none. */
export function prefixExample(
  prefix: string,
  summary = 'Show delivery slots at checkout'
): string {
  return prefix === ''
    ? 'No prefix: the summary is the story’s title.'
    : `As in “${prefix}${summary}”`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `name` of each `{ id, name }` in a list of fields a change names. */
function fieldNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return [];
    const name = entry['name'];
    const id = entry['id'];
    if (typeof name === 'string' && name !== '') return [name];
    return typeof id === 'string' ? [id] : [];
  });
}

/** "Epic link", "Epic link and Team", "A, B and C". */
function listLabel(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The token as shown: four dots and its last four characters. */
function hintLabel(value: unknown): string {
  return typeof value === 'string' ? `••••${value}` : 'a new one';
}

/** The words of each part of a `jira_settings.updated` change. */
function jiraChangeWords(
  field: string,
  change: Readonly<Record<string, unknown>>
): string[] {
  const from = change['from'];
  const to = change['to'];
  switch (field) {
    case 'baseUrl':
      return [`Moved Jira from ${String(from)} to ${String(to)}`];
    case 'tokenHint':
      return [`Replaced the Jira token: ${hintLabel(from)} → ${hintLabel(to)}`];
    case 'backlogJql':
      if (to === null) return ['Turned the Backlog page off'];
      return [
        from === null ? 'Set the backlog query' : 'Changed the backlog query',
      ];
    case 'board': {
      if (to === null) return ['Took the crew board off'];
      const name =
        typeof change['name'] === 'string' ? ` (${change['name']})` : '';
      return [`Set the crew board to ${String(to)}${name}`];
    }
    case 'storySummaryPrefix':
      return [
        to === ''
          ? 'Removed the story summary prefix'
          : `Set the story summary prefix to “${String(to)}”`,
      ];
    case 'storyFields': {
      const words: string[] = [];
      const added = fieldNames(change['added']);
      const removed = fieldNames(change['removed']);
      const changed = fieldNames(change['changed']);
      const plural = (n: number) => (n === 1 ? 'field' : 'fields');
      if (added.length > 0)
        words.push(
          `Added the fixed ${plural(added.length)} ${listLabel(added)}`
        );
      if (changed.length > 0)
        words.push(
          `Changed the fixed ${plural(changed.length)} ${listLabel(changed)}`
        );
      if (removed.length > 0)
        words.push(
          `Removed the fixed ${plural(removed.length)} ${listLabel(removed)}`
        );
      return words;
    }
    default:
      return [`Changed ${field}`];
  }
}

/**
 * What one entry of Jira's history says happened, without who or when: "Set the crew board to 87022 (Checkout
 * board)". Undefined for an entry that is not Jira's.
 */
export function describeJiraEvent(
  type: string,
  payload: unknown
): string | undefined {
  const p = isRecord(payload) ? payload : {};
  const baseUrl =
    typeof p['baseUrl'] === 'string' ? p['baseUrl'] : 'its base URL';
  switch (type) {
    case 'jira_settings.connected':
      return `Connected Jira at ${baseUrl}, token ${hintLabel(p['tokenHint'])}`;
    case 'jira_settings.disconnected':
      return `Turned Jira off (it was at ${baseUrl})`;
    case 'jira_settings.updated': {
      const changes = p['changes'];
      const words = isRecord(changes)
        ? Object.entries(changes).flatMap(([field, change]) =>
            isRecord(change) ? jiraChangeWords(field, change) : []
          )
        : [];
      return words.length === 0 ? 'Saved the Jira settings' : words.join('; ');
    }
    default:
      return undefined;
  }
}

/** What the last connection test shows: its outcome in words and how it reads (fine or not). */
export interface JiraTestView {
  readonly good: boolean;
  readonly label: string;
  /** The longer words of a failure, for the banner; null when the test passed. */
  readonly heading: string | null;
  readonly text: string | null;
  /** The request and its answer, for the technical line; null when the test passed. */
  readonly tech: string | null;
}

/** The last test in words: "Connected as svc-ahoy", or why Jira refused or did not answer. */
export function jiraTestView(
  result: 'ok' | 'refused' | 'unreachable',
  detail: string | null
): JiraTestView {
  if (result === 'ok')
    return {
      good: true,
      label: detail ? `Connected as ${detail}` : 'Connected',
      heading: null,
      text: null,
      tech: null,
    };
  if (result === 'refused')
    return {
      good: false,
      label: 'Refused',
      heading: 'Jira refused the token',
      text: "It may have expired or been revoked. Replace it with one whose user can browse the backlog's projects.",
      tech: `GET /rest/api/2/myself → ${detail ?? 'refused'}`,
    };
  return {
    good: false,
    label: 'No answer',
    heading: "Jira didn't answer",
    text: 'Check the base URL (with its context path, such as /jira) and that the API can reach Jira.',
    tech: `GET /rest/api/2/myself → ${detail ?? 'no answer'}`,
  };
}
