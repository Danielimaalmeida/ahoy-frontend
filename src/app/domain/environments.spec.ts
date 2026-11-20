import {
  describeEnvironmentEvent,
  environmentUrlOf,
  environmentUseProgress,
  environmentsStateLabel,
  originAllowed,
  originOfUrl,
  originsOutside,
  otherOriginsOf,
  selectorOf,
  signInLabel,
  signInStepsOf,
  signInTestView,
} from './environments';
import { describeSettingsEvent } from './settings';

describe('environmentUrlOf', () => {
  it('keeps an https URL as the API does, without its trailing slash', () => {
    expect(environmentUrlOf(' https://test.example.com/app/ ')).toBe(
      'https://test.example.com/app'
    );
    expect(environmentUrlOf('https://TEST.example.com')).toBe(
      'https://test.example.com'
    );
    expect(environmentUrlOf('https://test.example.com:8443/')).toBe(
      'https://test.example.com:8443'
    );
  });

  it('refuses http, credentials, a query, a fragment and what is not a URL', () => {
    for (const typed of [
      'http://test.example.com',
      'https://user:secret@test.example.com',
      'https://user@test.example.com',
      'https://test.example.com/app?tab=1',
      'https://test.example.com/app#top',
      'test.example.com',
      '',
    ])
      expect(environmentUrlOf(typed), typed).toBeUndefined();
  });

  it('gives the origin of a URL it kept', () => {
    expect(originOfUrl('https://test.example.com:8443/app')).toBe(
      'https://test.example.com:8443'
    );
  });
});

describe('originAllowed', () => {
  const hosts = ['test.example.com', '*.apps.example.com'];

  it('takes a named host on any port, and the subdomains of a starred one only', () => {
    expect(originAllowed('https://test.example.com', hosts)).toBe(true);
    expect(originAllowed('https://test.example.com:8443', hosts)).toBe(true);
    expect(originAllowed('https://shop.apps.example.com', hosts)).toBe(true);
    expect(originAllowed('https://a.b.apps.example.com', hosts)).toBe(true);
  });

  it('refuses another host, a starred domain itself and a host that only ends alike', () => {
    expect(originAllowed('https://other.example.com', hosts)).toBe(false);
    expect(originAllowed('https://apps.example.com', hosts)).toBe(false);
    expect(originAllowed('https://evilapps.example.com', hosts)).toBe(false);
    expect(originAllowed('https://test.example.com.evil.org', hosts)).toBe(
      false
    );
    expect(originAllowed('https://test.example.com', [])).toBe(false);
  });

  it('names the origins outside the allowed hosts, in the order given', () => {
    expect(
      originsOutside(
        [
          'https://cdn.example.net',
          'https://test.example.com',
          'https://other.example.org',
        ],
        hosts
      )
    ).toEqual(['https://cdn.example.net', 'https://other.example.org']);
  });
});

describe('otherOriginsOf', () => {
  const base = 'https://test.example.com';

  it('reads one origin per line or comma, each once and without the base URL’s own', () => {
    expect(
      otherOriginsOf(
        ' https://api.test.example.com/ \n\nhttps://test.example.com, https://api.test.example.com,https://cdn.test.example.com:8443',
        base
      )
    ).toEqual({
      value: [
        'https://api.test.example.com',
        'https://cdn.test.example.com:8443',
      ],
    });
    expect(otherOriginsOf('  \n ', base)).toEqual({ value: [] });
  });

  it('refuses a path, http and what is not a URL, naming the line', () => {
    for (const line of [
      'https://api.test.example.com/v1',
      'http://api.test.example.com',
      'api.test.example.com',
    ])
      expect(otherOriginsOf(line, base), line).toEqual({
        problem: `${line} is not an origin: type https://host or https://host:port, without a path.`,
      });
  });

  it('refuses more origins than the API keeps, the base URL’s included', () => {
    const origins = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://h${i}.test.example.com`);
    expect('value' in otherOriginsOf(origins(19).join('\n'), base)).toBe(true);
    expect(otherOriginsOf(origins(20).join('\n'), base)).toEqual({
      problem: "At most 20 origins, the base URL's included.",
    });
  });
});

describe('selectorOf', () => {
  it('trims, reads a blank as none and refuses one longer than the API keeps', () => {
    expect(selectorOf(' #account-menu ')).toEqual({ value: '#account-menu' });
    expect(selectorOf('   ')).toEqual({ value: null });
    expect(selectorOf('a'.repeat(300))).toEqual({ value: 'a'.repeat(300) });
    expect(selectorOf('a'.repeat(301))).toEqual({
      problem: 'At most 300 characters.',
    });
  });
});

describe('signInStepsOf', () => {
  const step = (
    action: 'fill_user' | 'fill_password' | 'select' | 'click',
    selector: string,
    value = ''
  ) => ({ action, selector, value });

  it('reads no steps as none, and trims the rest, keeping an option for a select only', () => {
    expect(signInStepsOf([])).toEqual({ value: null });
    expect(
      signInStepsOf([
        step('fill_user', " input[placeholder='User Name'] ", 'ignored'),
        step('click', "input[value='NEXT']"),
        step('select', '#callback_1', ' 0 '),
        step('fill_password', 'input[type=password]'),
        step('click', "input[value='Submit']"),
      ])
    ).toEqual({
      value: [
        { action: 'fill_user', selector: "input[placeholder='User Name']" },
        { action: 'click', selector: "input[value='NEXT']" },
        { action: 'select', selector: '#callback_1', value: '0' },
        { action: 'fill_password', selector: 'input[type=password]' },
        { action: 'click', selector: "input[value='Submit']" },
      ],
    });
  });

  it('refuses a step without its element or option, a password typed other than once, the user twice and too many steps', () => {
    const password = step('fill_password', '#pw');
    expect(signInStepsOf([password, step('click', ' ')])).toEqual({
      problem:
        'Step 2: give the CSS selector it waits for, at most 300 characters.',
    });
    expect(signInStepsOf([step('select', '#how'), password])).toEqual({
      problem: 'Step 1: say which option it picks, at most 200 characters.',
    });
    expect(signInStepsOf([step('click', '#next')])).toEqual({
      problem: 'The steps type the password exactly once.',
    });
    expect(signInStepsOf([password, password])).toEqual({
      problem: 'The steps type the password exactly once.',
    });
    expect(
      signInStepsOf([
        step('fill_user', '#u'),
        step('fill_user', '#u'),
        password,
      ])
    ).toEqual({ problem: 'The steps type the user once at most.' });
    expect(
      signInStepsOf([password, ...Array(10).fill(step('click', '#next'))])
    ).toEqual({ problem: 'At most 10 steps.' });
  });
});

