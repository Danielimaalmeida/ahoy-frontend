/**
 * Team settings › Environments in words (`ahoy-hosted` design §5 "Defect reproduction"): the deployed environments a
 * defect may be reproduced in, how the form reads what an admin types of one, what the last Test sign-in says, the
 * state the side navigation shows and what one entry of the section's history says. The API checks every rule again:
 * these only say sooner, and in the form's words, what it would refuse. Pure.
 */

import { isRecord } from './records';

/** The longest name the API keeps. */
export const MAX_ENVIRONMENT_NAME_CHARS = 40;
/** The most origins an environment allows, its base URL's included. */
export const MAX_ALLOWED_ORIGINS = 20;
/** The longest CSS selector or URL pattern the API keeps. */
export const MAX_SELECTOR_CHARS = 300;

/** What a field holds as typed: its value, or why it is refused. */
type Read<T> = { readonly value: T } | { readonly problem: string };

/**
 * An https URL without credentials, a query or a fragment, without its trailing slash, as the API keeps one;
 * undefined for anything else.
 */
export function environmentUrlOf(typed: string): string | undefined {
  const text = typed.trim();
  if (text.includes('?') || text.includes('#')) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '')
    return undefined;
  return url.href.replace(/\/+$/, '');
}

/** The origin of a URL {@link environmentUrlOf} accepted: `https://test.example.com`. */
export function originOfUrl(url: string): string {
  return new URL(url).origin;
}

/** Whether an origin's host is one Team settings › Defects allows: a host name, or `*.domain` for its subdomains only. */
export function originAllowed(
  origin: string,
  allowedHosts: readonly string[]
): boolean {
  const host = new URL(origin).hostname.toLowerCase();
  return allowedHosts.some((allowed) =>
    allowed.startsWith('*.')
      ? host.endsWith(allowed.slice(1)) && host.length > allowed.length - 1
      : host === allowed
  );
}

/**
 * The other origins as typed, one per line (commas work too): each an https origin without a path, each once and not
 * the base URL's own, or why they are refused.
 */
export function otherOriginsOf(
  typed: string,
  baseOrigin: string | null
): Read<readonly string[]> {
  const origins: string[] = [];
  for (const line of typed.split(/[\n,]/)) {
    const text = line.trim();
    if (text === '') continue;
    const url = environmentUrlOf(text);
    if (url === undefined || new URL(url).pathname !== '/')
      return {
        problem: `${text} is not an origin: type https://host or https://host:port, without a path.`,
      };
    const origin = originOfUrl(url);
    if (origin !== baseOrigin && !origins.includes(origin))
      origins.push(origin);
  }
  if (origins.length + 1 > MAX_ALLOWED_ORIGINS)
    return {
      problem: `At most ${MAX_ALLOWED_ORIGINS} origins, the base URL's included.`,
    };
  return { value: origins };
}

/** The origins among `origins` the deployment does not allow, in the order given. */
export function originsOutside(
  origins: readonly string[],
  allowedHosts: readonly string[]
): readonly string[] {
  return origins.filter((origin) => !originAllowed(origin, allowedHosts));
}

/** A CSS selector or URL pattern as typed: trimmed, null when blank, or why it is refused. */
export function selectorOf(typed: string): Read<string | null> {
  const value = typed.trim();
  if (value === '') return { value: null };
  return value.length > MAX_SELECTOR_CHARS
    ? { problem: `At most ${MAX_SELECTOR_CHARS} characters.` }
    : { value };
}

/** What one step of a login does: types the user or the password, picks an option of a list, or clicks. */
export type SignInStepAction =
  'fill_user' | 'fill_password' | 'select' | 'click';
/** Each action, in the words of the form. */
export const SIGN_IN_STEP_ACTIONS: readonly {
  readonly action: SignInStepAction;
  readonly label: string;
}[] = [
  { action: 'fill_user', label: 'Type the user' },
  { action: 'fill_password', label: 'Type the password' },
  { action: 'select', label: 'Pick an option' },
  { action: 'click', label: 'Click' },
];
/** The most steps a login has. */
export const MAX_SIGN_IN_STEPS = 10;
/** The longest option value a `select` step picks. */
export const MAX_STEP_VALUE_CHARS = 200;

/** One step as typed in the form: the value is only read for `select`. */
export interface TypedSignInStep {
  readonly action: SignInStepAction;
  readonly selector: string;
  readonly value: string;
}

/** One step as the API keeps it. */
export interface SignInStep {
  readonly action: SignInStepAction;
  readonly selector: string;
  readonly value?: string;
}

/**
 * The steps of a login over several pages as typed, trimmed; null when there are none (the one-page form), or why
 * they are refused: each needs its selector, a `select` its option, and the password is typed once, the user at most
 * once.
 */
