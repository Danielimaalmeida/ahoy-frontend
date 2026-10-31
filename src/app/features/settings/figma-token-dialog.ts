import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FigmaSettings } from '@core/api/types';
import {
  figmaTokenProblem,
  MAX_FIGMA_TOKEN_CHARS,
} from '@domain/figma-settings';
import { tokenLabel } from '@domain/settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import type { FigmaSettingsStore } from './figma-settings-store';
import { DialogSend } from './dialog-send';

/** What the token dialog is opened with: the page's store and Figma's settings as they are. */
export interface FigmaTokenData {
  readonly store: FigmaSettingsStore;
  readonly figma: FigmaSettings;
  /** Whether the API's key opens the stored token. */
  readonly tokenReadable: boolean;
  /** Whether the API has `AHOY_SECRETS_KEY`: without it no token can be saved, but the stored one can be removed. */
  readonly secretsConfigured: boolean;
}

/**
 * Saves Figma's token, the first or a new one, or removes it after a second press. The token is pasted once and never
 * shown again. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-figma-token-dialog',
  imports: [
    Banner,
    Button,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
  ],
  styles: `
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
      [heading]="token ? 'Replace the Figma token' : 'Save a Figma token'"
      subtitle="Read by the design phase only, and sent only to api.figma.com"
      confirmLabel="Save token"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="problem() !== null || !data.secretsConfigured"
      [error]="send.error()"
      (confirm)="submit()"
    >
      @if (!data.secretsConfigured) {
        <ah-banner variant="notice" heading="A token can't be saved now">
          The API has no AHOY_SECRETS_KEY to store it encrypted.
        </ah-banner>
      } @else if (token && !data.tokenReadable) {
        <ah-banner variant="notice" heading="Paste the token again">
          The API's key no longer opens the stored token, so Figma stays off
          until a token is saved again.
        </ah-banner>
      }
      <form (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Personal access token"
          required
          hint="From an account that can open the team's design files, with only the file_content:read and file_variables:read scopes. Stored encrypted; never shown again."
          [errorText]="touched() ? (problem() ?? '') : ''"
        >
          <input
            ahInput
            mono
            type="password"
            autocomplete="new-password"
            spellcheck="false"
            [attr.maxlength]="maxToken"
            [attr.placeholder]="token ? 'Replaces ' + label(token.hint) : null"
            [formControl]="control"
          />
        </ah-field>
      </form>
      @if (token) {
        <div class="remove">
          @if (confirmingRemove()) {
            <p>
              Remove the Figma token {{ label(token.hint) }}? A story that links
              a Figma design halts with “Figma is not set up” until a token is
              saved again. The UI builders and the prefix stay.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="send.busy()"
              (click)="remove()"
            >
              Remove the token
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Remove the token…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class FigmaTokenDialog {
  protected readonly data = inject<FigmaTokenData>(DIALOG_DATA);
  protected readonly send = new DialogSend(
    inject<DialogRef<boolean>>(DialogRef),
    inject(ToastService)
  );
  protected readonly token = this.data.figma.token;
  protected readonly label = tokenLabel;
  protected readonly maxToken = MAX_FIGMA_TOKEN_CHARS;
  protected readonly control = new FormControl(
    { value: '', disabled: !this.data.secretsConfigured },
    { nonNullable: true }
  );
  private readonly typed = toSignal(this.control.valueChanges, {
    initialValue: '',
  });
  protected readonly touched = signal(false);
  protected readonly confirmingRemove = signal(false);
  protected readonly problem = computed(() => figmaTokenProblem(this.typed()));

  /** Saves the token and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.touched.set(true);
    if (
      this.problem() !== null ||
      this.send.busy() ||
      !this.data.secretsConfigured
    )
      return;
    const version = this.data.figma.version;
    await this.send.run(
      () =>
        this.data.store.saveToken({
          token: this.typed().trim(),
          ...(version !== null ? { version } : {}),
        }),
      'Figma token saved.'
    );
  }

  /** Removes the token and closes. */
  protected async remove(): Promise<void> {
    await this.send.run(
      () => this.data.store.removeToken(),
      'The Figma token is removed.'
    );
  }
}
