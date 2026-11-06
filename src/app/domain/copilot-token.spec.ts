import { describe, expect, it } from 'vitest';
import {
  copilotTestView,
  copilotTokenProblem,
  describeCopilotTokenEvent,
} from './copilot-token';
import { describeSettingsEvent } from './settings';

describe('a pasted Copilot token, as the page checks it before sending', () => {
  it('takes one printable word, trimmed, and refuses an empty one, spaces and a pasted file', () => {
    expect(copilotTokenProblem('  github_pat_fictional_abcd  ')).toBeNull();
    expect(copilotTokenProblem('   ')).toBe('Paste the token.');
    expect(copilotTokenProblem('two words')).toBe(
      'A token is one word, without spaces.'
    );
    expect(copilotTokenProblem('x'.repeat(256))).toBe(
      'A token is one word, without spaces.'
    );
  });
});

describe("the last test of a person's Copilot token, in words", () => {
  it('says who GitHub took it for, or why it was refused or not asked', () => {
    expect(copilotTestView('works', 'alex')).toEqual({
      good: true,
      label: 'Works as alex',
      heading: null,
      text: null,
    });
    const refused = copilotTestView('refused', 'HTTP 401');
    expect([refused.good, refused.label, refused.heading]).toEqual([
      false,
      'Refused (HTTP 401)',
      'GitHub refused the token',
    ]);
    const down = copilotTestView('unreachable', 'connect ETIMEDOUT');
    expect([down.good, down.text]).toEqual([
      false,
      'Ahoy could not check the token: connect ETIMEDOUT. It is still saved; test it again later.',
    ]);
  });

  it('names what each history entry did, with no token in it', () => {
    expect(describeCopilotTokenEvent('copilot_token.replaced')).toBe(
      'Replaced their Copilot token'
    );
    expect(describeCopilotTokenEvent('members.added')).toBeUndefined();
    expect(describeSettingsEvent('copilot_token.removed', {})).toBe(
      'Removed their Copilot token'
    );
  });
});
