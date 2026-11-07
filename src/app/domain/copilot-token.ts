/**
 * My Copilot token in words (`ahoy-hosted` design D23, §5 "My Copilot token"): the check of a pasted token before it
 * is sent, what the last test found, and what a token's history entry says. Pure: payloads come from the API.
 */

/** The most characters the API takes: GitHub's tokens are about 93. */
export const MAX_COPILOT_TOKEN_CHARS = 255;

const PRINTABLE_WORD = /^[!-~]+$/;

/** Why a pasted token would be refused, or null when the API should take it. */
export function copilotTokenProblem(typed: string): string | null {
  const token = typed.trim();
  if (token === '') return 'Paste the token.';
  if (token.length > MAX_COPILOT_TOKEN_CHARS || !PRINTABLE_WORD.test(token))
    return 'A token is one word, without spaces.';
  return null;
}

/** What a test of the token can find. */
export type CopilotTestResult = 'works' | 'refused' | 'unreachable';

/** The last test in words: whether it is fine, a short label, and the longer words of a failure. */
export interface CopilotTestView {
  readonly good: boolean;
  readonly label: string;
  /** The banner's heading and text for a failure; null when GitHub took the token. */
  readonly heading: string | null;
  readonly text: string | null;
}

/** "Works as alex", or why GitHub refused the token or could not be asked. */
export function copilotTestView(
  result: CopilotTestResult,
  detail: string | null
): CopilotTestView {
  switch (result) {
    case 'works':
      return {
        good: true,
        label: detail ? `Works as ${detail}` : 'Works',
        heading: null,
        text: null,
      };
    case 'refused':
      return {
        good: false,
        label: detail ? `Refused (${detail})` : 'Refused',
        heading: 'GitHub refused the token',
        text: 'It may have expired or been revoked. Make a new one with only Copilot Requests and save it here; until then your runs may fail to sign in to Copilot.',
      };
    case 'unreachable':
      return {
        good: false,
        label: 'GitHub could not be asked',
        heading: 'GitHub could not be asked',
        text: detail
          ? `Ahoy could not check the token: ${detail}. It is still saved; test it again later.`
          : 'Ahoy could not check the token. It is still saved; test it again later.',
      };
  }
}

/** What one entry of a person's token history says happened, or undefined for another section's. */
export function describeCopilotTokenEvent(type: string): string | undefined {
  switch (type) {
    case 'copilot_token.saved':
      return 'Saved their Copilot token';
    case 'copilot_token.replaced':
      return 'Replaced their Copilot token';
    case 'copilot_token.removed':
      return 'Removed their Copilot token';
    default:
      return undefined;
  }
}
