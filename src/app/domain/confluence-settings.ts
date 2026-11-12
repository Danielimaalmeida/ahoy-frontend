/**
 * Team settings › Confluence in words: the checks of what an admin types before it is sent, the last connection test,
 * and what one entry of Confluence's history says. Pure: payloads come from the API as `unknown` and are read field by
 * field. Mirrors `ahoy-hosted`'s `domain/confluence.ts`.
 */

import { isRecord } from './records';

/** The most characters of a space key. */
export const MAX_SPACE_KEY_CHARS = 255;

const SPACE_KEY = /^[A-Za-z0-9_~-]+$/;

/** Why a typed space key would be refused, or null when the API should take it; blank means every space. */
export function spaceKeyProblem(typed: string): string | null {
  const key = typed.trim();
  if (key === '') return null;
  if (key.length > MAX_SPACE_KEY_CHARS || !SPACE_KEY.test(key))
    return 'A space key is one word of letters, digits, _, ~ or -, such as PROJ.';
  return null;
}

/** What the last connection test shows: its outcome in words and how it reads (fine or not). */
export interface ConfluenceTestView {
  readonly good: boolean;
  readonly label: string;
  /** The longer words of a failure, for the banner; null when the test passed. */
  readonly heading: string | null;
  readonly text: string | null;
  /** The request and its answer, for the technical line; null when the test passed. */
  readonly tech: string | null;
}

/** The last test in words: "Connected as svc-ahoy", or why Confluence refused or did not answer. */
export function confluenceTestView(
  result: 'ok' | 'refused' | 'unreachable',
  detail: string | null
): ConfluenceTestView {
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
      heading: 'Confluence refused the token',
      text: 'It may have expired or been revoked. Replace it with one whose user can see the parent pages and create pages under them.',
      tech: `GET /rest/api/user/current → ${detail ?? 'refused'}`,
    };
  return {
    good: false,
    label: 'No answer',
    heading: "Confluence didn't answer",
    text: 'Check the base URL (with its context path, such as /confluence) and that the API can reach Confluence.',
    tech: `GET /rest/api/user/current → ${detail ?? 'no answer'}`,
  };
}

/** The token as shown: four dots and its last four characters. */
function hintLabel(value: unknown): string {
  return typeof value === 'string' ? `••••${value}` : 'a new one';
}

/** The words of each part of a `confluence_settings.updated` change. */
function changeWords(field: string, change: unknown): string[] {
  if (!isRecord(change)) return [];
  const from = change['from'];
  const to = change['to'];
  switch (field) {
    case 'baseUrl':
      return [`Moved Confluence from ${String(from)} to ${String(to)}`];
    case 'tokenHint':
      return [
        `Replaced the Confluence token: ${hintLabel(from)} → ${hintLabel(to)}`,
      ];
    case 'spaceKey':
      return [
        typeof to === 'string'
          ? `Set the parent page search to space ${to}`
          : 'Set the parent page search to every space',
      ];
    default:
      return [`Changed ${field}`];
  }
}

/** What one Confluence entry of the settings history says happened, or undefined for an entry of another section. */
export function describeConfluenceEvent(
  type: string,
  payload: unknown
): string | undefined {
  const p = isRecord(payload) ? payload : {};
  const baseUrl =
    typeof p['baseUrl'] === 'string' ? p['baseUrl'] : 'its base URL';
  switch (type) {
    case 'confluence_settings.connected':
      return `Connected Confluence at ${baseUrl}, token ${hintLabel(p['tokenHint'])}`;
    case 'confluence_settings.disconnected':
      return `Turned Confluence off (it was at ${baseUrl})`;
    case 'confluence_settings.updated': {
      const changes = p['changes'];
      const words = isRecord(changes)
        ? Object.entries(changes).flatMap(([field, change]) =>
            changeWords(field, change)
          )
        : [];
      return words.length === 0
        ? 'Saved the Confluence settings'
        : words.join('; ');
    }
    default:
      return undefined;
  }
}
