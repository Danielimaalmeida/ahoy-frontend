/**
 * Team settings › Figma in words: the checks of what an admin types before it is sent, the last token test, and what
 * one entry of Figma's history says. Pure: payloads come from the API as `unknown` and are read field by field.
 */

/** The most UI builders the API takes. */
export const MAX_UI_AGENTS = 20;
/** The most characters of the design kit's prefix. */
export const MAX_SELECTOR_PREFIX_CHARS = 20;
/** The most characters of a pasted token: Figma's are about 45, so this only stops a pasted file. */
export const MAX_FIGMA_TOKEN_CHARS = 1000;

const PRINTABLE_WORD = /^[!-~]+$/;
const SELECTOR_PREFIX = /^[a-z][a-z0-9]*-?$/;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why a pasted token would be refused, or null when the API should take it. */
export function figmaTokenProblem(typed: string): string | null {
  const token = typed.trim();
  if (token === '') return 'Paste the token.';
  if (token.length > MAX_FIGMA_TOKEN_CHARS || !PRINTABLE_WORD.test(token))
    return 'A token is one word, without spaces.';
  return null;
}

/** Why a typed prefix would be refused, or null when the API should take it. */
export function selectorPrefixProblem(typed: string): string | null {
  const prefix = typed.trim();
  if (
    prefix.length > MAX_SELECTOR_PREFIX_CHARS ||
    !SELECTOR_PREFIX.test(prefix)
  )
    return 'Lower-case letters and digits, starting with a letter, such as ds-.';
  return null;
}

/** What the last token test shows: its outcome in words and how it reads (fine or not). */
export interface FigmaTestView {
  readonly good: boolean;
  readonly label: string;
  /** The longer words of a failure, for the banner; null when the test passed. */
  readonly heading: string | null;
  readonly text: string | null;
  /** The request and its answer, for the technical line; null when the test passed. */
  readonly tech: string | null;
}

/** The last test in words: "Reads as design-bot@example.com", or why Figma refused or did not answer. */
export function figmaTestView(
  result: 'ok' | 'refused' | 'unreachable',
  detail: string | null
): FigmaTestView {
  if (result === 'ok')
    return {
      good: true,
      label: detail ? `Reads as ${detail}` : 'Reads Figma',
      heading: null,
      text: null,
      tech: null,
    };
  if (result === 'refused')
    return {
      good: false,
      label: 'Refused',
      heading: 'Figma refused the token',
      text: 'It may have expired or been revoked. Save a new one from an account that can open the team’s design files.',
      tech: `GET https://api.figma.com/v1/me → ${detail ?? 'refused'}`,
    };
  return {
    good: false,
    label: 'No answer',
    heading: "Figma didn't answer",
    text: 'The API could not reach api.figma.com. Try again; if it keeps failing, the deployment may need a route to Figma.',
    tech: `GET https://api.figma.com/v1/me → ${detail ?? 'no answer'}`,
  };
}

function names(value: unknown): string {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? value.join(', ')
    : 'others';
}

function changeWords(field: string, change: unknown): string[] {
  if (!isRecord(change)) return [];
  if (field === 'uiAgents')
    return [`UI builders: ${names(change['from'])} → ${names(change['to'])}`];
  if (field === 'selectorPrefix')
    return typeof change['to'] === 'string'
      ? [`Set the design kit prefix to ${change['to']}`]
      : [];
  return [];
}

/** What one Figma entry of the settings history says happened, or undefined for an entry of another section. */
export function describeFigmaEvent(
  type: string,
  payload: unknown
): string | undefined {
  const p = isRecord(payload) ? payload : {};
  const hint = (key: string) =>
    typeof p[key] === 'string' ? `••••${p[key]}` : 'a token';
  switch (type) {
    case 'figma_settings.token_set':
      return typeof p['previousTokenHint'] === 'string'
        ? `Replaced the Figma token ${hint('previousTokenHint')} with ${hint('tokenHint')}`
        : `Saved the Figma token ${hint('tokenHint')}`;
    case 'figma_settings.token_removed':
      return `Removed the Figma token ${hint('tokenHint')}`;
    case 'figma_settings.updated': {
      const changes = p['changes'];
      const words = isRecord(changes)
        ? Object.entries(changes).flatMap(([field, change]) =>
            changeWords(field, change)
          )
        : [];
      return words.length === 0 ? 'Saved the Figma settings' : words.join('; ');
    }
    default:
      return undefined;
  }
}
