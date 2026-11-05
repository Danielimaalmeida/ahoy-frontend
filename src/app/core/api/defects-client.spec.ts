import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestViolations } from '@testing/fixtures/contract';
import getDefectSettings from '@testing/fixtures/getDefectSettings.json';
import ignoreDefect from '@testing/fixtures/ignoreDefect.json';
import listDefectSettingsEvents from '@testing/fixtures/listDefectSettingsEvents.json';
import listDefects from '@testing/fixtures/listDefects.json';
import { withField } from '@testing/fixtures/mutate';
import unignoreDefect from '@testing/fixtures/unignoreDefect.json';
import updateDefectSettings from '@testing/fixtures/updateDefectSettings.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import {
  isDefect,
  isDefectList,
  isDefectSettingsPage,
  isSettingsEventPage,
} from './guards';

const BASE = '/api/v1';

describe("the defect watch's guards", () => {
  it('accept every fixture, a list before the first pass and a pass that could not read Jira', () => {
    expect(isDefectSettingsPage(getDefectSettings)).toBe(true);
    expect(isDefectSettingsPage(updateDefectSettings)).toBe(true);
    expect(isDefectList(listDefects)).toBe(true);
    expect(isDefect(ignoreDefect)).toBe(true);
    expect(isDefect(unignoreDefect)).toBe(true);
    expect(isSettingsEventPage(listDefectSettingsEvents)).toBe(true);
    expect(isDefectList({ watchOn: false, lastPass: null, defects: [] })).toBe(
      true
    );
    expect(
      isDefectList(
        withField(listDefects, 'lastPass', {
          checkedAt: '2026-11-04T10:58:00.000Z',
          matched: null,
          error: 'Jira answered 401 for the defects query',
        })
      )
    ).toBe(true);
  });

  it('refuse an unknown triage, a blank component and a key that is not a Jira key', () => {
    const first = listDefects.defects[0]!;
    expect(isDefect({ ...first, triage: 'maybe' })).toBe(false);
    for (const key of ['proj-1', 'PROJ-0', '1PROJ-2', 'PROJ_12'])
      expect(isDefect({ ...first, key }), key).toBe(false);
    expect(
      isDefectSettingsPage(
        withField(getDefectSettings, 'defects', {
          ...getDefectSettings.defects,
          priorities: [''],
        })
      )
    ).toBe(false);
  });
});

describe("ApiClient's defect watch", () => {
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

  it('take every key Jira writes, wider than a story key', () => {
    const first = listDefects.defects[0]!;
    for (const key of ['MY_APP-12', 'A-7', 'PROJ-123'])
      expect(isDefect({ ...first, key }), key).toBe(true);
  });

  it('reads and changes the settings on their own path, as the contract takes them', async () => {
    const read = api.getDefectSettings();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/defects` })
      .flush(getDefectSettings);
    expect(await read).toEqual({ ok: true, value: getDefectSettings });

    const body = {
      watchOn: true,
      defectsJql: 'project = PROJ AND issuetype = Defect',
      priorities: ['Highest', 'High'],
    };
    const change = api.updateDefectSettings(body);
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/defects`,
    });
    expect(patch.request.body).toEqual(body);
    expect(
      requestViolations('updateDefectSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updateDefectSettings);
    expect(await change).toEqual({ ok: true, value: updateDefectSettings });
  });

  it('lists the defects, and ignores one with a reason or none and undoes it', async () => {
    const list = api.listDefects();
    http
      .expectOne({ method: 'GET', url: `${BASE}/defects` })
      .flush(listDefects);
    expect(await list).toEqual({ ok: true, value: listDefects });

    const ignore = api.ignoreDefect('PROJ-207', 'Fixed by hand');
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/defects/PROJ-207/ignore`,
    });
    expect(post.request.body).toEqual({ reason: 'Fixed by hand' });
    expect(requestViolations('ignoreDefect', post.request.body)).toEqual([]);
    post.flush(ignoreDefect);
    expect(await ignore).toEqual({ ok: true, value: ignoreDefect });

    const bare = api.ignoreDefect('PROJ-207', null);
    const bareRequest = http.expectOne(`${BASE}/defects/PROJ-207/ignore`);
    expect(bareRequest.request.body).toEqual({});
    bareRequest.flush(ignoreDefect);
    await bare;

    const undo = api.unignoreDefect('PROJ-207');
    http
      .expectOne({ method: 'POST', url: `${BASE}/defects/PROJ-207/unignore` })
      .flush(unignoreDefect);
    expect(await undo).toEqual({ ok: true, value: unignoreDefect });
  });
});
