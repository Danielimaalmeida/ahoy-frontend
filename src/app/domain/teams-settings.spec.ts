import { describe, expect, it } from 'vitest';
import { describeSettingsEvent } from './settings';
import {
  cardResultLabel,
  crewPageOf,
  describeTeamsEvent,
  hasSpaceOrControl,
  MAX_WEBHOOK_CHARS,
  uiUrlAsKept,
  uiUrlProblem,
  webhookHost,
  webhookProblem,
} from './teams-settings';

const WEBHOOK =
  'https://prod-12.westeurope.logic.example.com/workflows/abc/triggers/manual/paths/invoke?sig=x';

describe('a webhook typed for the crew’s channel', () => {
  it('takes an https address with a query, and names the host the cards go to', () => {
    expect(webhookProblem(`  ${WEBHOOK} `)).toBeNull();
    expect(webhookHost(WEBHOOK)).toBe('prod-12.westeurope.logic.example.com');
    expect(webhookHost('not an address')).toBeNull();
  });

  it('refuses nothing, http, spaces, a user, a fragment and an address too long', () => {
    expect(webhookProblem('  ')).toBe('Paste the webhook’s address.');
    expect(webhookProblem('http://example.com/hook')).toMatch(/https:\/\//);
    expect(webhookProblem('https://example.com/a b')).toBe(
      'The address has spaces in it.'
    );
    expect(webhookProblem('https://example.com/a\u0007')).toBe(
      'The address has spaces in it.'
    );
    expect(webhookProblem('https://user:pw@example.com/hook')).toMatch(
      /user name/
    );
    expect(webhookProblem('https://example.com/hook#x')).toMatch(/#fragment/);
    expect(
      webhookProblem(`https://example.com/${'a'.repeat(MAX_WEBHOOK_CHARS)}`)
    ).toMatch(/at most 2000/);
  });

  it('tells white space and control characters from ordinary text', () => {
    expect(hasSpaceOrControl('https://example.com/é')).toBe(false);
    expect(hasSpaceOrControl('a\tb')).toBe(true);
    expect(hasSpaceOrControl('a\u007fb')).toBe(true);
  });
});

describe('the address the cards’ Open Crew button opens', () => {
  it('may be empty, http or https, with a path', () => {
    expect(uiUrlProblem('')).toBeNull();
    expect(uiUrlProblem('https://ahoy.example.com/team/')).toBeNull();
    expect(uiUrlProblem('http://localhost:4200')).toBeNull();
  });

  it('refuses another scheme, a query, a fragment and a user', () => {
    expect(uiUrlProblem('ftp://ahoy.example.com')).toMatch(
      /https:\/\/ or http:\/\//
    );
    expect(uiUrlProblem('ahoy.example.com')).toMatch(/https:\/\/ or http:\/\//);
    expect(uiUrlProblem('https://ahoy.example.com/?a=1')).toMatch(/\?query/);
    expect(uiUrlProblem('https://ahoy.example.com/#x')).toMatch(/#fragment/);
    expect(uiUrlProblem('https://a@ahoy.example.com')).toMatch(
      /without a user/
    );
  });

  it('opens the Crew page under the address, whatever its trailing slashes', () => {
    expect(crewPageOf('https://ahoy.example.com')).toBe(
      'https://ahoy.example.com/crew'
    );
    expect(crewPageOf('https://ahoy.example.com/team//')).toBe(
      'https://ahoy.example.com/team/crew'
    );
    expect(uiUrlAsKept('  https://ahoy.example.com/team// ')).toBe(
      'https://ahoy.example.com/team'
    );
    expect(uiUrlAsKept('   ')).toBeNull();
    expect(cardResultLabel('posted')).toBe('Posted');
    expect(cardResultLabel('failed')).toBe('Not posted');
  });
});

describe('the Teams entries of the settings history', () => {
  it('say which channel was connected, changed, tested or disconnected, by its host only', () => {
    expect(
      describeSettingsEvent('teams_settings.connected', {
        webhookHost: 'a.example.com',
      })
    ).toBe("Connected the crew's channel (a.example.com)");
    expect(describeTeamsEvent('teams_settings.disconnected', {})).toBe(
      "Disconnected the crew's channel (its host)"
    );
    expect(
      describeTeamsEvent('teams_settings.test_sent', { result: 'posted' })
    ).toBe('Sent a test card');
    expect(
      describeTeamsEvent('teams_settings.test_sent', {
        result: 'failed',
        detail: 'HTTP 404',
      })
    ).toBe('Sent a test card, which Teams did not take: HTTP 404');
    expect(
      describeTeamsEvent('teams_settings.updated', {
        changes: {
          webhookHost: { from: 'a.example.com', to: 'b.example.com' },
          uiUrl: { from: null, to: 'https://ahoy.example.com' },
        },
      })
    ).toBe(
      "Replaced the crew's webhook (a.example.com → b.example.com); Set card links to https://ahoy.example.com"
    );
    expect(
      describeTeamsEvent('teams_settings.updated', {
        changes: { uiUrl: { from: 'x', to: null } },
      })
    ).toBe('Removed the cards’ Open Crew button');
  });

  it('read a broken payload as a plain sentence, and leave other sections alone', () => {
    expect(describeTeamsEvent('teams_settings.updated', 'nonsense')).toBe(
      'Saved the Teams settings'
    );
    expect(
      describeTeamsEvent('teams_settings.updated', { changes: { other: 1 } })
    ).toBe('Saved the Teams settings');
    expect(describeTeamsEvent('jira_settings.updated', {})).toBeUndefined();
  });
});
