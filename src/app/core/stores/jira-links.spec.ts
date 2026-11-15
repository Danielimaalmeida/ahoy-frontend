import { TestBed } from '@angular/core/testing';
import { ok } from '@core/api/api-error';
import type { JiraSettingsPage } from '@core/api/types';
import { AppConfigStore } from '@core/config/app-config';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { JiraLinks, jiraBaseOf } from './jira-links';

/** Settings › Jira connected to `baseUrl`; fictional data. */
function settingsWith(baseUrl: string): JiraSettingsPage {
  return {
    canEdit: false,
    secretsConfigured: true,
    tokenReadable: true,
    jira: {
      connection: {
        baseUrl,
        tokenHint: '02be',
        tokenSetBy: 'admin@example.com',
        tokenSetByName: null,
        tokenSetAt: '2026-10-01T08:00:00.000Z',
        lastTest: null,
      },
      backlogJql: 'project = PROJ',
      board: null,
      currentSprint: null,
      storySummaryPrefix: '',
      storyFields: [],
      version: 1,
      updatedBy: 'admin@example.com',
      updatedByName: null,
      updatedAt: '2026-10-01T08:00:00.000Z',
    },
  };
}

describe('jiraBaseOf', () => {
  it('keeps an http(s) URL without its trailing slashes and refuses anything else', () => {
    expect(jiraBaseOf('https://jira.team.example/jira//')).toBe(
      'https://jira.team.example/jira'
    );
    expect(jiraBaseOf('javascript:alert(1)')).toBeNull();
    expect(jiraBaseOf('not a url')).toBeNull();
  });
});

describe('JiraLinks', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: provideFakes({
        api,
        clock: new FakeClock(),
        net: new FakeFetch(),
      }),
    });
  });

  it('links nowhere without a Jira in Settings or /config.json', async () => {
    const links = TestBed.inject(JiraLinks);
    await links.load();
    expect(links.issueUrl('PROJ-123')).toBeNull();
  });

  it('falls back to jiraBaseUrl from /config.json', () => {
    const config = TestBed.inject(AppConfigStore);
    config.set({ ...config.config(), jiraBaseUrl: 'https://jira.example.com' });
    expect(TestBed.inject(JiraLinks).issueUrl('PROJ-123')).toBe(
      'https://jira.example.com/browse/PROJ-123'
    );
  });

  it('prefers the Jira connected in Settings, read once', async () => {
    api.on('getJiraSettings', () =>
      Promise.resolve(ok(settingsWith('https://jira.team.example/jira/')))
    );
    const config = TestBed.inject(AppConfigStore);
    config.set({ ...config.config(), jiraBaseUrl: 'https://jira.example.com' });
    const links = TestBed.inject(JiraLinks);
    await links.load();
    await links.load();
    expect(links.issueUrl('PROJ-123')).toBe(
      'https://jira.team.example/jira/browse/PROJ-123'
    );
    expect(api.callsOf('getJiraSettings')).toHaveLength(1);
  });

  it('reads Settings again after a failed read', async () => {
    const links = TestBed.inject(JiraLinks);
    await links.load();
    api.on('getJiraSettings', () =>
      Promise.resolve(ok(settingsWith('https://jira.team.example')))
    );
    await links.load();
    expect(links.issueUrl('PROJ-9')).toBe(
      'https://jira.team.example/browse/PROJ-9'
    );
  });
});