describe('an environment in words', () => {
  it('says how it signs in', () => {
    expect(signInLabel({ kind: 'none' })).toBe('No sign-in');
    expect(signInLabel({ kind: 'form', username: 'ahoy-reader' })).toBe(
      'Form, as ahoy-reader'
    );
  });

  it('says Testing… while a test runs, whatever the last one said', () => {
    expect(signInTestView({ result: 'refused', detail: 'x' }, true)).toEqual({
      label: 'Testing…',
      tone: 'busy',
      detail: '',
    });
  });

  it('says what the last Test sign-in found, with the API’s detail or its own', () => {
    expect(signInTestView(null, false)).toEqual({
      label: 'Not tested',
      tone: 'none',
      detail: '',
    });
    expect(
      signInTestView({ result: 'signed_in', detail: null }, false)
    ).toEqual({ label: 'Signed in', tone: 'ok', detail: '' });
    expect(signInTestView({ result: 'refused', detail: null }, false)).toEqual({
      label: 'Sign-in refused',
      tone: 'bad',
      detail: 'The environment did not accept the user or password.',
    });
    expect(
      signInTestView({ result: 'unreachable', detail: null }, false)
    ).toEqual({
      label: 'Not reached',
      tone: 'bad',
      detail: 'The browser could not open the environment.',
    });
    expect(
      signInTestView(
        { result: 'failed', detail: 'The run ended without an outcome.' },
        false
      )
    ).toEqual({
      label: 'Test failed',
      tone: 'bad',
      detail: 'The run ended without an outcome.',
    });
  });

  it('counts the environments for the navigation', () => {
    expect(environmentsStateLabel(0)).toEqual({ label: 'None', off: true });
    expect(environmentsStateLabel(1)).toEqual({
      label: '1 environment',
      off: false,
    });
    expect(environmentsStateLabel(3)).toEqual({
      label: '3 environments',
      off: false,
    });
  });
});

describe('environmentUseProgress', () => {
  const form = { signIn: { kind: 'form' }, lastTest: null, inUse: false };

  it('says nothing is done before an environment is listed', () => {
    expect(environmentUseProgress([])).toEqual({
      added: false,
      signsIn: false,
      chosen: false,
    });
  });

  it('counts a sign-in only once a test signed in, and an environment without one at once', () => {
    expect(environmentUseProgress([form])).toEqual({
      added: true,
      signsIn: false,
      chosen: false,
    });
    expect(
      environmentUseProgress([{ ...form, lastTest: { result: 'refused' } }])
        .signsIn
    ).toBe(false);
    expect(
      environmentUseProgress([{ ...form, lastTest: { result: 'signed_in' } }])
        .signsIn
    ).toBe(true);
    expect(
      environmentUseProgress([form, { ...form, signIn: { kind: 'none' } }])
        .signsIn
    ).toBe(true);
  });

  it('says one is chosen when Team settings › Defects reproduces in it', () => {
    expect(
      environmentUseProgress([form, { ...form, inUse: true }]).chosen
    ).toBe(true);
  });
});

describe('describeEnvironmentEvent', () => {
  it('names an environment added, changed and removed, and is part of the settings history', () => {
    const created = {
      name: 'TEST',
      baseUrl: 'https://test.example.com/app',
      passwordSet: true,
    };
    expect(describeEnvironmentEvent('environment.created', created)).toBe(
      'Added environment TEST (https://test.example.com/app), password set'
    );
    expect(describeSettingsEvent('environment.created', created)).toBe(
      'Added environment TEST (https://test.example.com/app), password set'
    );
    expect(
      describeEnvironmentEvent('environment.created', {
        name: 'Demo',
        baseUrl: 'https://demo.example.com',
      })
    ).toBe('Added environment Demo (https://demo.example.com)');
    expect(
      describeEnvironmentEvent('environment.updated', {
        name: 'TEST',
        changes: {
          baseUrl: { from: 'a', to: 'b' },
          signedInSelector: { from: null, to: '#menu' },
          password: 'set',
        },
      })
    ).toBe('Changed environment TEST: base URL, signed-in element, password');
    expect(
      describeEnvironmentEvent('environment.deleted', {
        name: 'Demo',
        baseUrl: 'https://demo.example.com',
      })
    ).toBe('Removed environment Demo');
  });

  it('says only that it saved when nothing changed or the payload cannot be read, and ignores other sections', () => {
    expect(
      describeEnvironmentEvent('environment.updated', {
        name: 'TEST',
        changes: {},
      })
    ).toBe('Saved environment TEST');
    expect(describeEnvironmentEvent('environment.updated', null)).toBe(
      'Saved environment an environment'
    );
    expect(describeEnvironmentEvent('environment.tested', {})).toBeUndefined();
    expect(
      describeEnvironmentEvent('defect_settings.updated', {})
    ).toBeUndefined();
  });
});
