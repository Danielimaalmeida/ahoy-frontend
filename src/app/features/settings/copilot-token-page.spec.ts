import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import {
  bannerHeadings,
  buttonNamed,
  buttonsNamed,
  definition,
  field,
  problem,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import deleteMyCopilotToken from '@testing/fixtures/deleteMyCopilotToken.json';
import getMyCopilotToken from '@testing/fixtures/getMyCopilotToken.json';
import putMyCopilotToken from '@testing/fixtures/putMyCopilotToken.json';
import testMyCopilotToken from '@testing/fixtures/testMyCopilotToken.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CopilotTokenPage } from './copilot-token-page';

const BASE = '/api/v1';
const PATH = `${BASE}/me/copilot-token`;
const TOKEN = 'github_pat_fictional_0000abcd';

describe('My Copilot token in Team settings', () => {
  let fixture: ComponentFixture<CopilotTokenPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function respond(
    request: TestRequest,
    body: object | null,
    status = 200
  ): Promise<void> {
    if (status >= 400)
      request.flush(body, {
        status,
        statusText: 'Refused',
        headers: { 'content-type': 'application/problem+json' },
      });
    else request.flush(body);
    await settle();
  }

  const read = () => http.expectOne({ method: 'GET', url: PATH });
  /** Setup is read again after each change, since its last step is this token. */
  const setupReads = () =>
    http.match({ method: 'GET', url: `${BASE}/setup` }).length;
  const input = () =>
    field(
      root,
      root.querySelector('dt') ? 'New token' : 'Personal access token'
    );
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CopilotTokenPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => http.verify());

  it('shows a saved token only as its last four characters, with who GitHub took it for', async () => {
    await respond(read(), getMyCopilotToken);
    expect(definition(root, 'Token')).toContain('••••wxyz');
    expect(definition(root, 'Last test')).toContain('Works as alex');
    expect(text(root)).not.toContain(TOKEN);
    expect(text(root)).toContain('AHOY_COPILOT_Q1ABCDE');
    expect(bannerHeadings(root)).toEqual([]);
  });

  it('saves a pasted token as the contract takes it, then clears the field and reads Setup again', async () => {
    await respond(read(), deleteMyCopilotToken);
    expect(text(root)).toContain('ahoy-copilot-q1abcde');
    buttonNamed(root, 'Save token').click();
    await settle();
    expect(text(root)).toContain('Paste the token.');
    expect(http.match({ method: 'PUT', url: PATH })).toEqual([]);
    type(input(), `  ${TOKEN}  `);
    buttonNamed(root, 'Save token').click();
    const put = http.expectOne({ method: 'PUT', url: PATH });
    expect(put.request.body).toEqual({ token: TOKEN });
    expect(requestViolations('putMyCopilotToken', put.request.body)).toEqual(
      []
    );
    await respond(put, putMyCopilotToken);
    expect(setupReads()).toBe(1);
    expect(definition(root, 'Token')).toContain('••••abcd');
    expect(definition(root, 'Last test')).toContain('Not tested');
    expect(input().value).toBe('');
    expect(toasts()).toEqual([
      'Your Copilot token is saved. Test it to see that GitHub takes it.',
    ]);
  });

  it('tests the token, and shows a refusal as the last test with what to do', async () => {
    await respond(read(), putMyCopilotToken);
    buttonNamed(root, 'Test').click();
    await respond(
      http.expectOne({ method: 'POST', url: `${PATH}/test` }),
      testMyCopilotToken
    );
    await respond(read(), {
      ...putMyCopilotToken,
      token: { ...putMyCopilotToken.token, lastTest: testMyCopilotToken },
    });
    expect(setupReads()).toBe(1);
    expect(definition(root, 'Last test')).toContain('Refused (HTTP 401)');
    expect(bannerHeadings(root)).toEqual(['GitHub refused the token']);
  });

  it('removes the token only after a second press', async () => {
    await respond(read(), getMyCopilotToken);
    buttonNamed(root, 'Remove…').click();
    await settle();
    expect(text(root)).toContain('Remove your token ••••wxyz?');
    buttonNamed(root, 'Remove the token').click();
    await respond(
      http.expectOne({ method: 'DELETE', url: PATH }),
      deleteMyCopilotToken
    );
    expect(setupReads()).toBe(1);
    expect(root.querySelector('dt')).toBeNull();
    expect(buttonsNamed(root, 'Test')).toEqual([]);
    expect(toasts()).toEqual(['Your Copilot token is removed.']);
  });

  it('says a token cannot be saved without the secrets key, or must be pasted again', async () => {
    await respond(read(), {
      ...deleteMyCopilotToken,
      secretsConfigured: false,
    });
    expect(bannerHeadings(root)).toEqual(["A token can't be saved now"]);
    expect(buttonNamed(root, 'Save token').disabled).toBe(true);
    fixture.destroy();
    fixture = TestBed.createComponent(CopilotTokenPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
    await respond(read(), { ...getMyCopilotToken, tokenReadable: false });
    expect(bannerHeadings(root)).toEqual(['Paste the token again']);
    expect(buttonNamed(root, 'Test').disabled).toBe(true);
  });

  it('tells a sign-in without a qnumber that a personal token is not for it', async () => {
    await respond(read(), problem('invalid_state'), 409);
    expect(bannerHeadings(root)).toEqual(['Not for this sign-in']);
    expect(root.querySelector('input')).toBeNull();
  });
});
