import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import addEnvironment from '@testing/fixtures/addEnvironment.json';
import { requestViolations } from '@testing/fixtures/contract';
import getEnvironments from '@testing/fixtures/getEnvironments.json';
import listDefects from '@testing/fixtures/listDefects.json';
import listEnvironmentSettingsEvents from '@testing/fixtures/listEnvironmentSettingsEvents.json';
import { withField, withoutField } from '@testing/fixtures/mutate';
import reproduceDefect from '@testing/fixtures/reproduceDefect.json';
import testEnvironment from '@testing/fixtures/testEnvironment.json';
import updateEnvironment from '@testing/fixtures/updateEnvironment.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import {
  isDefect,
  isDefectList,
  isEnvironment,
  isEnvironmentsPage,
  isSettingsEventPage,
} from './guards';

const BASE = '/api/v1';
const TEST = getEnvironments.environments[0]!;
const DEMO = getEnvironments.environments[1]!;
/** The fixture's defect with a reproduction that ended. */
const REPRODUCED = listDefects.defects[1]!;

/** The page with only `row` listed. */
const pageOf = (row: unknown): unknown =>
  withField(getEnvironments, 'environments', [row]);

describe("the environments' guards", () => {
  it('accept every fixture, with and without a sign-in', () => {
    expect(isEnvironmentsPage(getEnvironments)).toBe(true);
    expect(isEnvironment(addEnvironment)).toBe(true);
    expect(isEnvironment(updateEnvironment)).toBe(true);
    expect(isEnvironment(testEnvironment)).toBe(true);
    expect(isSettingsEventPage(listEnvironmentSettingsEvents)).toBe(true);
    expect(
      isEnvironmentsPage({
        canEdit: false,
        secretsConfigured: false,
        allowedHosts: [],
        environments: [],
      })
    ).toBe(true);
  });

  it('refuse a sign-in of an unknown kind, a form without its login page and an unknown test result', () => {
    expect(isEnvironmentsPage(pageOf(DEMO))).toBe(true);
    expect(
      isEnvironmentsPage(pageOf(withField(DEMO, 'signIn', { kind: 'sso' })))
    ).toBe(false);
    expect(isEnvironmentsPage(pageOf(withField(DEMO, 'signIn', null)))).toBe(
      false
    );
    expect(
      isEnvironmentsPage(
        pageOf(withField(TEST, 'signIn', withoutField(TEST.signIn, 'loginUrl')))
      )
    ).toBe(false);
    expect(
      isEnvironmentsPage(
        pageOf(
          withField(TEST, 'lastTest', { ...TEST.lastTest, result: 'maybe' })
        )
      )
    ).toBe(false);
  });

  it('refuse a row that does not say whether it is in use, being tested or its password opens', () => {
    for (const field of ['inUse', 'testing', 'passwordReadable'])
      expect(isEnvironmentsPage(pageOf(withoutField(TEST, field))), field).toBe(
        false
      );
  });
});

describe("a defect's reproduction, as the guards read it", () => {
  const withReproduction = (reproduction: unknown): unknown =>
    withField(REPRODUCED, 'reproduction', reproduction);

  it('accept a defect never reproduced, one in progress and one with a verdict', () => {
    expect(isDefectList(listDefects)).toBe(true);
    expect(isDefect(reproduceDefect)).toBe(true);
    expect(isDefect(withReproduction(null))).toBe(true);
    expect(isDefect(REPRODUCED)).toBe(true);
  });

  it('refuse a verdict for a run in progress, and a run that ended without one', () => {
    expect(
      isDefect(
        withReproduction({ ...REPRODUCED.reproduction, status: 'running' })
      )
    ).toBe(false);
    expect(
      isDefect(withReproduction({ ...REPRODUCED.reproduction, result: null }))
    ).toBe(false);
    expect(
      isDefect(
        withReproduction({
          ...reproduceDefect.reproduction,
          status: 'timed_out',
        })
      )
    ).toBe(false);
  });

  it('refuse an unknown verdict, an unknown status and a defect that does not say', () => {
    expect(
      isDefect(
        withReproduction({
          ...REPRODUCED.reproduction,
          result: { ...REPRODUCED.reproduction!.result, verdict: 'maybe' },
        })
      )
    ).toBe(false);
    expect(
      isDefect(
        withReproduction({ ...REPRODUCED.reproduction, status: 'paused' })
      )
    ).toBe(false);
    expect(isDefect(withoutField(REPRODUCED, 'reproduction'))).toBe(false);
  });
});

