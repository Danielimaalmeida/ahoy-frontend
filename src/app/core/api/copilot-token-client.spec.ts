import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { requestViolations } from '@testing/fixtures/contract';
import deleteMyCopilotToken from '@testing/fixtures/deleteMyCopilotToken.json';
import getMyCopilotToken from '@testing/fixtures/getMyCopilotToken.json';
import putMyCopilotToken from '@testing/fixtures/putMyCopilotToken.json';
import testMyCopilotToken from '@testing/fixtures/testMyCopilotToken.json';
import { withField } from '@testing/fixtures/mutate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from './api-base';
import { ApiClient } from './api-client';
import { isCopilotTokenTest, isMyCopilotToken } from './guards';

const BASE = '/api/v1';

describe("the guards of a person's own Copilot token", () => {
  it('accept every fixture, and refuse a token shown whole or an unknown test result', () => {
    expect(isMyCopilotToken(getMyCopilotToken)).toBe(true);
    expect(isMyCopilotToken(putMyCopilotToken)).toBe(true);
    expect(isMyCopilotToken(deleteMyCopilotToken)).toBe(true);
    expect(isCopilotTokenTest(testMyCopilotToken)).toBe(true);
    expect(
      isMyCopilotToken(
        withField(getMyCopilotToken, 'token', 'github_pat_fictional')
      )
    ).toBe(false);
    expect(
      isMyCopilotToken(
        withField(getMyCopilotToken, 'token', {
          ...getMyCopilotToken.token,
          hint: 'github_pat_fictional',
        })
      )
    ).toBe(false);
    expect(isCopilotTokenTest({ ...testMyCopilotToken, result: 'ok' })).toBe(
      false
    );
  });
});

describe("ApiClient's My Copilot token", () => {
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

  it('reads, saves, tests and removes the token on its own paths', async () => {
    const read = api.getMyCopilotToken();
    http
      .expectOne({ method: 'GET', url: `${BASE}/me/copilot-token` })
      .flush(getMyCopilotToken);
    expect(await read).toEqual({ ok: true, value: getMyCopilotToken });

    const save = api.putMyCopilotToken({ token: 'github_pat_fictional_abcd' });
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/me/copilot-token`,
    });
    expect(requestViolations('putMyCopilotToken', put.request.body)).toEqual(
      []
    );
    put.flush(putMyCopilotToken);
    expect((await save).ok).toBe(true);

    const test = api.testMyCopilotToken();
    http
      .expectOne({ method: 'POST', url: `${BASE}/me/copilot-token/test` })
      .flush(testMyCopilotToken);
    expect(await test).toEqual({ ok: true, value: testMyCopilotToken });

    const remove = api.deleteMyCopilotToken();
    http
      .expectOne({ method: 'DELETE', url: `${BASE}/me/copilot-token` })
      .flush(deleteMyCopilotToken);
    expect(await remove).toEqual({ ok: true, value: deleteMyCopilotToken });
  });
});
