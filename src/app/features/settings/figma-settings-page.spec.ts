import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import {
  buttonNamed,
  buttonsNamed,
  definition,
  dialog,
  field,
  openDialog,
  problem,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import deleteFigmaToken from '@testing/fixtures/deleteFigmaToken.json';
import deleteRunnerKey from '@testing/fixtures/deleteRunnerKey.json';
import generateRunnerKey from '@testing/fixtures/generateRunnerKey.json';
import getAgentSettings from '@testing/fixtures/getAgentSettings.json';
import getFigmaSettings from '@testing/fixtures/getFigmaSettings.json';
import listFigmaSettingsEvents from '@testing/fixtures/listFigmaSettingsEvents.json';
import putFigmaToken from '@testing/fixtures/putFigmaToken.json';
import updateFigmaSettings from '@testing/fixtures/updateFigmaSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FigmaSettingsPage } from './figma-settings-page';

const BASE = '/api/v1';
const FIGMA = getFigmaSettings.figma;

/** The checkbox of the UI builder `name` in the open dialog. */
function builder(name: string): HTMLInputElement {
  const label = [...dialog().querySelectorAll('label.choice')].find(
    (l) => text(l) === name
  );
  const box = label?.querySelector('input');
  if (!(box instanceof HTMLInputElement)) throw new Error(`no builder ${name}`);
  return box;
}

describe('the Figma section of Team settings', () => {
  let fixture: ComponentFixture<FigmaSettingsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const settingsRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/figma` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getFigmaSettings,
    history: object = listFigmaSettingsEvents
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(history);
    await settle();
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
    else request.flush(body, { status, statusText: 'OK' });
    await settle();
  }

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
    fixture = TestBed.createComponent(FigmaSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('shows the token as its last four, its last test, the design phase and the history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('figma');
    settingsRead().flush(getFigmaSettings);
    history.flush(listFigmaSettingsEvents);
    await settle();

    expect(definition(root, 'Token')).toMatch(
      /^••••c9d4 Set by Alex Example · \w{3} \d{1,2} \w{3}$/
    );
    expect(definition(root, 'Last test')).toMatch(
      /^Reads as design-bot@example\.com \w{3} \d{1,2} \w{3} \d{2}:\d{2}$/
    );
    expect(definition(root, 'UI builders')).toMatch(
      /^ahoy-frontend-developer The implementer agents/
    );
    expect(definition(root, 'Design kit prefix')).toMatch(/^ds- /);
    expect(text(root)).not.toContain('These are the defaults');
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Figma"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual([
      'Generated the runner key ••••a7c1',
      'Set the design kit prefix to ds-',
      'Replaced the Figma token ••••1f2e with ••••c9d4',
      'Removed the Figma token ••••1f2e',
    ]);
  });

  it('says Figma is off without a token, and that the design phase shows the defaults', async () => {
    await answer({
      ...getFigmaSettings,
      figma: {
        ...deleteFigmaToken,
        version: null,
        updatedBy: null,
        updatedByName: null,
        updatedAt: null,
      },
    });
    expect(text(root)).toContain('Figma is off');
    expect(text(root)).toContain('These are the defaults');
    expect(buttonsNamed(root, 'Test token')).toEqual([]);
    expect(buttonNamed(root, 'Save a token').disabled).toBe(false);
  });

  it('tests the token and shows a refusal with the request it made', async () => {
    await answer();
    buttonNamed(root, 'Test token').click();
    await settle();
    expect(buttonNamed(root, 'Testing…').disabled).toBe(true);
    const refused = {
      result: 'refused',
      detail: 'HTTP 403',
      at: '2026-10-31T09:35:00.000Z',
    };
    await respond(
      http.expectOne({ method: 'POST', url: `${BASE}/settings/figma/test` }),
      refused
    );
    await answer({
      ...getFigmaSettings,
      figma: { ...FIGMA, token: { ...FIGMA.token, lastTest: refused } },
    });
    expect(text(root)).toContain('Figma refused the token');
    expect(text(root)).toContain('GET https://api.figma.com/v1/me → HTTP 403');
    expect(definition(root, 'Last test')).toMatch(/^Refused /);
    expect(toasts()).toEqual([]);
  });

  it('says why a test could not run, apart from what Figma answered', async () => {
    await answer();
    buttonNamed(root, 'Test token').click();
    await settle();
    await respond(
      http.expectOne({ method: 'POST', url: `${BASE}/settings/figma/test` }),
      problem('forbidden'),
      403
    );
    await answer();
    expect(text(root)).toContain('Only admins change team settings');
    expect(text(root)).not.toContain('Figma refused the token');
    expect(definition(root, 'Last test')).toMatch(
      /^Reads as design-bot@example\.com/
    );
  });

  it('replaces the token with the one pasted, and never shows it', async () => {
    await answer();
    buttonNamed(root, 'Replace').click();
    await settle();
    const input = field(dialog(), 'Personal access token');
    expect(input.type).toBe('password');
    expect(input.getAttribute('placeholder')).toBe('Replaces ••••c9d4');
    type(input, 'figd bad');
    await settle();
    expect(buttonNamed(dialog(), 'Save token').disabled).toBe(true);
    type(input, '  figd_example-77aa ');
    await settle();
    buttonNamed(dialog(), 'Save token').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/figma/token`,
    });
    expect(put.request.body).toEqual({
      token: 'figd_example-77aa',
      version: FIGMA.version,
    });
    expect(requestViolations('putFigmaToken', put.request.body)).toEqual([]);
    await respond(put, putFigmaToken);
    await answer({ ...getFigmaSettings, figma: putFigmaToken });
    expect(openDialog()).toBeNull();
    expect(toasts()).toContain('Figma token saved.');
    expect(definition(root, 'Token')).toMatch(/^••••77aa /);
    expect(text(root)).not.toContain('figd_example');
  });

  it('removes the token only after a second, explicit press', async () => {
    await answer();
    buttonNamed(root, 'Replace').click();
    await settle();
    buttonNamed(dialog(), 'Remove the token…').click();
    await settle();
    expect(text(dialog())).toContain('halts with “Figma is not set up”');
    buttonNamed(dialog(), 'Remove the token').click();
    await settle();
    await respond(
      http.expectOne({ method: 'DELETE', url: `${BASE}/settings/figma/token` }),
      deleteFigmaToken
    );
    await answer({ ...getFigmaSettings, figma: deleteFigmaToken });
    expect(text(root)).toContain('Figma is off');
  });

  it('chooses the UI builders from the content repository’s profiles and changes the prefix', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    http.expectOne({ method: 'GET', url: `${BASE}/settings/agents` }).flush({
      ...getAgentSettings,
      profiles: {
        ...getAgentSettings.profiles,
        names: ['mobile-developer', 'story-refiner'],
      },
    });
    await settle();
    expect(builder('ahoy-frontend-developer').checked).toBe(true);
    expect(builder('mobile-developer').checked).toBe(false);
    builder('mobile-developer').click();
    type(field(dialog(), 'Design kit prefix'), 'cma-');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/figma`,
    });
    expect(patch.request.body).toEqual({
      version: FIGMA.version,
      uiAgents: ['ahoy-frontend-developer', 'mobile-developer'],
      selectorPrefix: 'cma-',
    });
    expect(
      requestViolations('updateFigmaSettings', patch.request.body)
    ).toEqual([]);
    await respond(patch, updateFigmaSettings);
    await answer({ ...getFigmaSettings, figma: updateFigmaSettings });
    expect(openDialog()).toBeNull();
  });

  it('keeps the UI builders when the profiles cannot be listed, and saves the prefix alone', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    http.expectOne({ method: 'GET', url: `${BASE}/settings/agents` }).flush({
      ...getAgentSettings,
      profiles: { commit: null, names: [], problem: 'git ls-tree failed' },
    });
    await settle();
    expect(text(dialog())).toContain("The profiles can't be listed");
    expect(text(dialog())).toContain('git ls-tree failed');
    expect(dialog().querySelectorAll('label.choice')).toHaveLength(0);
    type(field(dialog(), 'Design kit prefix'), 'Bad');
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    type(field(dialog(), 'Design kit prefix'), 'kit-');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/figma`,
    });
    expect(patch.request.body).toEqual({
      version: FIGMA.version,
      selectorPrefix: 'kit-',
    });
    await respond(patch, { ...FIGMA, selectorPrefix: 'kit-', version: 3 });
    await answer();
  });

  it('refuses to save the design phase with no UI builder', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/agents` })
      .flush(getAgentSettings);
    await settle();
    builder('ahoy-frontend-developer').click();
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
  });

  it('asks for the token again when the API’s key no longer opens it', async () => {
    await answer({ ...getFigmaSettings, tokenReadable: false });
    expect(text(root)).toContain("The stored token can't be opened");
    expect(buttonNamed(root, 'Test token').disabled).toBe(true);
    buttonNamed(root, 'Replace').click();
    await settle();
    expect(text(dialog())).toContain('Paste the token again');
  });

  it('says Figma is off without the API’s key, saves no token, and still removes the stored one', async () => {
    await answer({
      ...getFigmaSettings,
      secretsConfigured: false,
      tokenReadable: false,
    });
    expect(text(root)).toContain('has no AHOY_SECRETS_KEY');
    expect(text(root)).not.toContain("The stored token can't be opened");
    buttonNamed(root, 'Replace').click();
    await settle();
    expect(field(dialog(), 'Personal access token').disabled).toBe(true);
    expect(buttonNamed(dialog(), 'Save token').disabled).toBe(true);
    buttonNamed(dialog(), 'Remove the token…').click();
    await settle();
    buttonNamed(dialog(), 'Remove the token').click();
    await settle();
    await respond(
      http.expectOne({ method: 'DELETE', url: `${BASE}/settings/figma/token` }),
      deleteFigmaToken
    );
    await answer({
      ...getFigmaSettings,
      secretsConfigured: false,
      tokenReadable: false,
      figma: deleteFigmaToken,
    });
    expect(text(root)).toContain('Figma is off');
  });

  it('shows the settings without buttons to someone who is not an admin', async () => {
    await answer({ ...getFigmaSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    for (const label of ['Test token', 'Replace', 'Edit', 'Replace key'])
      expect(buttonsNamed(root, label)).toEqual([]);
  });

  it('offers no runner key button to someone who is not an admin when there is none', async () => {
    await answer({
      ...getFigmaSettings,
      canEdit: false,
      figma: { ...FIGMA, runnerKey: null },
    });
    expect(text(root)).toContain('No runner key');
    expect(buttonsNamed(root, 'Generate a key')).toEqual([]);
  });

  describe('the runner key', () => {
    const KEY = generateRunnerKey.key;

    it('shows the key as its last four, who set it, and where it goes in GitHub', async () => {
      await answer();
      expect(definition(root, 'Key')).toMatch(
        /^••••a7c1 Set by Alex Example · \w{3} \d{1,2} \w{3}$/
      );
      expect(definition(root, 'In GitHub')).toMatch(
        /^AHOY_RUNNER_KEY AHOY_API_URL The organisation secret and variable/
      );
    });

    it('generates a key and shows it this once, selected, with where to save it, then never again', async () => {
      await answer({
        ...getFigmaSettings,
        figma: { ...FIGMA, runnerKey: null },
      });
      expect(text(root)).toContain('No runner key');
      expect(text(root)).toContain("a large design's biggest frames");
      buttonNamed(root, 'Generate a key').click();
      await settle();
      expect(text(dialog())).toContain('Generate a runner key');
      expect(buttonsNamed(dialog(), 'Remove the key…')).toEqual([]);
      buttonNamed(dialog(), 'Generate key').click();
      await settle();
      const post = http.expectOne({
        method: 'POST',
        url: `${BASE}/settings/figma/runner-key`,
      });
      expect(post.request.body).toBeNull();
      await respond(post, generateRunnerKey, 201);
      await answer({ ...getFigmaSettings, figma: generateRunnerKey.figma });

      expect(openDialog()).not.toBeNull();
      expect(text(dialog())).toContain('Copy the runner key now');
      const shown = field(dialog(), 'Runner key');
      expect(shown.value).toBe(KEY);
      expect(shown.readOnly).toBe(true);
      expect(document.activeElement).toBe(shown);
      expect(shown.selectionStart).toBe(0);
      expect(shown.selectionEnd).toBe(KEY.length);
      expect(text(dialog())).toContain(
        'save it as the organisation secret AHOY_RUNNER_KEY'
      );
      expect(text(dialog())).toContain(
        'Set the organisation variable AHOY_API_URL'
      );
      expect(definition(root, 'Key')).toMatch(/^••••0042 /);
      expect(root.innerHTML).not.toContain(KEY);

      // No Clipboard API (as in jsdom): the key stays selectable, and the toast says so.
      buttonNamed(dialog(), 'Copy key').click();
      await settle();
      expect(toasts()).toContain(
        "Couldn't copy to the clipboard. Select the key and copy it."
      );
      const written: string[] = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (t: string) => (written.push(t), Promise.resolve()),
        },
      });
      try {
        buttonNamed(dialog(), 'Copy key').click();
        await settle();
        expect(written).toEqual([KEY]);
        expect(toasts()).toContain(
          'Runner key copied. Save it as AHOY_RUNNER_KEY.'
        );
      } finally {
        Reflect.deleteProperty(navigator, 'clipboard');
      }

      buttonNamed(dialog(), 'Done').click();
      await settle();
      expect(openDialog()).toBeNull();
      expect(document.body.innerHTML).not.toContain(KEY);
    });

    it('says the old key stops working before replacing it, and keeps a refusal in the dialog', async () => {
      await answer();
      buttonNamed(root, 'Replace key').click();
      await settle();
      expect(text(dialog())).toContain('Replace the runner key');
      expect(text(dialog())).toContain(
        'The key ••••a7c1 stops working at once'
      );
      buttonNamed(dialog(), 'Replace key').click();
      await settle();
      await respond(
        http.expectOne({
          method: 'POST',
          url: `${BASE}/settings/figma/runner-key`,
        }),
        problem('forbidden'),
        403
      );
      await answer();
      expect(openDialog()).not.toBeNull();
      expect(text(dialog())).toContain('Only admins change team settings');
      expect(() => field(dialog(), 'Runner key')).toThrow();
    });

    it('removes the key only after a second, explicit press', async () => {
      await answer();
      buttonNamed(root, 'Replace key').click();
      await settle();
      buttonNamed(dialog(), 'Remove the key…').click();
      await settle();
      expect(text(dialog())).toContain('Remove the runner key ••••a7c1?');
      buttonNamed(dialog(), 'Remove the key').click();
      await settle();
      await respond(
        http.expectOne({
          method: 'DELETE',
          url: `${BASE}/settings/figma/runner-key`,
        }),
        deleteRunnerKey
      );
      await answer({ ...getFigmaSettings, figma: deleteRunnerKey });
      expect(openDialog()).toBeNull();
      expect(toasts()).toContain('The runner key is removed.');
      expect(text(root)).toContain('No runner key');
    });
  });
});
