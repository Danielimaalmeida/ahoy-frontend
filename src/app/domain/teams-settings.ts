/**
 * Team settings › Teams in words: the checks of what an admin types before it is sent, the last card, and what one
 * entry of the channel's history says. Pure: payloads come from the API as `unknown` and are read field by field.
 */
import { isRecord } from './records';
import { hasControlCharacter } from './jira-settings';

/** The most characters of a webhook's address, as the API takes it. */
export const MAX_WEBHOOK_CHARS = 2000;
/** The most characters of the UI's address, as the API takes it. */
export const MAX_UI_URL_CHARS = 500;

/** Whether a text holds white space or an ASCII control character: none belongs in an address. */
export function hasSpaceOrControl(text: string): boolean {
  return /\s/.test(text) || hasControlCharacter(text);
}

function parsed(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

/** Why a typed webhook address would be refused, or null when the API should take it. */
export function webhookProblem(typed: string): string | null {
  const text = typed.trim();
  if (text === '') return 'Paste the webhook’s address.';
  if (text.length > MAX_WEBHOOK_CHARS)
    return `The address is at most ${MAX_WEBHOOK_CHARS} characters.`;
  if (hasSpaceOrControl(text)) return 'The address has spaces in it.';
  const url = parsed(text);
  if (url?.protocol !== 'https:')
    return 'The address starts with https:// (copy it from the workflow’s trigger).';
  if (url.username !== '' || url.password !== '' || text.includes('#'))
    return 'The address must not hold a user name, a password or a #fragment.';
  return null;
}

/** The host a typed webhook goes to, for the hint under the field; null while it does not parse. */
export function webhookHost(typed: string): string | null {
  return parsed(typed.trim())?.hostname ?? null;
}

/** Why a typed UI address would be refused, or null when the API should take it. */
export function uiUrlProblem(typed: string): string | null {
  const text = typed.trim();
  if (text === '') return null;
  if (text.length > MAX_UI_URL_CHARS)
    return `The address is at most ${MAX_UI_URL_CHARS} characters.`;
  if (hasSpaceOrControl(text)) return 'The address has spaces in it.';
  const url = parsed(text);
  if (url === null || (url.protocol !== 'https:' && url.protocol !== 'http:'))
    return 'The address starts with https:// or http://.';
  if (
    url.username !== '' ||
    url.password !== '' ||
    text.includes('?') ||
    text.includes('#')
  )
    return 'Give the address of Ahoy itself, without a user, a ?query or a #fragment.';
  return null;
}

/** The UI's address as the API keeps it: trimmed, without trailing slashes; null when empty. */
export function uiUrlAsKept(typed: string): string | null {
  const url = typed.trim().replace(/\/+$/, '');
  return url === '' ? null : url;
}

/** The crew page the cards' "Open Crew" button opens, under the UI's address as kept. */
export function crewPageOf(uiUrl: string): string {
  return `${uiUrlAsKept(uiUrl) ?? ''}/crew`;
}

/** The last card in a word: "Posted" or "Not posted". */
export function cardResultLabel(result: 'posted' | 'failed'): string {
  return result === 'posted' ? 'Posted' : 'Not posted';
}

function changeWords(field: string, change: unknown): string[] {
  if (!isRecord(change)) return [];
  const value = (v: unknown, none: string) =>
    typeof v === 'string' && v !== '' ? v : none;
  if (field === 'webhookHost')
    return [
      `Replaced the crew's webhook (${value(change['from'], 'none')} → ${value(change['to'], 'none')})`,
    ];
  if (field === 'uiUrl')
    return change['to'] === null
      ? ['Removed the cards’ Open Crew button']
      : [`Set card links to ${value(change['to'], 'an address')}`];
  return [];
}

/** What one Teams entry of the settings history says happened, or undefined for an entry of another section. */
export function describeTeamsEvent(
  type: string,
  payload: unknown
): string | undefined {
  const p = isRecord(payload) ? payload : {};
  const host =
    typeof p['webhookHost'] === 'string' ? p['webhookHost'] : 'its host';
  switch (type) {
    case 'teams_settings.connected':
      return `Connected the crew's channel (${host})`;
    case 'teams_settings.disconnected':
      return `Disconnected the crew's channel (${host})`;
    case 'teams_settings.test_sent':
      return p['result'] === 'posted'
        ? 'Sent a test card'
        : `Sent a test card, which Teams did not take${typeof p['detail'] === 'string' ? `: ${p['detail']}` : ''}`;
    case 'teams_settings.updated': {
      const changes = p['changes'];
      const words = isRecord(changes)
        ? Object.entries(changes).flatMap(([field, change]) =>
            changeWords(field, change)
          )
        : [];
      return words.length === 0 ? 'Saved the Teams settings' : words.join('; ');
    }
    default:
      return undefined;
  }
}
