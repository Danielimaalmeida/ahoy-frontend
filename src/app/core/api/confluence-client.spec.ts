import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestViolations } from '@testing/fixtures/contract';
import createMeetingConfluencePage from '@testing/fixtures/createMeetingConfluencePage.json';
import getConfluenceSettings from '@testing/fixtures/getConfluenceSettings.json';
import listConfluenceSettingsEvents from '@testing/fixtures/listConfluenceSettingsEvents.json';
import listMeetingSeries from '@testing/fixtures/listMeetingSeries.json';
import { withField } from '@testing/fixtures/mutate';
import putConfluenceConnection from '@testing/fixtures/putConfluenceConnection.json';
import searchConfluencePages from '@testing/fixtures/searchConfluencePages.json';
import testConfluenceConnection from '@testing/fixtures/testConfluenceConnection.json';
import updateConfluenceSettings from '@testing/fixtures/updateConfluenceSettings.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import {
  isConfluencePageList,
  isConfluenceSettings,
  isConfluenceSettingsPage,
  isConfluenceTest,
  isMeeting,
  isMeetingSeriesList,
  isSettingsEventPage,
} from './guards';

const BASE = '/api/v1';

describe("Confluence's guards", () => {
  it('accept every fixture, Confluence off, and a meeting with its page', () => {
    expect(isConfluenceSettingsPage(getConfluenceSettings)).toBe(true);
    expect(
      isConfluenceSettingsPage({ ...getConfluenceSettings, confluence: null })
    ).toBe(true);
    expect(isConfluenceSettings(putConfluenceConnection)).toBe(true);
    expect(isConfluenceSettings(updateConfluenceSettings)).toBe(true);
    expect(isConfluenceTest(testConfluenceConnection)).toBe(true);
    expect(isConfluencePageList(searchConfluencePages)).toBe(true);
    expect(isMeeting(createMeetingConfluencePage)).toBe(true);
    expect(isMeetingSeriesList(listMeetingSeries)).toBe(true);
    expect(isSettingsEventPage(listConfluenceSettingsEvents)).toBe(true);
  });

  it('refuse a token shown whole, a page id that is not a number and a link that is not a web address', () => {
    const confluence = getConfluenceSettings.confluence;
    expect(
      isConfluenceSettings(
        withField(confluence, 'connection', {
          ...confluence.connection,
          tokenHint: 'whole-token',
        })
      )
    ).toBe(false);
    expect(
      isConfluencePageList({
        items: [{ ...searchConfluencePages.items[0], id: 'abc' }],
      })
    ).toBe(false);
    expect(
      isMeeting(
        withField(createMeetingConfluencePage, 'confluencePage', {
          ...createMeetingConfluencePage.confluencePage,
          url: 'javascript:alert(1)',
        })
      )
    ).toBe(false);
    expect(
      isMeeting(withField(createMeetingConfluencePage, 'confluenceParent', 7))
    ).toBe(false);
  });
});

describe("ApiClient's Confluence", () => {
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

  it('reads, connects, changes, tests and disconnects Confluence on its own paths', async () => {
    const read = api.getConfluenceSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/confluence` })
      .flush(getConfluenceSettings);
    expect(await read).toEqual({ ok: true, value: getConfluenceSettings });

    const body = {
      version: 2,
      baseUrl: 'https://confluence.example.com/confluence',
      token: 'example-token',
    };
    const connect = api.putConfluenceConnection(body);
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/confluence/connection`,
    });
    expect(put.request.body).toEqual(body);
    expect(
      requestViolations('putConfluenceConnection', put.request.body)
    ).toEqual([]);
    put.flush(putConfluenceConnection);
    expect(await connect).toEqual({ ok: true, value: putConfluenceConnection });

    const change = api.updateConfluenceSettings({ version: 2, spaceKey: null });
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/confluence`,
    });
    expect(
      requestViolations('updateConfluenceSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updateConfluenceSettings);
    expect((await change).ok).toBe(true);

    const test = api.testConfluenceConnection();
    http
      .expectOne({ method: 'POST', url: `${BASE}/settings/confluence/test` })
      .flush(testConfluenceConnection);
    expect(await test).toEqual({ ok: true, value: testConfluenceConnection });

    const off = api.deleteConfluenceSettings();
    http
      .expectOne({ method: 'DELETE', url: `${BASE}/settings/confluence` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await off).toEqual({ ok: true, value: null });
  });

  it('searches pages with the trimmed query, and none for a blank one', async () => {
    const found = api.searchConfluencePages('  finance notes ');
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url === `${BASE}/confluence/pages` &&
          r.params.get('q') === 'finance notes'
      )
      .flush(searchConfluencePages);
    expect(await found).toEqual({ ok: true, value: searchConfluencePages });

    const latest = api.searchConfluencePages(' ');
    const all = http.expectOne({
      method: 'GET',
      url: `${BASE}/confluence/pages`,
    });
    expect(all.request.params.has('q')).toBe(false);
    all.flush({ items: [] });
    expect(await latest).toEqual({ ok: true, value: { items: [] } });
  });

  it("creates a meeting's page and answers the meeting with it", async () => {
    const body = {
      parentId: '100003',
      title: 'Finance sync · Tue 6 Oct 2026',
      body: 'h1. Finance sync',
    };
    const created = api.createMeetingConfluencePage('m/1', body);
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/meetings/m%2F1/confluence-page`,
    });
    expect(
      requestViolations('createMeetingConfluencePage', post.request.body)
    ).toEqual([]);
    post.flush(createMeetingConfluencePage, {
      status: 201,
      statusText: 'Created',
    });
    expect(await created).toEqual({
      ok: true,
      value: createMeetingConfluencePage,
    });
  });
});