describe("ApiClient's environments and reproductions", () => {
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

  it('reads the environments and adds one, as the contract takes it', async () => {
    const read = api.getEnvironments();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/environments` })
      .flush(getEnvironments);
    expect(await read).toEqual({ ok: true, value: getEnvironments });

    const body = {
      name: 'TEST',
      baseUrl: 'https://test.example.com/app',
      allowedOrigins: ['https://api.test.example.com'],
      signIn: {
        kind: 'form' as const,
        loginUrl: 'https://test.example.com/login',
        username: 'ahoy-reader',
        password: 'not a real password',
        userSelector: null,
        passwordSelector: null,
        submitSelector: null,
        signedInUrlPattern: 'https://test.example.com/app/*',
        signedInSelector: null,
      },
      writes: false,
      versionUrl: null,
    };
    const add = api.addEnvironment(body);
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/environments`,
    });
    expect(post.request.body).toEqual(body);
    expect(requestViolations('addEnvironment', post.request.body)).toEqual([]);
    post.flush(addEnvironment, { status: 201, statusText: 'Created' });
    expect(await add).toEqual({ ok: true, value: addEnvironment });
  });

  it('changes, tests and removes an environment on its own path', async () => {
    const body = {
      version: 2,
      name: 'TEST',
      baseUrl: 'https://test.example.com/app',
      allowedOrigins: [],
      signIn: { kind: 'none' as const },
      writes: true,
      versionUrl: 'https://test.example.com/version',
    };
    const change = api.updateEnvironment(TEST.id, body);
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/environments/${TEST.id}`,
    });
    expect(put.request.body).toEqual(body);
    expect(requestViolations('updateEnvironment', put.request.body)).toEqual(
      []
    );
    put.flush(updateEnvironment);
    expect(await change).toEqual({ ok: true, value: updateEnvironment });

    const test = api.testEnvironment(TEST.id);
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/environments/${TEST.id}/test`,
    });
    expect(post.request.body).toBeNull();
    post.flush(testEnvironment, { status: 202, statusText: 'Accepted' });
    expect(await test).toEqual({ ok: true, value: testEnvironment });

    const remove = api.deleteEnvironment(DEMO.id);
    http
      .expectOne({
        method: 'DELETE',
        url: `${BASE}/settings/environments/${DEMO.id}`,
      })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await remove).toEqual({ ok: true, value: null });
  });

  it('asks for a reproduction with a yes to the spend, in the settings’ environment or a named one', async () => {
    const ask = api.reproduceDefect('PROJ-207');
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/defects/PROJ-207/reproduce`,
    });
    expect(post.request.body).toEqual({ confirmSpend: true });
    expect(requestViolations('reproduceDefect', post.request.body)).toEqual([]);
    post.flush(reproduceDefect, { status: 202, statusText: 'Accepted' });
    expect(await ask).toEqual({ ok: true, value: reproduceDefect });

    const named = api.reproduceDefect('PROJ-207', DEMO.id);
    const second = http.expectOne(`${BASE}/defects/PROJ-207/reproduce`);
    expect(second.request.body).toEqual({
      confirmSpend: true,
      environmentId: DEMO.id,
    });
    expect(requestViolations('reproduceDefect', second.request.body)).toEqual(
      []
    );
    second.flush(reproduceDefect, { status: 202, statusText: 'Accepted' });
    await named;
  });

  it('gives a refusal as a value, with the API’s reason', async () => {
    const ask = api.reproduceDefect('PROJ-207');
    http.expectOne(`${BASE}/defects/PROJ-207/reproduce`).flush(
      {
        type: 'urn:ahoy:problem:invalid_state',
        title: 'invalid state',
        status: 409,
        code: 'invalid_state',
        detail: 'No environment is chosen for reproductions',
      },
      {
        status: 409,
        statusText: 'Conflict',
        headers: { 'content-type': 'application/problem+json' },
      }
    );
    const result = await ask;
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatchObject({
        code: 'invalid_state',
        detail: 'No environment is chosen for reproductions',
      });
  });
});
