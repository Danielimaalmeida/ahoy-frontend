import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import type {
  EnvironmentChange,
  EnvironmentRequest,
  EnvironmentRow,
  SignInRequest,
} from '@core/api/types';
import {
  MAX_ENVIRONMENT_NAME_CHARS,
  MAX_SELECTOR_CHARS,
  environmentUrlOf,
  originOfUrl,
  originsOutside,
  otherOriginsOf,
  selectorOf,
} from '@domain/environments';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './dialog-send';
import type { EnvironmentsSettingsStore } from './environments-settings-store';

/** What the dialog is opened with: the page's store, the hosts the deployment allows, and the row to edit or null. */
export interface EnvironmentDialogData {
  readonly store: EnvironmentsSettingsStore;
  readonly allowedHosts: readonly string[];
  readonly environment: EnvironmentRow | null;
}

type FormSignIn = Extract<EnvironmentRow['signIn'], { readonly kind: 'form' }>;

/** The saved form sign-in of an environment, or null when it signs in to nothing. */
function formSignInOf(environment: EnvironmentRow | null): FormSignIn | null {
  return environment?.signIn.kind === 'form' ? environment.signIn : null;
}

/**
 * Adds an environment a defect may be reproduced in, or changes or removes one: where its app opens, the other
 * origins its browser may load, how the browser signs in and whether its account may change data. Every origin must
 * be on the hosts the deployment allows, and the login page and the version URL on an allowed origin; the API checks
 * all of it again. A password is typed, never shown: left empty on an edit, the saved one is kept. Closes with true
 * once something was saved.
 */
