import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '@core/api/api-base';
import { CLOCK } from '@core/realtime/clock';
import { FakeClock } from '@core/realtime/testing/fake-clock';
import {
  bannerHeadings,
  buttonNamed,
  buttonsNamed,
  choose,
  dialog,
  field,
  problem,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import addEnvironment from '@testing/fixtures/addEnvironment.json';
import getEnvironments from '@testing/fixtures/getEnvironments.json';
import listEnvironmentSettingsEvents from '@testing/fixtures/listEnvironmentSettingsEvents.json';
import testEnvironment from '@testing/fixtures/testEnvironment.json';
import updateEnvironment from '@testing/fixtures/updateEnvironment.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnvironmentsSettingsPage } from './environments-settings-page';
import { TEST_FOLLOW_MS } from './environments-settings-store';

const BASE = '/api/v1';
const TEST = getEnvironments.environments[0]!;
const DEMO = getEnvironments.environments[1]!;

/** The page with its TEST environment changed by `change`. */
function withTest(change: object): typeof getEnvironments {
  return {
    ...getEnvironments,
    environments: [{ ...TEST, ...change }, DEMO],
  };
}

describe('the Environments section of Team settings', () => {
  let fixture: ComponentFixture<EnvironmentsSettingsPage>;
  let http: HttpTestingController;
  let clock: FakeClock;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const pageRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/environments` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(page: object = getEnvironments): Promise<void> {
    pageRead().flush(page);
    historyRead().flush(listEnvironmentSettingsEvents);
    await settle();
  }

  const row = (name: string) =>
    root.querySelector(`tr[data-environment="${name}"]`);
  /** The steps the page explains, each as its mark's name and its title. */
  const steps = () =>
    [...root.querySelectorAll('li.step')].map(
      (li) =>
        `${li.querySelector('.mark')?.getAttribute('aria-label')}: ${text(li.querySelector('.title'))}`
    );
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const refusal = (code: string, detail: string) => ({
    ...problem(code),
    detail,
  });
  const refused = {
    status: 409,
    statusText: 'Refused',
    headers: { 'content-type': 'application/problem+json' },
  };

  /** Fills the dialog with a new environment that signs in with a form. */
  function typeNewEnvironment(): void {
    type(field(dialog(), 'Name'), '  Staging  ');
    type(field(dialog(), 'Base URL'), 'https://staging.test.example.com/app/');
    type(
      field<HTMLTextAreaElement>(dialog(), 'Other allowed origins'),
      'https://api.test.example.com\nhttps://staging.test.example.com'
    );
    choose(
      field<HTMLSelectElement>(dialog(), 'How the browser signs in'),
      'form'
    );
  }

  beforeEach(async () => {
    clock = new FakeClock();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE, useValue: BASE },
        { provide: CLOCK, useValue: clock },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EnvironmentsSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('lists each environment with how it signs in and its last test, and its own history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('environments');
    pageRead().flush(getEnvironments);
    history.flush(listEnvironmentSettingsEvents);
    await settle();
    const test = text(row('TEST'));
    expect(test).toContain('Defects are reproduced here');
    expect(test).toContain('https://test.example.com/app');
    expect(test).toContain('and https://api.test.example.com');
    expect(test).toContain('Form, as ahoy-reader');
    expect(test).toContain('Reads only');
    expect(test).toContain('Signed in');
    expect(test).toContain('Alex Example');
    const demo = text(row('Demo'));
    expect(demo).toContain('No sign-in');
    expect(demo).toContain('Not tested');
    expect(demo).not.toContain('Defects are reproduced here');
    expect(text(root)).toContain(
      'Team settings › Defects allows: test.example.com, *.test.example.com, demo.example.com.'
    );
    expect(
      [
        ...root.querySelectorAll('[aria-label="Changes to Environments"] li'),
      ].map((li) => text(li.querySelector('.history__text span')))
    ).toEqual([
      'Changed environment TEST: allowed origins',
      'Added environment TEST (https://test.example.com/app), password set',
    ]);
    expect(bannerHeadings(root)).toEqual([]);
    expect(clock.pending).toBe(0);
  });

  it('says what an environment is for, and the three steps to a first reproduction when none is listed', async () => {
    await answer({ ...getEnvironments, environments: [] });
    expect(text(root.querySelector('.head'))).toContain(
      'Ahoy uses it to reproduce a defect before trying to fix it'
    );
    expect(text(root.querySelector('.head'))).toContain(
      'Optional: without one, defects are listed and started as before.'
    );
    expect(steps()).toEqual([
      'Step 1, to do: Add the environment',
      'Step 2, to do: Test the sign-in',
      'Step 3, to do: Choose where defects are reproduced',
    ]);
    const list = root.querySelector(
      '[aria-label="Steps to reproduce defects"]'
    );
    expect(
      [...(list?.querySelectorAll('a') ?? [])].map(
        (a) => `${text(a)} ${a.getAttribute('href')}`
      )
    ).toEqual(['Team settings › Defects /settings/defects', 'Backlog /docks']);
  });

  it('ticks the step of an environment that is listed but whose sign-in was never tested', async () => {
    await answer({
      ...getEnvironments,
      environments: [{ ...TEST, lastTest: null, inUse: false }],
    });
    expect(steps()).toEqual([
      'Done: Add the environment',
      'Step 2, to do: Test the sign-in',
      'Step 3, to do: Choose where defects are reproduced',
    ]);
  });

  it('leaves only choosing it in Defects once a browser gets into an environment', async () => {
    await answer({
      ...getEnvironments,
      environments: [{ ...TEST, inUse: false }, DEMO],
    });
    expect(steps()).toEqual([
      'Done: Add the environment',
      'Done: Test the sign-in',
      'Step 3, to do: Choose where defects are reproduced',
    ]);
  });

  it('drops the steps once defects are reproduced in an environment, and still says what one is for', async () => {
    await answer();
    expect(steps()).toEqual([]);
    expect(text(root.querySelector('.head'))).toContain(
      'Ahoy uses it to reproduce a defect before trying to fix it'
    );
  });

  it('adds an environment that signs in with a form, the URLs as the API keeps them', async () => {
    await answer();
    buttonNamed(root, 'Add environment').click();
    await settle();
    typeNewEnvironment();
    await settle();
    type(
      field(dialog(), 'Login page'),
      'https://staging.test.example.com/login'
    );
    type(field(dialog(), 'User'), ' ahoy-reader ');
    type(field(dialog(), 'Password'), 'not a real password');
    type(field(dialog(), 'Signed-in element'), ' #account-menu ');
    await settle();
    buttonNamed(dialog(), 'Add environment').click();
    await settle();
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/environments`,
    });
    expect(post.request.body).toEqual({
      name: 'Staging',
      baseUrl: 'https://staging.test.example.com/app',
      allowedOrigins: ['https://api.test.example.com'],
      signIn: {
        kind: 'form',
        loginUrl: 'https://staging.test.example.com/login',
        username: 'ahoy-reader',
        password: 'not a real password',
        userSelector: null,
        passwordSelector: null,
        submitSelector: null,
        signedInUrlPattern: null,
        signedInSelector: '#account-menu',
      },
      writes: false,
      versionUrl: null,
    });
    expect(requestViolations('addEnvironment', post.request.body)).toEqual([]);
    post.flush(addEnvironment, { status: 201, statusText: 'OK' });
    await settle();
    await answer();
    expect(toasts()).toContain(
      'Staging added. Test its sign-in before reproducing a defect in it.'
    );
  });

  it('adds an environment without a sign-in', async () => {
    await answer();
    buttonNamed(root, 'Add environment').click();
    await settle();
    type(field(dialog(), 'Name'), 'Demo 2');
    type(field(dialog(), 'Base URL'), 'https://demo.example.com');
    await settle();
    buttonNamed(dialog(), 'Add environment').click();
    await settle();
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/environments`,
    });
    expect(post.request.body).toEqual({
      name: 'Demo 2',
      baseUrl: 'https://demo.example.com',
      allowedOrigins: [],
      signIn: { kind: 'none' },
      writes: false,
      versionUrl: null,
    });
    expect(requestViolations('addEnvironment', post.request.body)).toEqual([]);
    post.flush(addEnvironment, { status: 201, statusText: 'OK' });
    await settle();
    await answer();
  });

  it('refuses a base URL that is not https or not on the hosts Team settings › Defects allows, before sending anything', async () => {
    await answer();
    buttonNamed(root, 'Add environment').click();
    await settle();
    type(field(dialog(), 'Name'), 'Staging');
    type(field(dialog(), 'Base URL'), 'http://test.example.com');
    await settle();
    expect(text(dialog())).toContain(
      'An https URL without a query, such as https://test.example.com/app.'
    );
    expect(buttonNamed(dialog(), 'Add environment').disabled).toBe(true);
    type(field(dialog(), 'Base URL'), 'https://other.example.org/app');
    await settle();
    expect(text(dialog())).toContain(
      'Not on the hosts Team settings › Defects allows: https://other.example.org.'
    );
    expect(buttonNamed(dialog(), 'Add environment').disabled).toBe(true);
    type(field(dialog(), 'Base URL'), 'https://test.example.com/app');
    type(
      field<HTMLTextAreaElement>(dialog(), 'Other allowed origins'),
      'https://cdn.example.net'
    );
    await settle();
    expect(text(dialog())).toContain(
      'Not on the hosts Team settings › Defects allows: https://cdn.example.net.'
    );
    type(
      field<HTMLTextAreaElement>(dialog(), 'Other allowed origins'),
      'https://api.test.example.com/v1'
    );
    await settle();
    expect(text(dialog())).toContain(
      'https://api.test.example.com/v1 is not an origin: type https://host or https://host:port, without a path.'
    );
    expect(buttonNamed(dialog(), 'Add environment').disabled).toBe(true);
  });

  it('refuses a form sign-in without a password, a way to tell a signed-in page, or a login page on an allowed origin', async () => {
    await answer();
    buttonNamed(root, 'Add environment').click();
    await settle();
    typeNewEnvironment();
    await settle();
    type(field(dialog(), 'Login page'), 'https://sso.example.org/login');
    type(field(dialog(), 'User'), 'ahoy-reader');
    type(field(dialog(), 'Password'), '');
    type(field(dialog(), 'Signed-in URL'), '');
    await settle();
    expect(text(dialog())).toContain(
      "The login page must be on the base URL's origin or another allowed origin."
    );
    expect(text(dialog())).toContain('Type the account’s password.');
    expect(text(dialog())).toContain(
      'Say how a signed-in page is told: its URL or an element only it has.'
    );
    expect(buttonNamed(dialog(), 'Add environment').disabled).toBe(true);
  });

  it('adds a login over several pages as steps, an option only for a select, in the order arranged', async () => {
    await answer();
    buttonNamed(root, 'Add environment').click();
    await settle();
    typeNewEnvironment();
    await settle();
    type(field(dialog(), 'Login page'), 'https://api.test.example.com/login');
    type(field(dialog(), 'User'), 'ahoy-reader');
    type(field(dialog(), 'Password'), 'not a real password');
    type(field(dialog(), 'Signed-in element'), '#account-menu');
    for (let i = 0; i < 4; i++) buttonNamed(dialog(), 'Add step').click();
    await settle();
    choose(field<HTMLSelectElement>(dialog(), 'Step 1'), 'fill_password');
    type(field(dialog(), 'Step 1 element'), 'input[type=password]');
    choose(field<HTMLSelectElement>(dialog(), 'Step 2'), 'select');
    await settle();
    type(field(dialog(), 'Step 2 element'), '#callback_1');
    type(field(dialog(), 'Step 2 option'), '0');
    choose(field<HTMLSelectElement>(dialog(), 'Step 3'), 'fill_user');
    type(field(dialog(), 'Step 3 element'), "input[placeholder='User Name']");
    type(field(dialog(), 'Step 4 element'), "input[value='Submit']");
    await settle();
    buttonNamed(dialog(), 'Move step 3 up').click();
    await settle();
    buttonNamed(dialog(), 'Move step 2 up').click();
    await settle();
    buttonNamed(dialog(), 'Add environment').click();
    await settle();
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/environments`,
    });
    expect(post.request.body.signIn.steps).toEqual([
      { action: 'fill_user', selector: "input[placeholder='User Name']" },
      { action: 'fill_password', selector: 'input[type=password]' },
      { action: 'select', selector: '#callback_1', value: '0' },
      { action: 'click', selector: "input[value='Submit']" },
    ]);
    expect(requestViolations('addEnvironment', post.request.body)).toEqual([]);
    post.flush(addEnvironment, { status: 201, statusText: 'OK' });
    await settle();
    await answer();
  });

  it('refuses steps that never type the password, and sends none once they are removed', async () => {
    await answer();
    buttonNamed(root, 'Edit TEST').click();
    await settle();
    buttonNamed(dialog(), 'Add step').click();
    await settle();
    type(field(dialog(), 'Step 1 element'), '#next');
    await settle();
    expect(text(dialog())).toContain(
      'The steps type the password exactly once.'
    );
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    buttonNamed(dialog(), 'Remove step 1').click();
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(false);
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/environments/${TEST.id}`,
    });
    expect(put.request.body.signIn).not.toHaveProperty('steps');
    put.flush(updateEnvironment);
    await settle();
    await answer();
  });

  it('saves an edit with every field again and keeps the password left empty', async () => {
    await answer();
    buttonNamed(root, 'Edit TEST').click();
    await settle();
    expect(field(dialog(), 'Password').value).toBe('');
    expect(text(dialog())).toContain('Leave empty to keep the saved password.');
    dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const put = http.expectOne({
      method: 'PUT',
      url: `${BASE}/settings/environments/${TEST.id}`,
    });
    expect(put.request.body).toEqual({
      version: 2,
      name: 'TEST',
      baseUrl: 'https://test.example.com/app',
      allowedOrigins: ['https://api.test.example.com'],
      signIn: {
        kind: 'form',
        loginUrl: 'https://test.example.com/login',
        username: 'ahoy-reader',
        userSelector: null,
        passwordSelector: null,
        submitSelector: null,
        signedInUrlPattern: 'https://test.example.com/app/*',
        signedInSelector: null,
      },
      writes: true,
      versionUrl: null,
    });
    expect(requestViolations('updateEnvironment', put.request.body)).toEqual(
      []
    );
    put.flush(updateEnvironment);
    await settle();
    await answer(withTest({ writes: true, version: 3 }));
    expect(toasts()).toContain('TEST saved.');
    expect(text(row('TEST'))).toContain('May change data');
  });

  it('asks for the password again when the saved one no longer opens, and for no password without a sign-in', async () => {
    await answer(withTest({ passwordReadable: false }));
    expect(text(row('TEST'))).toContain('Password needed again');
    buttonNamed(root, 'Edit TEST').click();
    await settle();
    expect(text(dialog())).toContain(
      'The saved password no longer opens with this server’s key: type it again.'
    );
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    buttonNamed(dialog(), 'Cancel').click();
    await settle();

    buttonNamed(root, 'Edit Demo').click();
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(false);
  });

  it('asks for the password again when the login page moves to another origin', async () => {
    await answer();
    buttonNamed(root, 'Edit TEST').click();
    await settle();
    type(field(dialog(), 'Login page'), 'https://api.test.example.com/login');
    await settle();
    expect(text(dialog())).toContain(
      'The login page moves to another origin, so the password is needed again.'
    );
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(true);
    type(field(dialog(), 'Password'), 'not a real password');
    await settle();
    expect(buttonNamed(dialog(), 'Save').disabled).toBe(false);
  });

  it("keeps the dialog open with the API's reason when it refuses the environment", async () => {
    await answer();
    buttonNamed(root, 'Edit Demo').click();
    await settle();
    type(field(dialog(), 'Name'), 'TEST');
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    http
      .expectOne({
        method: 'PUT',
        url: `${BASE}/settings/environments/${DEMO.id}`,
      })
      .flush(
        refusal(
          'validation_failed',
          'An environment named TEST already exists'
        ),
        { ...refused, status: 400 }
      );
    await settle();
    await answer();
    expect(text(dialog())).toContain(
      'An environment named TEST already exists'
    );
    expect(toasts()).toEqual([]);
  });

  it('removes an environment after a second yes, and not the one defects are reproduced in', async () => {
    await answer();
    buttonNamed(root, 'Edit TEST').click();
    await settle();
    expect(text(dialog())).toContain(
      'Defects are reproduced in TEST: choose another environment in Team settings › Defects before removing it.'
    );
    expect(buttonsNamed(dialog(), 'Remove this environment…')).toEqual([]);
    buttonNamed(dialog(), 'Cancel').click();
    await settle();

    buttonNamed(root, 'Edit Demo').click();
    await settle();
    buttonNamed(dialog(), 'Remove this environment…').click();
    await settle();
    expect(text(dialog())).toContain('Remove Demo and its password?');
    buttonNamed(dialog(), 'Remove it').click();
    await settle();
    http
      .expectOne({
        method: 'DELETE',
        url: `${BASE}/settings/environments/${DEMO.id}`,
      })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await answer({ ...getEnvironments, environments: [TEST] });
    expect(toasts()).toContain('Demo removed.');
    expect(row('Demo')).toBeNull();
  });

  it('starts a Test sign-in, says Testing… and reads again until its outcome is there', async () => {
    await answer();
    buttonNamed(root, 'Test sign-in of TEST').click();
    await settle();
    expect(text(buttonNamed(root, 'Test sign-in of TEST'))).toBe('Starting…');
    expect(buttonNamed(root, 'Test sign-in of Demo').disabled).toBe(true);
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/environments/${TEST.id}/test`,
    });
    expect(post.request.body).toBeNull();
    post.flush(testEnvironment, { status: 202, statusText: 'Accepted' });
    await settle();
    await answer(withTest({ testing: true }));
    expect(toasts()).toContain(
      'Testing the sign-in of TEST. It takes a minute or two.'
    );
    expect(text(row('TEST'))).toContain('Testing…');
    expect(text(row('TEST'))).not.toContain('Signed in');
    expect(buttonNamed(root, 'Test sign-in of TEST').disabled).toBe(true);
    expect(buttonNamed(root, 'Test sign-in of Demo').disabled).toBe(false);
    expect(clock.delays).toEqual([TEST_FOLLOW_MS]);

    await clock.advance(TEST_FOLLOW_MS);
    await answer(withTest({ testing: true }));
    expect(clock.delays).toEqual([TEST_FOLLOW_MS]);

    await clock.advance(TEST_FOLLOW_MS);
    await answer(
      withTest({
        lastTest: {
          result: 'refused',
          detail: 'The page still shows the login form.',
          at: '2026-11-15T14:02:00.000Z',
          by: 'alex',
          byName: 'Alex Example',
        },
      })
    );
    expect(text(row('TEST'))).toContain('Sign-in refused');
    expect(text(row('TEST'))).toContain('The page still shows the login form.');
    expect(buttonNamed(root, 'Test sign-in of TEST').disabled).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it("says in the API's words why a Test sign-in cannot start", async () => {
    await answer();
    buttonNamed(root, 'Test sign-in of Demo').click();
    await settle();
    http
      .expectOne({
        method: 'POST',
        url: `${BASE}/settings/environments/${DEMO.id}/test`,
      })
      .flush(refusal('invalid_state', 'Demo has no sign-in to test'), refused);
    await settle();
    await answer();
    expect(text(root)).toContain('Demo has no sign-in to test');
    expect(toasts()).toEqual([]);
    expect(buttonNamed(root, 'Test sign-in of Demo').disabled).toBe(false);
  });

  it('reads only for someone who is not an admin', async () => {
    await answer({ ...getEnvironments, canEdit: false });
    expect(bannerHeadings(root)).toEqual(['Only admins change these']);
    expect(buttonsNamed(root, 'Add environment')).toEqual([]);
    expect(buttonsNamed(root, 'Edit TEST')).toEqual([]);
    expect(buttonsNamed(root, 'Test sign-in of TEST')).toEqual([]);
    expect(text(row('TEST'))).toContain('Form, as ahoy-reader');
  });

  it('says so when no host is allowed, and offers no environment to add', async () => {
    await answer({ ...getEnvironments, allowedHosts: [], environments: [] });
    expect(bannerHeadings(root)).toEqual([
      'No host is allowed for reproductions',
    ]);
    expect(buttonsNamed(root, 'Add environment')).toEqual([]);
    expect(text(root)).toContain('No environment yet');
  });

  it('says so when the deployment cannot keep a password yet', async () => {
    await answer({ ...getEnvironments, secretsConfigured: false });
    expect(bannerHeadings(root)).toEqual(['Passwords cannot be saved yet']);
    expect(buttonsNamed(root, 'Add environment')).toHaveLength(1);
  });
});
