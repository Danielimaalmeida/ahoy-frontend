import { describe, expect, it } from 'vitest';
import {
  describeJiraEvent,
  fieldTypeLabel,
  fieldValueOf,
  fieldValueText,
  isReservedJiraField,
  jiraTestView,
  prefixExample,
} from './jira-settings';
import { describeSettingsEvent } from './settings';

describe('a fixed field value typed as JSON', () => {
  it('reads text, an option and a list as Jira create takes them', () => {
    expect(fieldValueOf(' "4211" ')).toEqual({ ok: true, value: '4211' });
    expect(fieldValueOf('[{"value": "Checkout"}]')).toEqual({
      ok: true,
      value: [{ value: 'Checkout' }],
    });
    expect(fieldValueOf('12')).toEqual({ ok: true, value: 12 });
  });

  it('says which closers are missing, in the order they are typed', () => {
    expect(fieldValueOf('[{"value": "RT-4"')).toEqual({
      ok: false,
      problem: 'Not valid JSON: the value ends before its closing } and ].',
    });
    expect(fieldValueOf('"RT-4')).toEqual({
      ok: false,
      problem: 'Not valid JSON: the value ends before its closing quote.',
    });
  });

  it('refuses words without quotes, null, nothing and a value too long', () => {
    expect(fieldValueOf('Checkout')).toEqual({
      ok: false,
      problem: expect.stringContaining('double quotes'),
    });
    expect(fieldValueOf('null')).toEqual({
      ok: false,
      problem: 'null is not a value: remove the field instead.',
    });
    expect(fieldValueOf('  ')).toMatchObject({ ok: false });
    expect(fieldValueOf(JSON.stringify('x'.repeat(2001)))).toEqual({
      ok: false,
      problem: 'At most 2,000 characters of JSON.',
    });
  });

  it('shows a stored value as it is typed again, with spaces after colons and commas outside strings', () => {
    expect(fieldValueText([{ value: 'Checkout, web' }])).toBe(
      '[{"value": "Checkout, web"}]'
    );
    expect(fieldValueText('4211')).toBe('"4211"');
    expect(fieldValueText(['PROJ-6', 'PROJ-7'])).toBe('["PROJ-6", "PROJ-7"]');
  });
});

describe('the fields Ahoy writes itself', () => {
  it('cannot be fixed, whatever their case', () => {
    expect(isReservedJiraField('summary')).toBe(true);
    expect(isReservedJiraField(' Labels ')).toBe(true);
    expect(isReservedJiraField('customfield_11100')).toBe(true);
    expect(isReservedJiraField('customfield_11200')).toBe(false);
  });
});

describe("Jira's history in words", () => {
  const updated = (changes: object) =>
    describeJiraEvent('jira_settings.updated', { changes });

  it('says Jira was connected or turned off, with its address and the token only as its last four', () => {
    expect(
      describeJiraEvent('jira_settings.connected', {
        baseUrl: 'https://jira.example.com/jira',
        tokenHint: '02be',
      })
    ).toBe('Connected Jira at https://jira.example.com/jira, token ••••02be');
    expect(
      describeJiraEvent('jira_settings.disconnected', {
        baseUrl: 'https://jira.example.com/jira',
      })
    ).toBe('Turned Jira off (it was at https://jira.example.com/jira)');
  });

  it('names each change: the token, the query, the board, the prefix and the fields', () => {
    expect(updated({ tokenHint: { from: '02be', to: '7c21' } })).toBe(
      'Replaced the Jira token: ••••02be → ••••7c21'
    );
    expect(updated({ backlogJql: { from: 'a', to: 'b' } })).toBe(
      'Changed the backlog query'
    );
    expect(updated({ backlogJql: { from: null, to: 'b' } })).toBe(
      'Set the backlog query'
    );
    expect(updated({ backlogJql: { from: 'a', to: null } })).toBe(
      'Turned the Backlog page off'
    );
    expect(
      updated({ board: { from: null, to: 87022, name: 'Checkout board' } })
    ).toBe('Set the crew board to 87022 (Checkout board)');
    expect(updated({ board: { from: 87022, to: null } })).toBe(
      'Took the crew board off'
    );
    expect(updated({ storySummaryPrefix: { from: '', to: '[PROJ] ' } })).toBe(
      'Set the story summary prefix to “[PROJ] ”'
    );
    expect(
      updated({
        storyFields: {
          added: [{ id: 'customfield_14300', name: 'Epic link' }],
          removed: [
            { id: 'customfield_1', name: 'A' },
            { id: 'customfield_2', name: '' },
          ],
        },
      })
    ).toBe(
      'Added the fixed field Epic link; Removed the fixed fields A and customfield_2'
    );
    expect(
      updated({
        baseUrl: { from: 'https://a.example.com', to: 'https://b.example.com' },
        tokenHint: { from: '02be', to: '7c21' },
      })
    ).toBe(
      'Moved Jira from https://a.example.com to https://b.example.com; Replaced the Jira token: ••••02be → ••••7c21'
    );
    expect(updated({})).toBe('Saved the Jira settings');
  });

  it('reads through the settings history, and leaves other types to it', () => {
    expect(
      describeSettingsEvent('jira_settings.updated', {
        changes: { board: { from: 1, to: 2 } },
      })
    ).toBe('Set the crew board to 2');
    expect(describeJiraEvent('sonar_server.deleted', {})).toBeUndefined();
    expect(describeSettingsEvent('something.new', {})).toBe('something.new');
  });
});

describe('the last connection test in words', () => {
  it('names who the token is, or why Jira refused it or did not answer, with the request', () => {
    expect(jiraTestView('ok', 'Ahoy service (svc-ahoy)')).toMatchObject({
      good: true,
      label: 'Connected as Ahoy service (svc-ahoy)',
    });
    expect(jiraTestView('refused', 'HTTP 401')).toEqual({
      good: false,
      label: 'Refused',
      heading: 'Jira refused the token',
      text: "It may have expired or been revoked. Replace it with one whose user can browse the backlog's projects.",
      tech: 'GET /rest/api/2/myself → HTTP 401',
    });
    expect(jiraTestView('unreachable', 'connect ECONNREFUSED')).toMatchObject({
      good: false,
      heading: "Jira didn't answer",
      tech: 'GET /rest/api/2/myself → connect ECONNREFUSED',
    });
  });
});

describe('words for the settings', () => {
  it('names a field type and shows the prefix in an example', () => {
    expect(fieldTypeLabel('option')).toBe('a single select');
    expect(fieldTypeLabel(null)).toBe('of a type Jira does not say');
    expect(fieldTypeLabel('team')).toBe('of type team');
    expect(prefixExample('[PROJ] ')).toBe(
      'As in “[PROJ] Show delivery slots at checkout”'
    );
    expect(prefixExample('')).toContain('No prefix');
  });
});
