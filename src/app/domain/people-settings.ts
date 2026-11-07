/**
 * Team settings › People in words: the check of a qnumber as typed, and what one entry of its history says happened.
 * Pure: the payloads come from the API as `unknown` and are read field by field.
 */

import { isRecord } from './records';

/** A qnumber: `q` then 1 to 62 letters or digits, as the API takes it. */
const QNUMBER = /^q[a-z0-9]{1,62}$/;

/** A qnumber as typed: trimmed and lower-cased; or why it is refused. */
export function qnumberOf(
  typed: string
): { readonly value: string } | { readonly problem: string } {
  const value = typed.trim().toLowerCase();
  if (value === '') return { problem: 'Give a qnumber.' };
  if (!QNUMBER.test(value))
    return {
      problem: 'A qnumber is q then letters or digits, such as q123456.',
    };
  return { value };
}

/** A role in words. */
export function roleLabel(role: unknown): string {
  if (role === 'admin') return 'Admin';
  if (role === 'member') return 'Member';
  return '?';
}

/** What one People entry of the settings history says happened, or undefined for another section's. */
export function describePeopleEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (!type.startsWith('members.')) return undefined;
  const fields = isRecord(payload) ? payload : {};
  const who = typeof fields['qnumber'] === 'string' ? fields['qnumber'] : '?';
  switch (type) {
    case 'members.added':
      return `Added ${who} as ${roleLabel(fields['role']).toLowerCase()}`;
    case 'members.removed':
      return `Removed ${who}`;
    case 'members.role_changed': {
      const changes = isRecord(fields['changes']) ? fields['changes'] : {};
      const role = isRecord(changes['role']) ? changes['role'] : {};
      return `${who}: ${roleLabel(role['from'])} → ${roleLabel(role['to'])}`;
    }
    default:
      return `Changed ${who}`;
  }
}
