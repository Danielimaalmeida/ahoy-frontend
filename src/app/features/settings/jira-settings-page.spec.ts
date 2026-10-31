import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { requestViolations } from '@testing/fixtures/contract';
import getJiraSettings from '@testing/fixtures/getJiraSettings.json';
import listJiraFields from '@testing/fixtures/listJiraFields.json';
import listJiraSettingsEvents from '@testing/fixtures/listJiraSettingsEvents.json';
import previewJiraBacklog from '@testing/fixtures/previewJiraBacklog.json';
import problems from '@testing/fixtures/problems.json';
import putJiraConnection from '@testing/fixtures/putJiraConnection.json';
import updateJiraSettings from '@testing/fixtures/updateJiraSettings.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIELD_SEARCH_DEBOUNCE_MS } from './jira-field-dialog';
import { JiraSettingsPage } from './jira-settings-page';

const BASE = '/api/v1';
const JIRA = getJiraSettings.jira;

/** The problem body the API sends for `code`. */
function problem(code: string): (typeof problems)[number] {
  const found = problems.find((p) => p.code === code);
  if (found === undefined) throw new Error(`no problem ${code}`);
  return found;
}

/** The text of an element, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The buttons whose text or accessible name is `label`. */
function buttonsNamed(container: Element, label: string): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (b) => text(b) === label || b.getAttribute('aria-label') === label
  );
}

/** The button whose text or accessible name is `label`. */
function buttonNamed(container: Element, label: string): HTMLButtonElement {
  const found = buttonsNamed(container, label)[0];
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

/** The open dialog (the CDK puts it in an overlay under `body`). */
function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '.cdk-overlay-container .ah-dialog'
  );
  if (element === null) throw new Error('no dialog open');
  return element;
}

/** The control of the field labelled `label` in `container`. */
function field<T extends HTMLElement>(container: Element, label: string): T {
  const found = [...container.querySelectorAll('label')].find((l) =>
    text(l).startsWith(label)
  );
  const id = found?.getAttribute('for');
  const control = id ? container.querySelector<T>(`#${id}`) : null;
  if (control === null) throw new Error(`no field labelled ${label}`);
  return control;
}

