import { describe, expect, it } from 'vitest';
import {
  describeFigmaEvent,
  figmaTestView,
  figmaTokenProblem,
  MAX_FIGMA_TOKEN_CHARS,
  selectorPrefixProblem,
} from './figma-settings';
import { describeSettingsEvent } from './settings';

describe('a Figma token and a design kit prefix as typed', () => {
  it('take one printable word as a token, trimmed', () => {
    expect(figmaTokenProblem('  figd_abc-123  ')).toBeNull();
    expect(figmaTokenProblem('')).toBe('Paste the token.');
    expect(figmaTokenProblem('figd abc')).toBe(
      'A token is one word, without spaces.'
    );
    expect(figmaTokenProblem('figd_é')).toBe(
      'A token is one word, without spaces.'
    );
    expect(figmaTokenProblem('a'.repeat(MAX_FIGMA_TOKEN_CHARS + 1))).toBe(
      'A token is one word, without spaces.'
    );
  });

  it('take a lower-case prefix that starts with a letter and may end in one dash', () => {
    expect(selectorPrefixProblem('ds-')).toBeNull();
    expect(selectorPrefixProblem('cma2')).toBeNull();
    for (const bad of ['', 'Ds-', '1ds', 'ds--', 'd-s', 'a'.repeat(21)])
      expect(selectorPrefixProblem(bad), bad).toMatch(/Lower-case letters/);
  });
});

describe('the last test of the Figma token', () => {
  it('names the account a good token reads as', () => {
    expect(figmaTestView('ok', 'design-bot@example.com')).toEqual({
      good: true,
      label: 'Reads as design-bot@example.com',
      heading: null,
      text: null,
      tech: null,
    });
    expect(figmaTestView('ok', null).label).toBe('Reads Figma');
  });

  it('tells a refusal from no answer, with the request in the technical line', () => {
    const refused = figmaTestView('refused', 'HTTP 403');
    expect(refused).toMatchObject({
      good: false,
      label: 'Refused',
      heading: 'Figma refused the token',
    });
    expect(refused.tech).toBe('GET https://api.figma.com/v1/me → HTTP 403');
    const silent = figmaTestView('unreachable', null);
    expect(silent).toMatchObject({
      good: false,
      label: 'No answer',
      heading: "Figma didn't answer",
    });
    expect(silent.tech).toBe('GET https://api.figma.com/v1/me → no answer');
  });
});

describe('the Figma entries of the settings history', () => {
  it('show a token only as its last four, and say what the design phase changed to', () => {
    expect(
      describeSettingsEvent('figma_settings.token_set', {
        tokenHint: 'c9d4',
        previousTokenHint: '1f2e',
      })
    ).toBe('Replaced the Figma token ••••1f2e with ••••c9d4');
    expect(
      describeFigmaEvent('figma_settings.token_set', { tokenHint: 'c9d4' })
    ).toBe('Saved the Figma token ••••c9d4');
    expect(describeFigmaEvent('figma_settings.token_removed', {})).toBe(
      'Removed the Figma token a token'
    );
    expect(
      describeFigmaEvent('figma_settings.updated', {
        changes: {
          uiAgents: {
            from: ['ahoy-frontend-developer'],
            to: ['ahoy-frontend-developer', 'mobile-developer'],
          },
          selectorPrefix: { from: 'cma-', to: 'ds-' },
        },
      })
    ).toBe(
      'UI builders: ahoy-frontend-developer → ahoy-frontend-developer, mobile-developer; Set the design kit prefix to ds-'
    );
  });

  it('read a broken payload as a plain sentence, and leave other sections alone', () => {
    expect(describeFigmaEvent('figma_settings.updated', null)).toBe(
      'Saved the Figma settings'
    );
    expect(
      describeFigmaEvent('figma_settings.updated', {
        changes: { uiAgents: { from: 1, to: [2] } },
      })
    ).toBe('UI builders: others → others');
    expect(describeFigmaEvent('teams_settings.updated', {})).toBeUndefined();
  });
});
