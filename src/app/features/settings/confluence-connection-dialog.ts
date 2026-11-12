import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type {
  ConfluenceConnectionRequest,
  ConfluenceSettings,
} from '@core/api/types';
import { tokenLabel } from '@domain/settings';
import { absoluteDay } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './dialog-send';
import type { ConfluenceSettingsStore } from './confluence-settings-store';
import { hostOf } from './settings-url';

/** What the connection dialog is opened with: the page's store and Confluence as set, or null to connect it. */
export interface ConfluenceConnectionData {
  readonly store: ConfluenceSettingsStore;
  readonly confluence: ConfluenceSettings | null;
  /** Whether the API's key opens the stored token; when it does not, the token must be typed again. */
  readonly tokenReadable: boolean;
}

/** An https URL without credentials, query or fragment, as the API takes Confluence's base URL. */
const BASE_URL = /^\s*https:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?\s*$/i;

/**
 * Connects Confluence or changes its connection: the base URL (with its context path) and the token, and turning
 * Confluence off.
 * The token is typed once and never shown again: editing keeps it unless a new one is typed, and a new base URL needs
 * it typed again so the old token never goes there. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-confluence-connection-dialog',
  imports: [
    Banner,
    Button,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
  ],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .remove {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
    .remove p {
      margin: 0;
    }
  `,
  template: `
    <ah-dialog
      icon="lock"
      [heading]="
        confluence ? 'Edit the Confluence connection' : 'Connect Confluence'
      "
      [subtitle]="subtitle"
      [confirmLabel]="confluence ? 'Save' : 'Connect'"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="form.invalid || needsToken()"
      [error]="send.error()"
      (confirm)="submit()"
    >
      @if (needsToken()) {
        <ah-banner variant="notice" heading="Type the token again">
          {{
            lostToken
              ? "The API's key no longer opens the stored token, so Confluence stays off until it is typed again."
              : 'A new base URL needs its token, so the old one never goes there.'
          }}
        </ah-banner>
      }
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Base URL"
          required
          [hint]="urlHint()"
          [errorMessages]="{
            pattern:
              'An https address without a query, such as https://confluence.example.com/confluence.',
          }"
        >
          <input
            ahInput
            mono
            type="url"
            formControlName="baseUrl"
            autocomplete="off"
            maxlength="500"
          />
        </ah-field>
        <ah-field
          [label]="confluence ? 'New token' : 'Token'"
          [required]="!confluence || needsToken()"
          [hint]="tokenHint"
        >
          <input
            ahInput
            mono
            type="password"
            formControlName="token"
            autocomplete="new-password"
            spellcheck="false"
            maxlength="1000"
            [attr.placeholder]="
              confluence && !lostToken
                ? 'Leave empty to keep ' +
                  token(confluence.connection.tokenHint)
                : null
            "
          />
        </ah-field>
      </form>
      @if (confluence) {
        <div class="remove">
          @if (confirmingOff()) {
            <p>
              Turn Confluence off? Create in Confluence stops until it is
              connected again. Pages already created stay, and so do the
              meetings' links to them. Its token is deleted.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="send.busy()"
              (click)="turnOff()"
            >
              Turn Confluence off
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingOff.set(true)"
            >
              Turn Confluence off…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class ConfluenceConnectionDialog {
  private readonly data = inject<ConfluenceConnectionData>(DIALOG_DATA);
  protected readonly send = new DialogSend(
    inject<DialogRef<boolean>>(DialogRef),
    inject(ToastService)
  );
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);

  protected readonly confluence = this.data.confluence;
  protected readonly token = tokenLabel;
  protected readonly subtitle = this.confluence
    ? `Connected at ${this.confluence.connection.baseUrl}`
    : 'Meetings create their pages in Confluence with this token';
  protected readonly tokenHint =
    'A personal access token of a user who can see the parent pages and create pages under them; every page is created as that user. Stored encrypted; never shown again.' +
    (this.confluence
      ? ` Set by ${this.confluence.connection.tokenSetByName ?? this.confluence.connection.tokenSetBy} on ${absoluteDay(this.confluence.connection.tokenSetAt, new Date())}.`
      : '');
  protected readonly form = new FormGroup({
    baseUrl: new FormControl(this.confluence?.connection.baseUrl ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(BASE_URL)],
    }),
    token: new FormControl('', {
      nonNullable: true,
      validators: this.confluence
        ? [Validators.pattern(/^\s*\S*\s*$/)]
        : [Validators.required, Validators.pattern(/^\s*\S+\s*$/)],
    }),
  });
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  /** Whether the stored token can no longer be opened, so keeping it keeps Confluence off. */
  protected readonly lostToken =
    this.confluence !== null && !this.data.tokenReadable;
  /**
   * Whether a new token is needed and not typed: the base URL changed (the old token never goes to a new host), or
   * the stored one can no longer be opened.
   */
  protected readonly needsToken = computed(() => {
    const value = this.value();
    return (
      this.confluence !== null &&
      (this.lostToken ||
        hostOf(value.baseUrl ?? '') !== this.confluence.connection.baseUrl) &&
      (value.token ?? '').trim() === ''
    );
  });
  /** The base URL's hint: what it was when it changed, else an example. */
  protected readonly urlHint = computed(() =>
    this.confluence !== null &&
    hostOf(this.value().baseUrl ?? '') !== this.confluence.connection.baseUrl
      ? `Was ${this.confluence.connection.baseUrl}`
      : "Confluence's address with its context path, such as https://confluence.example.com/confluence."
  );
  protected readonly confirmingOff = signal(false);

  /** Connects or saves and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.needsToken() || this.send.busy()) return;
    const value = this.form.getRawValue();
    const baseUrl = hostOf(value.baseUrl);
    const token = value.token.trim();
    if (this.confluence === null) {
      await this.send.run(
        () => this.data.store.connect({ baseUrl, token }),
        'Confluence is connected.'
      );
      return;
    }
    const moved = baseUrl !== this.confluence.connection.baseUrl;
    if (!moved && token === '') {
      this.ref.close(false);
      return;
    }
    const body: ConfluenceConnectionRequest = {
      version: this.confluence.version,
      baseUrl,
      ...(token !== '' ? { token } : {}),
    };
    await this.send.run(
      () => this.data.store.connect(body),
      'Confluence connection saved.'
    );
  }

  /** Turns Confluence off and closes. */
  protected async turnOff(): Promise<void> {
    await this.send.run(
      () => this.data.store.disconnect(),
      'Confluence is off.'
    );
  }
}
