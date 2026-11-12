import { describe, expect, it } from 'vitest';
import {
  confluenceTestView,
  describeConfluenceEvent,
  MAX_SPACE_KEY_CHARS,
  spaceKeyProblem,
} from './confluence-settings';
import { describeSettingsEvent } from './settings';

describe('a Confluence space key as typed', () => {
  it('takes one word of letters, digits, _, ~ or -, and blank for every space', () => {
    expect(spaceKeyProblem('  PROJ ')).toBeNull();
    expect(spaceKeyProblem('~jdoe')).toBeNull();
    expect(spaceKeyProblem('')).toBeNull();
    for (const bad of ['PR OJ', 'PROJ!', 'a'.repeat(MAX_SPACE_KEY_CHARS + 1)])
      expect(spaceKeyProblem(bad), bad).toMatch(/one word of letters/);
  });
});

describe('the last test of the Confluence connection', () => {
  it('names the user a good token reads as', () => {
    expect(confluenceTestView('ok', 'Ahoy service')).toEqual({
      good: true,
      label: 'Connected as Ahoy service',
      heading: null,
      text: null,
      tech: null,
    });
    expect(confluenceTestView('ok', null).label).toBe('Connected');
  });

  it('tells a refusal from no answer, with the request in the technical line', () => {
    expect(confluenceTestView('refused', 'HTTP 401')).toMatchObject({
      good: false,
      label: 'Refused',
      heading: 'Confluence refused the token',
      tech: 'GET /rest/api/user/current → HTTP 401',
    });
    expect(confluenceTestView('unreachable', null)).toMatchObject({
      good: false,
      label: 'No answer',
      heading: "Confluence didn't answer",
      tech: 'GET /rest/api/user/current → no answer',
    });
  });
});

describe('the Confluence entries of the settings history', () => {
  it('show a token only as its last four, and say where pages are searched', () => {
    expect(
      describeSettingsEvent('confluence_settings.connected', {
        baseUrl: 'https://confluence.example.com/confluence',
        tokenHint: '9f3a',
      })
    ).toBe(
      'Connected Confluence at https://confluence.example.com/confluence, token ••••9f3a'
    );
    expect(
      describeConfluenceEvent('confluence_settings.updated', {
        changes: {
          tokenHint: { from: '1f2e', to: '9f3a' },
          spaceKey: { from: null, to: 'PROJ' },
        },
      })
    ).toBe(
      'Replaced the Confluence token: ••••1f2e → ••••9f3a; Set the parent page search to space PROJ'
    );
    expect(
      describeConfluenceEvent('confluence_settings.updated', {
        changes: { spaceKey: { from: 'PROJ', to: null } },
      })
    ).toBe('Set the parent page search to every space');
    expect(
      describeConfluenceEvent('confluence_settings.disconnected', {
        baseUrl: 'https://confluence.example.com',
      })
    ).toBe('Turned Confluence off (it was at https://confluence.example.com)');
  });

  it('reads a broken payload as a plain sentence, and leaves other sections alone', () => {
    expect(describeConfluenceEvent('confluence_settings.updated', null)).toBe(
      'Saved the Confluence settings'
    );
    expect(describeConfluenceEvent('confluence_settings.connected', 7)).toBe(
      'Connected Confluence at its base URL, token a new one'
    );
    expect(
      describeConfluenceEvent('jira_settings.updated', {})
    ).toBeUndefined();
  });
});