export function signInStepsOf(
  typed: readonly TypedSignInStep[]
): Read<readonly SignInStep[] | null> {
  if (typed.length === 0) return { value: null };
  if (typed.length > MAX_SIGN_IN_STEPS)
    return { problem: `At most ${MAX_SIGN_IN_STEPS} steps.` };
  const steps: SignInStep[] = [];
  for (const [i, step] of typed.entries()) {
    const selector = step.selector.trim();
    if (selector === '' || selector.length > MAX_SELECTOR_CHARS)
      return {
        problem: `Step ${i + 1}: give the CSS selector it waits for, at most ${MAX_SELECTOR_CHARS} characters.`,
      };
    if (step.action !== 'select') {
      steps.push({ action: step.action, selector });
      continue;
    }
    const value = step.value.trim();
    if (value === '' || value.length > MAX_STEP_VALUE_CHARS)
      return {
        problem: `Step ${i + 1}: say which option it picks, at most ${MAX_STEP_VALUE_CHARS} characters.`,
      };
    steps.push({ action: 'select', selector, value });
  }
  const count = (action: SignInStepAction) =>
    steps.filter((s) => s.action === action).length;
  if (count('fill_password') !== 1)
    return { problem: 'The steps type the password exactly once.' };
  if (count('fill_user') > 1)
    return { problem: 'The steps type the user once at most.' };
  return { value: steps };
}

/** How an environment signs in, as the table says it. */
export interface SignInFacts {
  readonly kind: string;
  readonly username?: string;
}

/** "No sign-in", or "Form, as ahoy-reader". */
export function signInLabel(signIn: SignInFacts): string {
  return signIn.kind === 'form' && signIn.username !== undefined
    ? `Form, as ${signIn.username}`
    : 'No sign-in';
}

/** What the page reads of an environment's last Test sign-in. */
export interface SignInTestFacts {
  readonly result: 'signed_in' | 'refused' | 'unreachable' | 'failed';
  readonly detail: string | null;
}

/** The tone of a Test sign-in's tag: it worked, it did not, it is running, or it never ran. */
export type SignInTestTone = 'ok' | 'bad' | 'busy' | 'none';

/**
 * What the Sign-in test cell says: "Testing…" while one is queued or running, "Not tested", "Signed in", or what
 * stopped it, with the API's detail under it.
 */
export function signInTestView(
  test: SignInTestFacts | null,
  testing: boolean
): {
  readonly label: string;
  readonly tone: SignInTestTone;
  readonly detail: string;
} {
  if (testing) return { label: 'Testing…', tone: 'busy', detail: '' };
  if (test === null) return { label: 'Not tested', tone: 'none', detail: '' };
  const detail = test.detail ?? '';
  switch (test.result) {
    case 'signed_in':
      return { label: 'Signed in', tone: 'ok', detail };
    case 'refused':
      return {
        label: 'Sign-in refused',
        tone: 'bad',
        detail:
          detail || 'The environment did not accept the user or password.',
      };
    case 'unreachable':
      return {
        label: 'Not reached',
        tone: 'bad',
        detail: detail || 'The browser could not open the environment.',
      };
    case 'failed':
      return { label: 'Test failed', tone: 'bad', detail };
  }
}

/** What the page reads of an environment to say how far the team is from reproducing a defect in one. */
export interface EnvironmentUseFacts {
  readonly signIn: { readonly kind: string };
  readonly lastTest: { readonly result: string } | null;
  /** Whether Team settings › Defects reproduces defects in it. */
  readonly inUse: boolean;
}

/**
 * How far the team is from reproducing a defect: an environment is listed; a browser can get into one (its last Test
 * sign-in signed in, or it has no sign-in to test); and one is chosen in Team settings › Defects.
 */
export function environmentUseProgress(
  environments: readonly EnvironmentUseFacts[]
): {
  readonly added: boolean;
  readonly signsIn: boolean;
  readonly chosen: boolean;
} {
  return {
    added: environments.length > 0,
    signsIn: environments.some(
      (e) => e.signIn.kind === 'none' || e.lastTest?.result === 'signed_in'
    ),
    chosen: environments.some((e) => e.inUse),
  };
}

/** The side navigation's word for the section: "2 environments", or "None". */
export function environmentsStateLabel(count: number): {
  readonly label: string;
  readonly off: boolean;
} {
  if (count === 0) return { label: 'None', off: true };
  return {
    label: count === 1 ? '1 environment' : `${count} environments`,
    off: false,
  };
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  name: 'name',
  baseUrl: 'base URL',
  allowedOrigins: 'allowed origins',
  signIn: 'sign-in',
  loginUrl: 'login page',
  username: 'user',
  password: 'password',
  userSelector: 'user field',
  passwordSelector: 'password field',
  submitSelector: 'submit button',
  signInSteps: 'sign-in steps',
  signedInUrlPattern: 'signed-in URL',
  signedInSelector: 'signed-in element',
  writes: 'may change data',
  versionUrl: 'version URL',
};

/** What one Environments entry of the settings history says happened, or undefined for another section's. */
export function describeEnvironmentEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (!type.startsWith('environment.')) return undefined;
  const p = isRecord(payload) ? payload : {};
  const name = typeof p['name'] === 'string' ? p['name'] : 'an environment';
  const baseUrl = typeof p['baseUrl'] === 'string' ? ` (${p['baseUrl']})` : '';
  switch (type) {
    case 'environment.created':
      return `Added environment ${name}${baseUrl}${p['passwordSet'] === true ? ', password set' : ''}`;
    case 'environment.updated': {
      const changes = p['changes'];
      const fields = isRecord(changes)
        ? Object.keys(changes).map((field) => FIELD_NAMES[field] ?? field)
        : [];
      return fields.length === 0
        ? `Saved environment ${name}`
        : `Changed environment ${name}: ${fields.join(', ')}`;
    }
    case 'environment.deleted':
      return `Removed environment ${name}`;
    default:
      return undefined;
  }
}
