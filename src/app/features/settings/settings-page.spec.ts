import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import addSonarRepository from '@testing/fixtures/addSonarRepository.json';
import addSonarServer from '@testing/fixtures/addSonarServer.json';
import { requestViolations } from '@testing/fixtures/contract';
import getSonarSettings from '@testing/fixtures/getSonarSettings.json';
import listSettingsEvents from '@testing/fixtures/listSettingsEvents.json';
import problems from '@testing/fixtures/problems.json';
import updateSonarServer from '@testing/fixtures/updateSonarServer.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsPage } from './settings-page';

const BASE = '/api/v1';
const MAIN = getSonarSettings.servers[0]!;

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

function type(control: HTMLInputElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

describe('the Team settings page', () => {
  let fixture: ComponentFixture<SettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/sonar` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  /** Answers the pending reads of the settings and the history. */
  async function answer(
    sonar: object = getSonarSettings,
    history: object = listSettingsEvents
  ): Promise<void> {
    settingsRead().flush(sonar);
    historyRead().flush(history);
    await settle();
  }

  /** Presses the open dialog's button `label` and lets the request go out. */
  async function confirm(label: string): Promise<void> {
    await settle();
    buttonNamed(dialog(), label).click();
    await settle();
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
    fixture = TestBed.createComponent(SettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((c) => (c.innerHTML = ''));
    http.verify();
  });

  it('lists the servers with only the last four characters of each token, the repositories and the history', async () => {
    expect(
      root.querySelector('[aria-label="Loading the settings"]')
    ).not.toBeNull();
    const history = historyRead();
    expect(history.request.params.get('limit')).toBe('50');
    settingsRead().flush(getSonarSettings);
    history.flush(listSettingsEvents);
    await settle();
    const servers = [
      ...root.querySelectorAll('[aria-label="SonarQube servers"] tbody tr'),
    ];
    expect(servers.map((r) => text(r.querySelector('th')))).toEqual([
      'Main SonarQube Default',
      'Payments SonarQube',
    ]);
    expect(text(servers[0])).toContain('https://sonar.example.com');
    const tokens = servers.map((r) => r.children[2]);
    expect(tokens.map((c) => text(c?.querySelector('.ah-mono')))).toEqual([
      '••••9f3a',
      '••••',
    ]);
    expect(text(tokens[0]?.querySelector('.ah-cell-sub'))).toMatch(
      /^Set by Alex Example · \w{3} \d{1,2} \w{3}$/
    );
    const repositories = [
      ...root.querySelectorAll('[aria-label="Repositories"] tbody tr'),
    ];
    expect(
      [...(repositories[0]?.children ?? [])].slice(0, 3).map((c) => text(c))
    ).toEqual(['acme/orders-web', 'Main SonarQube', 'acme_orders_web']);
    const changes = [
      ...root.querySelectorAll('[aria-label="Changes to team settings"] li'),
    ];
    expect(
      changes.map((c) => text(c.querySelector('.history__text > span')))
    ).toEqual([
      'Put acme/orders-web on Main SonarQube, project key acme_orders_web',
      'Changed SonarQube server Main SonarQube: token ••••1b2c → ••••9f3a',
      'Added SonarQube server Main SonarQube (https://sonar.example.com), the default, token ••••1b2c',
    ]);
    expect(text(changes[2])).toContain('alex@example.com ·');
    expect(text(changes[2]?.querySelector('.ah-avatar'))).toBe('AL');
    expect(text(root.querySelector('.side'))).toContain(
      'Kept for good. A token shows only its last four characters.'
    );
    expect(text(root)).toContain('Account › Team settings');
    expect(text(root)).toContain('You can change these · admin');
    expect(buttonNamed(root, 'Add server').disabled).toBe(false);
    expect(buttonNamed(root, 'Edit Main SonarQube')).toBeDefined();
  });

  it('lets someone who is not an admin read the settings and change nothing', async () => {
    await answer({ ...getSonarSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    expect(text(root)).not.toContain('You can change these');
    expect(buttonsNamed(root, 'Add server')).toHaveLength(0);
    expect(buttonsNamed(root, 'Add repository')).toHaveLength(0);
    expect(buttonsNamed(root, 'Edit Main SonarQube')).toHaveLength(0);
  });

  it('turns Add server off and says why while the API cannot seal a token', async () => {
    await answer({ ...getSonarSettings, secretsConfigured: false });
    expect(text(root)).toContain("Tokens can't be saved yet");
    expect(buttonNamed(root, 'Add server').disabled).toBe(true);
  });

  it('adds the first server as the default, sends the token once and reads the settings again', async () => {
    await answer({ ...getSonarSettings, servers: [], repositories: [] });
    expect(text(root)).toContain('No SonarQube server yet');
    expect(buttonNamed(root, 'Add repository').disabled).toBe(true);
    buttonNamed(root, 'Add server').click();
    await settle();
    type(field(dialog(), 'Name'), '  Main   SonarQube ');
    type(field(dialog(), 'Host'), 'https://sonar.example.com/');
    type(field(dialog(), 'Token'), ' squ_0123456789abcdef ');
    expect(field<HTMLInputElement>(dialog(), 'Token').type).toBe('password');
    expect(
      dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .checked
    ).toBe(true);
    await confirm('Add server');
    const add: TestRequest = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/sonar/servers`,
    });
    expect(add.request.body).toEqual({
      name: 'Main SonarQube',
      hostUrl: 'https://sonar.example.com',
      token: 'squ_0123456789abcdef',
      isDefault: true,
    });
    expect(requestViolations('addSonarServer', add.request.body)).toEqual([]);
    add.flush(addSonarServer, { status: 201, statusText: 'Created' });
    await settle();
    await answer();
    expect(
      document.querySelector('.cdk-overlay-container .ah-dialog')
    ).toBeNull();
  });

  it('asks for the token again before moving a server to another host, and sends only what changed', async () => {
    await answer();
    buttonNamed(root, 'Edit Main SonarQube').click();
    await settle();
    const token = field<HTMLInputElement>(dialog(), 'New token');
    expect(token.value).toBe('');
    expect(token.placeholder).toBe('Leave empty to keep ••••9f3a');
    expect(text(dialog())).toContain('The default server · 1 repository on it');
    expect(text(dialog())).toContain('Set by Alex Example on ');
    expect(text(dialog())).toContain(
      'To change it, make another server the default.'
    );
    expect(text(dialog())).toContain('1 repository is on this server');
    expect(buttonNamed(dialog(), 'Remove this server…').disabled).toBe(true);
    expect(text(dialog())).not.toContain('Type the token again');
    type(field(dialog(), 'Host'), 'https://sonar2.example.com');
    await settle();
    expect(text(dialog())).toContain('Type the token again');
    expect(text(dialog())).toContain('Was https://sonar.example.com');
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    buttonNamed(dialog(), 'Save').click();
    await settle();
    http.expectNone(`${BASE}/settings/sonar/servers/${MAIN.id}`);
    type(field(dialog(), 'New token'), 'squ_new_token_9999');
    await settle();
    expect(text(dialog())).not.toContain('Type the token again');
    await confirm('Save');
    const change = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/sonar/servers/${MAIN.id}`,
    });
    expect(change.request.body).toEqual({
      version: 1,
      hostUrl: 'https://sonar2.example.com',
      token: 'squ_new_token_9999',
    });
    expect(requestViolations('updateSonarServer', change.request.body)).toEqual(
      []
    );
    change.flush(updateSonarServer);
    await settle();
    await answer();
  });

  it('keeps the dialog open, says someone changed the server first, and reads the settings again behind it', async () => {
    await answer();
    buttonNamed(root, 'Edit Main SonarQube').click();
    await settle();
    type(field(dialog(), 'Name'), 'Main');
    await confirm('Save');
    const stale = problems.find((p) => p.code === 'stale_version')!;
    http
      .expectOne(`${BASE}/settings/sonar/servers/${MAIN.id}`)
      .flush(stale, { status: 409, statusText: 'Conflict' });
    await settle();
    const now = {
      ...getSonarSettings,
      servers: [
        { ...MAIN, name: 'Main SQ', version: 2 },
        getSonarSettings.servers[1],
      ],
    };
    await answer(now);
    expect(text(dialog())).toContain(
      'Someone changed this since you opened it'
    );
    expect(buttonsNamed(root, 'Edit Main SQ')).toHaveLength(1);
  });

  it('takes the same host typed another way as the same host, and warns before a token goes over plain http', async () => {
    await answer();
    buttonNamed(root, 'Edit Main SonarQube').click();
    await settle();
    type(field(dialog(), 'Host'), ' https://SONAR.example.com:443/ ');
    await settle();
    expect(text(dialog())).not.toContain('Type the token again');
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(false);
    expect(text(dialog())).not.toContain('This host is not HTTPS');
    type(field(dialog(), 'Host'), 'http://sonar.internal:9000');
    await settle();
    expect(text(dialog())).toContain('This host is not HTTPS');
    expect(text(dialog())).toContain('Type the token again');
  });

  it('removes a server no repository is on, after asking', async () => {
    await answer();
    buttonNamed(root, 'Edit Payments SonarQube').click();
    await settle();
    expect(text(dialog())).toContain('No repository on it');
    buttonNamed(dialog(), 'Remove this server…').click();
    await settle();
    expect(text(dialog())).toContain('Its token is deleted with it.');
    buttonNamed(dialog(), 'Remove Payments SonarQube').click();
    await settle();
    http
      .expectOne({
        method: 'DELETE',
        url: `${BASE}/settings/sonar/servers/${getSonarSettings.servers[1]!.id}`,
      })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await answer();
  });

  it('puts a repository on the default server, leaving the project key for the reconciler to find', async () => {
    await answer();
    buttonNamed(root, 'Add repository').click();
    await settle();
    expect(text(dialog())).toContain(
      'Only needed when it is not on the default server'
    );
    expect(field<HTMLInputElement>(dialog(), 'Project key').placeholder).toBe(
      'Found by the reconciler'
    );
    const server = field<HTMLSelectElement>(dialog(), 'Server');
    expect(server.value).toBe(MAIN.id);
    expect([...server.options].map((o) => text(o))).toEqual([
      'Main SonarQube (default)',
      'Payments SonarQube',
    ]);
    type(field(dialog(), 'Repository'), ' acme/payments ');
    await confirm('Add repository');
    const add = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/sonar/repositories`,
    });
    expect(add.request.body).toEqual({
      repository: 'acme/payments',
      serverId: MAIN.id,
      projectKey: null,
    });
    expect(requestViolations('addSonarRepository', add.request.body)).toEqual(
      []
    );
    add.flush(addSonarRepository, { status: 201, statusText: 'Created' });
    await settle();
    await answer();
  });

  it('moves a repository to another server and clears its project key', async () => {
    await answer();
    buttonNamed(root, 'Edit acme/orders-web').click();
    await settle();
    expect(text(dialog())).toContain('On Main SonarQube');
    const server = field<HTMLSelectElement>(dialog(), 'Server');
    server.value = getSonarSettings.servers[1]!.id;
    server.dispatchEvent(new Event('change'));
    type(field(dialog(), 'Project key'), '');
    await confirm('Save');
    const repository = getSonarSettings.repositories[0]!;
    const change = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/sonar/repositories/${repository.id}`,
    });
    expect(change.request.body).toEqual({
      version: 1,
      serverId: getSonarSettings.servers[1]!.id,
      projectKey: null,
    });
    expect(
      requestViolations('updateSonarRepository', change.request.body)
    ).toEqual([]);
    change.flush({ ...repository, version: 2 });
    await settle();
    await answer();
  });

  it('says why the settings could not be read and reads them again on Try again', async () => {
    const unavailable = problems.find((p) => p.code === 'unavailable')!;
    settingsRead().flush(unavailable, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    historyRead().flush(listSettingsEvents);
    await settle();
    expect(text(root.querySelector('ah-banner'))).toContain(
      'The database is not reachable'
    );
    buttonNamed(root, 'Try again').click();
    await answer();
    expect(root.querySelector('ah-banner')).toBeNull();
  });

  it('says a refused read is a refused read, not a refused change', async () => {
    const forbidden = problems.find((p) => p.code === 'forbidden')!;
    settingsRead().flush(forbidden, { status: 403, statusText: 'Forbidden' });
    historyRead().flush(listSettingsEvents);
    await settle();
    expect(text(root.querySelector('ah-banner'))).toContain(
      "You can't read the team settings"
    );
    expect(text(root)).not.toContain('Only admins change team settings');
  });

  it('still shows the settings when only the history could not be read', async () => {
    const forbidden = problems.find((p) => p.code === 'forbidden')!;
    settingsRead().flush(getSonarSettings);
    historyRead().flush(forbidden, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text(root)).toContain('The history could not be read');
    expect(
      root.querySelectorAll('[aria-label="SonarQube servers"] tbody tr')
    ).toHaveLength(2);
  });
});
