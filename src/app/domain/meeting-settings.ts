/**
 * Team settings › Meetings in words: the check of a side's name as typed, and what one entry of its history says
 * happened. Pure: the payloads come from the API as `unknown` and are read field by field.
 */

import { isRecord } from './records';

/** The most characters of one side's name, as the API takes it. */
export const MEETING_LABEL_MAX = 40;

// A line break or an ASCII control character (`\p{Cc}` without its C1 range), as the API refuses them.
const CONTROL = /(?![\u0080-\u009f])\p{Cc}/u;

/** A side's name as typed: trimmed, 1 to 40 characters on one line; or why it is refused. */
export function meetingLabelOf(
  typed: string
): { readonly value: string } | { readonly problem: string } {
  const value = typed.trim();
  if (value === '') return { problem: 'Give the side a name.' };
  if ([...value].length > MEETING_LABEL_MAX)
    return { problem: `At most ${MEETING_LABEL_MAX} characters.` };
  if (CONTROL.test(value)) return { problem: 'Keep the name on one line.' };
  return { value };
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  usLabel: 'Our side',
  themLabel: "Stakeholders' side",
};

/** A name in the history, quoted. */
function quoted(value: unknown): string {
  return typeof value === 'string' ? `“${value}”` : '?';
}

/** What one Meetings entry of the settings history says happened, or undefined for another section's. */
export function describeMeetingEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'meeting_settings.updated') return undefined;
  const changes = isRecord(payload) ? payload['changes'] : undefined;
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([field, change]) =>
        isRecord(change)
          ? [
              `${FIELD_NAMES[field] ?? field}: ${quoted(change['from'])} → ${quoted(change['to'])}`,
            ]
          : []
      )
    : [];
  return words.length === 0 ? 'Saved the meeting names' : words.join('; ');
}
