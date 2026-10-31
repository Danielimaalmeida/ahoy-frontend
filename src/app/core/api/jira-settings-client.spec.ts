import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestViolations } from '@testing/fixtures/contract';
import getJiraSettings from '@testing/fixtures/getJiraSettings.json';
import listJiraFields from '@testing/fixtures/listJiraFields.json';
import listJiraSettingsEvents from '@testing/fixtures/listJiraSettingsEvents.json';
import previewJiraBacklog from '@testing/fixtures/previewJiraBacklog.json';
import putJiraConnection from '@testing/fixtures/putJiraConnection.json';
import testJiraConnection from '@testing/fixtures/testJiraConnection.json';
import updateJiraSettings from '@testing/fixtures/updateJiraSettings.json';
import { withField } from '@testing/fixtures/mutate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import {
  isJiraBacklogPreview,
  isJiraFieldPage,
  isJiraSettings,
  isJiraSettingsPage,
  isJiraTest,
  isSettingsEventPage,
} from './guards';

const BASE = '/api/v1';

describe("the Jira settings' guards", () => {
  it('accept every fixture', () => {
    expect(isJiraSettingsPage(getJiraSettings)).toBe(true);
    expect(isJiraSettingsPage({ ...getJiraSettings, jira: null })).toBe(true);
    expect(isJiraSettings(updateJiraSettings)).toBe(true);
    expect(isJiraSettings(putJiraConnection)).toBe(true);
    expect(isJiraTest(testJiraConnection)).toBe(true);
    expect(isJiraBacklogPreview(previewJiraBacklog)).toBe(true);
    expect(isJiraBacklogPreview({ total: 0, first: null })).toBe(true);
    expect(isJiraFieldPage(listJiraFields)).toBe(true);
    expect(isSettingsEventPage(listJiraSettingsEvents)).toBe(true);
  });

  it('refuse a board id that is not a whole number, an unknown test result and a field without a value', () => {
    const jira = getJiraSettings.jira;
    expect(
      isJiraSettings(
        withField(jira, 'board', { id: 87022.5, name: null, type: null })
      )
    ).toBe(false);
    expect(
      isJiraSettings(
        withField(jira, 'connection', {
          ...jira.connection,
          lastTest: { result: 'maybe', detail: null, at: jira.updatedAt },
        })
      )
    ).toBe(false);
    expect(
      isJiraSettings(
        withField(jira, 'storyFields', [
          { id: 'customfield_1', name: 'A', value: null },
        ])
      )
    ).toBe(false);
    expect(
      isJiraSettings(
        withField(jira, 'storyFields', [
          { id: 'bad id', name: 'A', value: '1' },
        ])
      )
    ).toBe(false);
    expect(isJiraSettings.explain(withField(jira, 'version', 0))).toMatch(
      /JiraSettings\.version/
    );
  });
});

describe("ApiClient's Jira settings", () => {
  let http: HttpTestingController;
  let api: ApiClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiClient);
  });

  afterEach(() => http.verify());

  it('reads the settings and connects with the URL and the token, as the contract takes them', async () => {
    const read = api.getJiraSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/jira` })
      .flush(getJiraSettings);
    expect(await read).toEqual({ ok: true, value: getJiraSettings });

    const body = { baseUrl: 'https://jira.example.com/jira', token: 'a-token' };
    const connect = api.putJiraConnection(body);
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/jira/connection`,
    });
    expect(put.request.body).toEqual(body);
    expect(requestViolations('putJiraConnection', put.request.body)).toEqual(
      []
    );
    put.flush(putJiraConnection);
    expect((await connect).ok).toBe(true);
  });

  it('changes, tests, previews and turns Jira off on their own paths', async () => {
    const change = api.updateJiraSettings({ version: 5, boardId: null });
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(requestViolations('updateJiraSettings', patch.request.body)).toEqual(
      []
    );
    patch.flush(updateJiraSettings);
    expect((await change).ok).toBe(true);

    const test = api.testJiraConnection();
    http
      .expectOne({ method: 'POST', url: `${BASE}/settings/jira/test` })
      .flush(testJiraConnection);
    expect(await test).toEqual({ ok: true, value: testJiraConnection });

    const preview = api.previewJiraBacklog('project = PROJ');
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/jira/backlog-preview`,
    });
    expect(post.request.body).toEqual({ jql: 'project = PROJ' });
    post.flush(previewJiraBacklog);
    expect(await preview).toEqual({ ok: true, value: previewJiraBacklog });

    const off = api.deleteJiraSettings();
    http
      .expectOne({ method: 'DELETE', url: `${BASE}/settings/jira` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await off).toEqual({ ok: true, value: null });
  });

  it('searches the fields with the trimmed text, and the history of one section', async () => {
    const search = api.listJiraFields('  Team ');
    const fields = http.expectOne(
      (r) => r.url === `${BASE}/settings/jira/fields`
    );
    expect(fields.request.params.get('q')).toBe('Team');
    fields.flush(listJiraFields);
    expect((await search).ok).toBe(true);

    const all = api.listJiraFields('');
    const unfiltered = http.expectOne(
      (r) => r.url === `${BASE}/settings/jira/fields`
    );
    expect(unfiltered.request.params.has('q')).toBe(false);
    unfiltered.flush(listJiraFields);
    await all;

    const history = api.listSettingsEvents(50, 'jira');
    const events = http.expectOne((r) => r.url === `${BASE}/settings/events`);
    expect(events.request.params.get('limit')).toBe('50');
    expect(events.request.params.get('section')).toBe('jira');
    events.flush(listJiraSettingsEvents);
    expect((await history).ok).toBe(true);

    const everything = api.listSettingsEvents();
    const plain = http.expectOne((r) => r.url === `${BASE}/settings/events`);
    expect(plain.request.params.keys()).toEqual([]);
    plain.flush({ items: [] });
    await everything;
  });
});