@Component({
  selector: 'ah-environment-dialog',
  imports: [Button, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    fieldset {
      margin: 0;
      padding: 12px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    legend {
      padding: 0 6px;
      font-weight: 600;
    }
    details {
      display: flex;
      flex-direction: column;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    details > div {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 12px;
    }
    .check {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .remove {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      [heading]="
        environment ? 'Edit ' + environment.name : 'Add an environment'
      "
      subtitle="Where a browser opens your app to reproduce a defect"
      [confirmLabel]="environment ? 'Save' : 'Add environment'"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="invalid()"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Name"
          required
          hint="As the team calls it, such as TEST."
          [errorText]="touched('name') ? nameProblem() : ''"
        >
          <input
            ahInput
            formControlName="name"
            autocomplete="off"
            [attr.maxlength]="maxName"
          />
        </ah-field>
        <ah-field
          label="Base URL"
          required
          hint="Where the app opens, such as https://test.example.com/app. Its origin is always allowed."
          [errorText]="touched('baseUrl') ? baseUrlProblem() : ''"
        >
          <input
            ahInput
            mono
            formControlName="baseUrl"
            autocomplete="off"
            spellcheck="false"
            maxlength="500"
            placeholder="https://test.example.com"
          />
        </ah-field>
        <ah-field
          label="Other allowed origins"
          optional
          [hint]="originsHint"
          [errorText]="originsProblem()"
        >
          <textarea
            ahInput
            mono
            rows="2"
            formControlName="origins"
            spellcheck="false"
          ></textarea>
        </ah-field>

        <fieldset>
          <legend>Sign-in</legend>
          <ah-field
            label="How the browser signs in"
            hint="A form: one page with a user, a password and a button. A sign-in with a second factor cannot be automated."
          >
            <select ahInput formControlName="kind">
              <option value="none">No sign-in</option>
              <option value="form">A form (user and password)</option>
            </select>
          </ah-field>
          @if (value().kind === 'form') {
            <ah-field
              label="Login page"
              required
              hint="The URL of the page with the form, on an allowed origin."
              [errorText]="touched('loginUrl') ? loginUrlProblem() : ''"
            >
              <input
                ahInput
                mono
                formControlName="loginUrl"
                autocomplete="off"
                spellcheck="false"
                maxlength="500"
                placeholder="https://test.example.com/login"
              />
            </ah-field>
            <ah-field
              label="User"
              required
              hint="An account made for Ahoy, read-only where the app allows it."
              [errorText]="touched('username') ? usernameProblem() : ''"
            >
              <input
                ahInput
                formControlName="username"
                autocomplete="off"
                spellcheck="false"
                maxlength="200"
              />
            </ah-field>
            <ah-field
              label="Password"
              [required]="passwordNeeded()"
              [optional]="!passwordNeeded()"
              [hint]="passwordHint()"
              [errorText]="touched('password') ? passwordProblem() : ''"
            >
              <input
                ahInput
                type="password"
                formControlName="password"
                autocomplete="new-password"
                maxlength="500"
              />
            </ah-field>
            <ah-field
              label="Signed-in URL"
              [optional]="value().signedInSelector.trim() !== ''"
              hint="The URL of a page after signing in; * stands for any characters, such as https://test.example.com/app/*."
              [errorText]="
                touched('signedInUrlPattern') || touched('signedInSelector')
                  ? signedInProblem()
                  : ''
              "
            >
              <input
                ahInput
                mono
                formControlName="signedInUrlPattern"
                autocomplete="off"
                spellcheck="false"
                [attr.maxlength]="maxSelector"
              />
            </ah-field>
            <ah-field
              label="Signed-in element"
              [optional]="value().signedInUrlPattern.trim() !== ''"
              hint="A CSS selector only a signed-in page has, such as #account-menu. This or the URL above is needed."
            >
              <input
                ahInput
                mono
                formControlName="signedInSelector"
                autocomplete="off"
                spellcheck="false"
                [attr.maxlength]="maxSelector"
              />
            </ah-field>
            <details>
              <summary>The form's fields, when Ahoy does not find them</summary>
              <div>
                <ah-field
                  label="User field"
                  optional
                  hint="A CSS selector. Empty: the first user, email or text field."
                >
                  <input
                    ahInput
                    mono
                    formControlName="userSelector"
                    autocomplete="off"
                    spellcheck="false"
                    [attr.maxlength]="maxSelector"
                  />
                </ah-field>
                <ah-field
                  label="Password field"
                  optional
                  hint="A CSS selector. Empty: the first password field."
                >
                  <input
                    ahInput
                    mono
                    formControlName="passwordSelector"
                    autocomplete="off"
                    spellcheck="false"
                    [attr.maxlength]="maxSelector"
                  />
                </ah-field>
                <ah-field
                  label="Submit button"
                  optional
                  hint="A CSS selector. Empty: the form's submit button."
                >
                  <input
                    ahInput
                    mono
                    formControlName="submitSelector"
                    autocomplete="off"
                    spellcheck="false"
                    [attr.maxlength]="maxSelector"
                  />
                </ah-field>
              </div>
            </details>
          }
        </fieldset>

        <label class="check">
          <input type="checkbox" formControlName="writes" />
          <span
            >The account may change data.
            <span class="ah-hint"
              >Off: the agent is told to read only, and the account should be
              read-only too.</span
            ></span
          >
        </label>
        <ah-field
          label="Version URL"
          optional
          hint="A URL on an allowed origin that says which build is deployed; the verdict names it."
          [errorText]="touched('versionUrl') ? versionUrlProblem() : ''"
        >
          <input
            ahInput
            mono
            formControlName="versionUrl"
            autocomplete="off"
            spellcheck="false"
            maxlength="500"
          />
        </ah-field>
      </form>
      @if (environment) {
        <div class="remove">
          @if (environment.inUse) {
            <p class="ah-muted">
              Defects are reproduced in {{ environment.name }}: choose another
              environment in Team settings › Defects before removing it.
            </p>
          } @else if (confirmingRemove()) {
            <p>
              Remove {{ environment.name }} and its password? No defect can be
              reproduced in it afterwards.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="send.busy()"
              (click)="remove()"
            >
              Remove it
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Remove this environment…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class EnvironmentDialog {
  private readonly data = inject<EnvironmentDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);

  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly environment = this.data.environment;
  private readonly savedSignIn = formSignInOf(this.environment);
  protected readonly maxName = MAX_ENVIRONMENT_NAME_CHARS;
  protected readonly maxSelector = MAX_SELECTOR_CHARS;
  protected readonly originsHint =
    this.data.allowedHosts.length === 0
      ? 'One per line: other origins the app loads, such as its API.'
      : `One per line: other origins the app loads, such as its API. This deployment allows: ${this.data.allowedHosts.join(', ')}.`;

  protected readonly form = new FormGroup({
    name: text(this.environment?.name ?? ''),
    baseUrl: text(this.environment?.baseUrl ?? ''),
    origins: text((this.environment?.allowedOrigins ?? []).slice(1).join('\n')),
    kind: new FormControl<'none' | 'form'>(
      this.savedSignIn === null ? 'none' : 'form',
      { nonNullable: true }
    ),
    loginUrl: text(this.savedSignIn?.loginUrl ?? ''),
    username: text(this.savedSignIn?.username ?? ''),
    password: text(''),
    signedInUrlPattern: text(this.savedSignIn?.signedInUrlPattern ?? ''),
    signedInSelector: text(this.savedSignIn?.signedInSelector ?? ''),
    userSelector: text(this.savedSignIn?.userSelector ?? ''),
    passwordSelector: text(this.savedSignIn?.passwordSelector ?? ''),
    submitSelector: text(this.savedSignIn?.submitSelector ?? ''),
    writes: new FormControl(this.environment?.writes ?? false, {
      nonNullable: true,
    }),
    versionUrl: text(this.environment?.versionUrl ?? ''),
  });
  /** The form's whole value as a signal. */
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** Moves on whenever a control is touched or changed, so a field's problem shows once the admin has been there. */
  private readonly formEvents = toSignal(
    this.form.events.pipe(map(() => ({}))),
    { initialValue: {} }
  );
  protected readonly confirmingRemove = signal(false);

  private readonly baseUrl = computed(() =>
    environmentUrlOf(this.value().baseUrl)
  );
  private readonly baseOrigin = computed(() => {
    const url = this.baseUrl();
    return url === undefined ? null : originOfUrl(url);
  });
  private readonly others = computed(() =>
    otherOriginsOf(this.value().origins, this.baseOrigin())
  );
  /** Every origin the browser may open: the base URL's first; null while one of them cannot be read. */
  private readonly origins = computed((): readonly string[] | null => {
    const base = this.baseOrigin();
    const others = this.others();
    return base === null || 'problem' in others
      ? null
      : [base, ...others.value];
  });
  private readonly loginUrl = computed(() =>
    environmentUrlOf(this.value().loginUrl)
  );
  /** The version URL: null when left empty, undefined when it is not a URL. */
  private readonly versionUrl = computed(() =>
    this.value().versionUrl.trim() === ''
      ? null
      : environmentUrlOf(this.value().versionUrl)
  );

  protected readonly nameProblem = computed(() =>
    this.value().name.trim() === '' ? 'Give the environment a name.' : ''
  );
  protected readonly baseUrlProblem = computed(() => {
    if (this.value().baseUrl.trim() === '') return 'Say where the app opens.';
    const origin = this.baseOrigin();
    if (origin === null)
      return 'An https URL without a query, such as https://test.example.com/app.';
    return this.outsideText([origin]);
  });
  protected readonly originsProblem = computed(() => {
    const others = this.others();
    if ('problem' in others) return others.problem;
    return this.outsideText(others.value);
  });
  protected readonly loginUrlProblem = computed(() => {
    if (this.value().kind !== 'form') return '';
    if (this.value().loginUrl.trim() === '')
      return 'Say where the login form is.';
    return this.onAllowedOrigin(this.loginUrl(), 'The login page');
  });
  protected readonly usernameProblem = computed(() =>
    this.value().kind === 'form' && this.value().username.trim() === ''
      ? 'Name the account that signs in.'
      : ''
  );
  /**
   * Whether the password must be typed: for a new form sign-in, when the login page moves to another origin (a saved
   * password never goes to a new host), or when the saved one no longer opens with the server's key.
   */
  protected readonly passwordNeeded = computed(() => {
    if (this.value().kind !== 'form') return false;
    const saved = this.savedSignIn;
    if (saved === null || this.environment?.passwordReadable === false)
      return true;
    const login = this.loginUrl();
    return (
      login !== undefined && originOfUrl(login) !== originOfUrl(saved.loginUrl)
    );
  });
  protected readonly passwordHint = computed(() => {
    if (this.savedSignIn === null)
      return 'Kept encrypted; never shown again, not even in part.';
    if (this.environment?.passwordReadable === false)
      return 'The saved password no longer opens with this server’s key: type it again.';
    return this.passwordNeeded()
      ? 'The login page moves to another origin, so the password is needed again.'
      : 'Leave empty to keep the saved password.';
  });
  protected readonly passwordProblem = computed(() =>
    this.passwordNeeded() && this.value().password === ''
      ? 'Type the account’s password.'
      : ''
  );
  protected readonly signedInProblem = computed(() => {
    const value = this.value();
    if (value.kind !== 'form') return '';
    const pattern = selectorOf(value.signedInUrlPattern);
    const selector = selectorOf(value.signedInSelector);
    if ('problem' in pattern) return pattern.problem;
    if ('problem' in selector) return selector.problem;
    return pattern.value === null && selector.value === null
      ? 'Say how a signed-in page is told: its URL or an element only it has.'
      : '';
  });
  protected readonly versionUrlProblem = computed(() => {
    const url = this.versionUrl();
    return url === null ? '' : this.onAllowedOrigin(url, 'The version URL');
  });
  protected readonly invalid = computed(
    () =>
      this.nameProblem() !== '' ||
      this.baseUrlProblem() !== '' ||
      this.originsProblem() !== '' ||
      this.loginUrlProblem() !== '' ||
      this.usernameProblem() !== '' ||
      this.passwordProblem() !== '' ||
      this.signedInProblem() !== '' ||
      this.versionUrlProblem() !== ''
  );

  /** Whether a field was left, so its problem shows: nothing is in red before the admin typed there. */
  protected touched(name: keyof typeof this.form.controls): boolean {
    this.formEvents();
    const control = this.form.controls[name];
    return control.touched || control.dirty;
  }

  /** "Not on the hosts this deployment allows: https://other.example.org." for origins outside them, else ''. */
  private outsideText(origins: readonly string[]): string {
    const outside = originsOutside(origins, this.data.allowedHosts);
    return outside.length === 0
      ? ''
      : `Not on the hosts this deployment allows: ${outside.join(', ')}.`;
  }

  /** Why `url` cannot be used: it is not a URL, or its origin is not one of the environment's. */
  private onAllowedOrigin(url: string | undefined, what: string): string {
    if (url === undefined) return 'An https URL without a query.';
    const origins = this.origins();
    return origins === null || origins.includes(originOfUrl(url))
      ? ''
      : `${what} must be on the base URL's origin or another allowed origin.`;
  }

  /** How the environment signs in, as the request names it; the password only when one was typed. */
  private signIn(): SignInRequest {
    const value = this.value();
    const loginUrl = this.loginUrl();
    if (value.kind !== 'form' || loginUrl === undefined)
      return { kind: 'none' };
    const selector = (typed: string): string | null => {
      const read = selectorOf(typed);
      return 'value' in read ? read.value : null;
    };
    return {
      kind: 'form',
      loginUrl,
      username: value.username.trim(),
      ...(value.password !== '' ? { password: value.password } : {}),
      userSelector: selector(value.userSelector),
      passwordSelector: selector(value.passwordSelector),
      submitSelector: selector(value.submitSelector),
      signedInUrlPattern: selector(value.signedInUrlPattern),
      signedInSelector: selector(value.signedInSelector),
    };
  }

  /** Adds or saves the environment and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const baseUrl = this.baseUrl();
    const others = this.others();
    const versionUrl = this.versionUrl();
    if (
      this.invalid() ||
      baseUrl === undefined ||
      'problem' in others ||
      versionUrl === undefined
    )
      return;
    const value = this.value();
    const name = value.name.trim().replace(/\s+/g, ' ');
    const body: EnvironmentRequest = {
      name,
      baseUrl,
      allowedOrigins: [...others.value],
      signIn: this.signIn(),
      writes: value.writes,
      versionUrl,
    };
    if (this.environment === null) {
      await this.send.run(
        () => this.data.store.add(body),
        `${name} added. Test its sign-in before reproducing a defect in it.`
      );
      return;
    }
    const { id, version } = this.environment;
    const change: EnvironmentChange = { version, ...body };
    await this.send.run(
      () => this.data.store.update(id, change),
      `${name} saved.`
    );
  }

  /** Removes the environment and closes. */
  protected async remove(): Promise<void> {
    if (!this.environment || this.environment.inUse) return;
    const { id, name } = this.environment;
    await this.send.run(() => this.data.store.remove(id), `${name} removed.`);
  }
}

/** A text control that is never null. */
function text(value: string): FormControl<string> {
  return new FormControl(value, { nonNullable: true });
}