function type(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

/** The value of a row of a definition list: the `dd` after the `dt` named `term`. */
function definition(container: Element, term: string): string {
  const dt = [...container.querySelectorAll('dt')].find(
    (d) => text(d) === term
  );
  const dd = dt?.nextElementSibling;
  return [...(dd?.children ?? [])].map((c) => text(c)).join(' ');
}

describe('the Jira section of Team settings', () => {
  let fixture: ComponentFixture<JiraSettingsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  /** Lets the answer, the promises after it and the next render finish. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const settingsRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/jira` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  /** Answers the pending reads of the settings and the history. */
  async function answer(
    page: object = getJiraSettings,
    history: object = listJiraSettingsEvents
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(history);
    await settle();
  }

  /** Answers a command with `body` (or a problem), then the reads after it. */
  async function reply(
    request: TestRequest,
    body: object | null,
    status = 200,
    after: object = getJiraSettings
  ): Promise<void> {
    if (status >= 400)
      request.flush(body, {
        status,
        statusText: 'Refused',
        headers: { 'content-type': 'application/problem+json' },
      });
    else request.flush(body, { status, statusText: 'OK' });
    await settle();
    await answer(after);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(JiraSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((e) => e.remove());
    http.verify();
  });

  it('shows the connection with the token as its last four, the query, the board, the stories and the history', async () => {
    expect(
      root.querySelector('[aria-label="Loading the Jira settings"]')
    ).not.toBeNull();
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('jira');
    settingsRead().flush(getJiraSettings);
    history.flush(listJiraSettingsEvents);
    await settle();

    expect(definition(root, 'Base URL')).toBe('https://jira.example.com/jira');
    expect(definition(root, 'Token')).toMatch(
      /^••••7c21 Set by Alex Example · \w{3} \d{1,2} \w{3}$/
    );
    expect(text(root)).not.toContain('NjQ5');
    expect(definition(root, 'Last test')).toMatch(
      /^Connected as Ahoy service \(svc-ahoy\) \w{3} \d{1,2} \w{3} \d{2}:\d{2}$/
    );
    expect(field<HTMLTextAreaElement>(root, 'Query (JQL)').value).toBe(
      JIRA.backlogJql
    );
    expect(text(root)).not.toContain('Unsaved changes');
    expect(definition(root, 'Board')).toBe('87022 Checkout board scrum');
    expect(definition(root, 'Sprint now')).toBe(
      'PROJ Sprint 41 Mon 26 Oct – Fri 6 Nov'
    );
    expect(definition(root, 'Summary prefix')).toBe(
      '[PROJ] As in “[PROJ] Show delivery slots at checkout”'
    );
    const fields = [
      ...root.querySelectorAll('[aria-label="Fixed fields"] tbody tr'),
    ];
    expect(
      fields.map((r) => [...r.children].slice(0, 3).map((c) => text(c)))
    ).toEqual([
      ['Feature team', 'customfield_11400', '[{"value": "Checkout"}]'],
      ['Team', 'customfield_11200', '"4211"'],
      ['Epic link', 'customfield_14300', '["PROJ-6"]'],
    ]);
    const changes = [
      ...root.querySelectorAll('[aria-label="Changes to Jira"] li'),
    ];
    expect(
      changes.map((c) => text(c.querySelector('.history__text > span')))
    ).toEqual([
      'Changed the backlog query',
      'Set the crew board to 87022 (Checkout board)',
      'Replaced the Jira token: ••••02be → ••••7c21',
      'Added the fixed field Epic link',
      'Connected Jira at https://jira.example.com/jira, token ••••02be',
    ]);
    expect(text(changes[1]?.querySelector('.ah-avatar'))).toBe('BE');
    expect(buttonNamed(root, 'Test connection')).toBeDefined();
    expect(buttonNamed(root, 'Edit Team')).toBeDefined();
  });

  it('lets someone who is not an admin read Jira and change nothing', async () => {
    await answer({ ...getJiraSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    expect(text(root.querySelector('pre'))).toBe(
      text({ textContent: JIRA.backlogJql } as Element)
    );
    expect(root.querySelector('textarea')).toBeNull();
    for (const label of [
      'Test connection',
      'Edit',
      'Edit prefix',
      'Add a fixed field',
      'Edit Team',
    ])
      expect(buttonsNamed(root, label)).toHaveLength(0);
  });

  it('says Jira is off and connects it with the URL and the token, then reads the settings again', async () => {
    await answer({ ...getJiraSettings, jira: null }, { items: [] });
    expect(text(root)).toContain('Jira is off');
    expect(text(root)).toContain(
      'A story that starts now halts until Jira is connected.'
    );
    expect(root.querySelector('textarea')).toBeNull();
    buttonNamed(root, 'Connect Jira').click();
    await settle();
    expect(buttonNamed(dialog(), 'Connect').disabled).toBe(true);
    type(field(dialog(), 'Base URL'), 'http://jira.example.com/jira');
    type(field(dialog(), 'Token'), '  a-personal-token ');
    await settle();
    expect(buttonNamed(dialog(), 'Connect').disabled).toBe(true);
    type(field(dialog(), 'Base URL'), 'https://jira.example.com/jira/');
    await settle();
    buttonNamed(dialog(), 'Connect').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/jira/connection`,
    });
    expect(put.request.body).toEqual({
      baseUrl: 'https://jira.example.com/jira',
      token: 'a-personal-token',
    });
    expect(requestViolations('putJiraConnection', put.request.body)).toEqual(
      []
    );
    await reply(put, putJiraConnection);
    expect(
      document.querySelector('.cdk-overlay-container .ah-dialog')
    ).toBeNull();
    expect(definition(root, 'Base URL')).toBe('https://jira.example.com/jira');
  });

  it('turns Connect Jira off and says why while the API cannot seal a token', async () => {
    await answer({ ...getJiraSettings, jira: null, secretsConfigured: false });
    expect(text(root)).toContain("Tokens can't be saved yet");
    expect(buttonNamed(root, 'Connect Jira').disabled).toBe(true);
  });

  it('asks for the token again when the base URL moves, and keeps it when only the URL is unchanged', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    type(field(dialog(), 'Base URL'), 'https://jira2.example.com');
    await settle();
    expect(text(dialog())).toContain('Type the token again');
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    type(field(dialog(), 'New token'), 'another-token');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/jira/connection`,
    });
    expect(put.request.body).toEqual({
      version: JIRA.version,
      baseUrl: 'https://jira2.example.com',
      token: 'another-token',
    });
    await reply(put, putJiraConnection);
  });

  it('turns Jira off only after a second, explicit press', async () => {
    await answer();
    buttonNamed(root, 'Edit').click();
    await settle();
    buttonNamed(dialog(), 'Turn Jira off…').click();
    await settle();
    expect(text(dialog())).toContain('every story that starts halts');
    buttonNamed(dialog(), 'Turn Jira off').click();
    await settle();
    const off = http.expectOne({
      method: 'DELETE',
      url: `${BASE}/settings/jira`,
    });
    await reply(off, null, 204, { ...getJiraSettings, jira: null });
    expect(text(root)).toContain('Jira is off');
  });

  it('shows a refused token from Test connection as a banner with the request it made', async () => {
    await answer();
    buttonNamed(root, 'Test connection').click();
    await settle();
    const test = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/jira/test`,
    });
    const refused = {
      result: 'refused',
      detail: 'HTTP 401',
      at: '2026-10-31T10:52:00.000Z',
    };
    await reply(test, refused, 200, {
      ...getJiraSettings,
      jira: {
        ...JIRA,
        connection: { ...JIRA.connection, lastTest: refused },
      },
    });
    expect(text(root)).toContain('Jira refused the token');
    expect(text(root)).toContain('GET /rest/api/2/myself → HTTP 401');
    expect(definition(root, 'Last test')).toMatch(/^Refused /);
  });

  it('previews the typed query without saving it, then saves it, and an empty query turns the Backlog off', async () => {
    await answer();
    const jql = field<HTMLTextAreaElement>(root, 'Query (JQL)');
    type(jql, 'project = PROJ ORDER BY Rank ASC');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
    buttonNamed(root, 'Preview').click();
    await settle();
    const preview = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/jira/backlog-preview`,
    });
    expect(preview.request.body).toEqual({
      jql: 'project = PROJ ORDER BY Rank ASC',
    });
    preview.flush(previewJiraBacklog);
    await settle();
    expect(text(root)).toContain('42 issues match');
    expect(text(root)).toContain(
      'The first is PROJ-123 Show delivery slots at checkout'
    );

    buttonNamed(root, 'Save query').click();
    await settle();
    const save = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(save.request.body).toEqual({
      version: JIRA.version,
      backlogJql: 'project = PROJ ORDER BY Rank ASC',
    });
    expect(requestViolations('updateJiraSettings', save.request.body)).toEqual(
      []
    );
    await reply(save, updateJiraSettings, 200, {
      ...getJiraSettings,
      jira: updateJiraSettings,
    });
    expect(text(root)).not.toContain('Unsaved changes');

    type(field<HTMLTextAreaElement>(root, 'Query (JQL)'), '   ');
    await settle();
    expect(buttonNamed(root, 'Preview').disabled).toBe(true);
    buttonNamed(root, 'Turn the Backlog off').click();
    await settle();
    const off = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(off.request.body).toEqual({
      version: updateJiraSettings.version,
      backlogJql: null,
    });
    await reply(off, { ...updateJiraSettings, backlogJql: null });
  });

  it('says a query Jira does not accept next to Preview, and someone else changing it first on Save', async () => {
    await answer();
    type(field<HTMLTextAreaElement>(root, 'Query (JQL)'), 'project = (');
    await settle();
    buttonNamed(root, 'Preview').click();
    await settle();
    http
      .expectOne({
        method: 'POST',
        url: `${BASE}/settings/jira/backlog-preview`,
      })
      .flush(
        {
          ...problem('validation_failed'),
          detail: 'Jira did not accept the query',
        },
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'content-type': 'application/problem+json' },
        }
      );
    await settle();
    expect(text(root)).toContain('Jira did not accept the query');

    buttonNamed(root, 'Save query').click();
    await settle();
    await reply(
      http.expectOne({ method: 'PATCH', url: `${BASE}/settings/jira` }),
      problem('stale_version'),
      409
    );
    expect(text(root)).toContain('Someone changed this since you opened it');
    expect(text(root)).toContain('Unsaved changes');
  });

  it('sets the crew board by its id, and an empty id takes it off', async () => {
    await answer();
    buttonsNamed(root, 'Edit')[1]!.click();
    await settle();
    const board = field<HTMLInputElement>(dialog(), 'Board id');
    expect(board.value).toBe('87022');
    type(board, '87.5');
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    type(board, ' 91000 ');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const save = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(save.request.body).toEqual({
      version: JIRA.version,
      boardId: 91000,
    });
    await reply(save, updateJiraSettings);
  });

  it('keeps the summary prefix as typed, with its trailing space', async () => {
    await answer();
    buttonNamed(root, 'Edit prefix').click();
    await settle();
    type(field(dialog(), 'Prefix'), '[SHOP] ');
    await settle();
    expect(text(dialog())).toContain('As in “[SHOP] Show delivery slots');
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const save = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(save.request.body).toEqual({
      version: JIRA.version,
      storySummaryPrefix: '[SHOP] ',
    });
    await reply(save, updateJiraSettings);
  });

  it('adds a fixed field found in Jira, with its value checked as JSON while it is typed', async () => {
    await answer();
    buttonNamed(root, 'Add a fixed field').click();
    await settle();
    type(field(dialog(), 'Field'), 'Release');
    await new Promise((resolve) =>
      setTimeout(resolve, FIELD_SEARCH_DEBOUNCE_MS + 20)
    );
    const search = http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/jira/fields`
    );
    expect(search.request.params.get('q')).toBe('Release');
    search.flush(listJiraFields);
    await settle();
    buttonNamed(dialog(), 'Epic link customfield_14300').click();
    await settle();
    expect(text(dialog())).toContain(
      'Epic link is already fixed: edit it in the list instead.'
    );
    type(field(dialog(), 'Field'), 'Release');
    await new Promise((resolve) =>
      setTimeout(resolve, FIELD_SEARCH_DEBOUNCE_MS + 20)
    );
    http
      .expectOne((r) => r.url === `${BASE}/settings/jira/fields`)
      .flush(listJiraFields);
    await settle();
    buttonNamed(dialog(), 'Release train customfield_14301').click();
    await settle();
    expect(text(dialog())).toContain('Found in Jira: customfield_14301');
    const value = field<HTMLTextAreaElement>(dialog(), 'Value');
    type(value, '[{"value": "RT-4"');
    await settle();
    expect(text(dialog())).toContain(
      'Not valid JSON: the value ends before its closing } and ].'
    );
    expect(buttonNamed(dialog(), 'Add field').disabled).toBe(true);
    type(value, '[{"value": "RT-4"}]');
    await settle();
    buttonNamed(dialog(), 'Add field').click();
    await settle();
    const save = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(save.request.body).toEqual({
      version: JIRA.version,
      storyFields: [
        ...JIRA.storyFields,
        {
          id: 'customfield_14301',
          name: 'Release train',
          value: [{ value: 'RT-4' }],
        },
      ],
    });
    expect(requestViolations('updateJiraSettings', save.request.body)).toEqual(
      []
    );
    await reply(save, updateJiraSettings);
  });

  it('refuses a field Ahoy writes itself before asking the API, even typed as an id', async () => {
    await answer();
    buttonNamed(root, 'Add a fixed field').click();
    await settle();
    type(field(dialog(), 'Field'), 'customfield_11100');
    await new Promise((resolve) =>
      setTimeout(resolve, FIELD_SEARCH_DEBOUNCE_MS + 20)
    );
    http
      .expectOne((r) => r.url === `${BASE}/settings/jira/fields`)
      .flush({ items: [] });
    await settle();
    buttonNamed(dialog(), 'Use the id customfield_11100').click();
    await settle();
    expect(text(dialog())).toContain(
      "customfield_11100 can't be fixed: Ahoy writes it from the story."
    );
    type(field(dialog(), 'Value'), '"x"');
    await settle();
    expect(buttonNamed(dialog(), 'Add field').disabled).toBe(true);
  });

  it("changes a fixed field's value, and removes one after a second press", async () => {
    await answer();
    buttonNamed(root, 'Edit Team').click();
    await settle();
    const value = field<HTMLTextAreaElement>(dialog(), 'Value');
    expect(value.value).toBe('"4211"');
    type(value, '"4212"');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const save = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(save.request.body).toEqual({
      version: JIRA.version,
      storyFields: JIRA.storyFields.map((f) =>
        f.id === 'customfield_11200' ? { ...f, value: '4212' } : f
      ),
    });
    await reply(save, updateJiraSettings);

    buttonNamed(root, 'Edit Epic link').click();
    await settle();
    buttonNamed(dialog(), 'Remove this field…').click();
    await settle();
    buttonNamed(dialog(), 'Remove the field').click();
    await settle();
    const remove = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/jira`,
    });
    expect(remove.request.body).toEqual({
      version: JIRA.version,
      storyFields: JIRA.storyFields.filter((f) => f.id !== 'customfield_14300'),
    });
    await reply(remove, updateJiraSettings);
  });

  it("asks for the token again when the API's key no longer opens the stored one", async () => {
    await answer({ ...getJiraSettings, tokenReadable: false });
    expect(text(root)).toContain("The stored token can't be opened");
    buttonNamed(root, 'Edit').click();
    await settle();
    expect(text(dialog())).toContain('Type the token again');
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    expect(field(dialog(), 'New token').getAttribute('placeholder')).toBeNull();
    type(field(dialog(), 'New token'), 'the-same-token');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/jira/connection`,
    });
    expect(put.request.body).toEqual({
      version: JIRA.version,
      baseUrl: JIRA.connection.baseUrl,
      token: 'the-same-token',
    });
    await reply(put, putJiraConnection);
  });

  it('drops a field search that was in flight when the search was cleared or changed', async () => {
    await answer();
    buttonNamed(root, 'Add a fixed field').click();
    await settle();
    type(field(dialog(), 'Field'), 'Team');
    await new Promise((resolve) =>
      setTimeout(resolve, FIELD_SEARCH_DEBOUNCE_MS + 20)
    );
    const late = http.expectOne(
      (r) => r.url === `${BASE}/settings/jira/fields`
    );
    type(field(dialog(), 'Field'), '');
    await settle();
    late.flush(listJiraFields);
    await settle();
    expect(
      dialog().querySelector('[aria-label="Fields found in Jira"]')
    ).toBeNull();
    expect(text(dialog())).not.toContain('No field of Jira matches');
  });

  it('offers a system field typed as its id when Jira cannot be searched', async () => {
    await answer();
    buttonNamed(root, 'Add a fixed field').click();
    await settle();
    type(field(dialog(), 'Field'), 'components');
    await new Promise((resolve) =>
      setTimeout(resolve, FIELD_SEARCH_DEBOUNCE_MS + 20)
    );
    http
      .expectOne((r) => r.url === `${BASE}/settings/jira/fields`)
      .flush(problem('unavailable'), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'content-type': 'application/problem+json' },
      });
    await settle();
    buttonNamed(dialog(), 'Use the id components').click();
    await settle();
    type(field(dialog(), 'Value'), '[{"name": "Checkout"}]');
    await settle();
    expect(buttonNamed(dialog(), 'Add field').disabled).toBe(false);
  });

  it('shows a refused read as a read failure, with Try again', async () => {
    settingsRead().flush(problem('forbidden'), {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'content-type': 'application/problem+json' },
    });
    historyRead().flush({ items: [] });
    await settle();
    expect(text(root)).toContain("You can't read the team settings");
    expect(text(root)).not.toContain('Only admins change team settings');
    buttonNamed(root, 'Try again').click();
    await settle();
    await answer();
    expect(definition(root, 'Base URL')).toBe('https://jira.example.com/jira');
  });
});
