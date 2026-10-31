import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { CommandErrorView } from '@core/commands/command-error';
import type { SonarServer, SonarServerChange } from '@core/api/types';
import { tokenLabel } from '@domain/settings';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { settingsErrorView } from './settings-errors';
import type { SettingsStore } from './settings-store';

/** What the server dialog is opened with: the page's store and the server to edit, or null to add one. */
export interface SonarServerData {
  readonly store: SettingsStore;
  readonly server: SonarServer | null;
  /** Whether this would be the first server, which is then the default. */
  readonly first: boolean;
}

/** A host URL without its trailing slashes, as the API keeps it. */
function hostOf(text: string): string {
  return text.trim().replace(/\/+$/, '');
}

/**
 * Adds a SonarQube server or edits one: its name, host, token and whether it is the default, and removing it. The
 * token is typed once and never shown again: editing keeps it unless a new one is typed, and a new host needs it typed
 * again so the old token never goes there. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-sonar-server-dialog',
  imports: [Button, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    label.check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .check__text {
      display: flex;
      flex-direction: column;
    }
    .remove {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
  `,
  template: `
    <ah-dialog
      icon="lock"
      [heading]="server ? 'Edit ' + server.name : 'Add a SonarQube server'"
      [confirmLabel]="server ? 'Save' : 'Add server'"
      busyLabel="Saving…"
      [busy]="busy()"
      [confirmDisabled]="form.invalid"
      [error]="error()"
      (confirm)="submit()"
    >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Name" required hint="How the team calls it.">
          <input
            ahInput
            formControlName="name"
            autocomplete="off"
            maxlength="100"
          />
        </ah-field>
        <ah-field
          label="Host"
          required
          hint="The address of SonarQube, such as https://sonar.example.com."
        >
          <input
            ahInput
            mono
            type="url"
            formControlName="hostUrl"
            autocomplete="off"
            maxlength="500"
          />
        </ah-field>
        <ah-field
          label="Token"
          [required]="!server"
          [optional]="server !== null"
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
          />
        </ah-field>
        @if (server?.isDefault) {
          <span class="ah-hint"
            >This is the default server, for the repositories not listed below.
            To change that, make another server the default.</span
          >
        } @else {
          <label class="check">
            <input type="checkbox" formControlName="isDefault" />
            <span class="check__text">
              <span>The default server</span>
              <span class="ah-hint"
                >For every repository not listed under Repositories.</span
              >
            </span>
          </label>
        }
      </form>
      @if (server) {
        <div class="remove">
          @if (server.repositoryCount > 0) {
            <span class="ah-hint"
              >{{ server.repositoryCount }}
              {{
                server.repositoryCount === 1
                  ? 'repository is'
                  : 'repositories are'
              }}
              on this server. Move or remove
              {{ server.repositoryCount === 1 ? 'it' : 'them' }} before removing
              the server.</span
            >
          } @else if (confirmingRemove()) {
            <p>
              Remove {{ server.name }}? Its token is deleted with it.
              @if (server.isDefault) {
                Repositories not listed will have no SonarQube until another
                server is the default.
              }
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="busy()"
              (click)="remove()"
            >
              Remove {{ server.name }}
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Remove this server…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class SonarServerDialog {
  private readonly data = inject<SonarServerData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly server = this.data.server;
  protected readonly tokenHint = this.server
    ? `Kept as ${tokenLabel(this.server.tokenHint)} unless you type a new one. A new host needs it again.`
    : 'A SonarQube user token that can read the projects. It is stored encrypted and never shown again.';
  protected readonly form = new FormGroup({
    name: new FormControl(this.server?.name ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    hostUrl: new FormControl(this.server?.hostUrl ?? '', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\s*https?:\/\/\S+\s*$/),
      ],
    }),
    token: new FormControl('', {
      nonNullable: true,
      validators: this.server
        ? [Validators.pattern(/^\s*\S*\s*$/)]
        : [Validators.required, Validators.pattern(/^\s*\S+\s*$/)],
    }),
    isDefault: new FormControl(this.server?.isDefault ?? this.data.first, {
      nonNullable: true,
    }),
  });
  protected readonly busy = signal(false);
  protected readonly confirmingRemove = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  private readonly refusal = signal<CommandErrorView | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? this.refusal() : settingsErrorView(failure);
  });

  /** Adds or saves the server and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();
    const name = value.name.trim().replace(/\s+/g, ' ');
    const hostUrl = hostOf(value.hostUrl);
    const token = value.token.trim();
    if (this.server === null) {
      await this.send(
        () =>
          this.data.store.addServer({
            name,
            hostUrl,
            token,
            isDefault: value.isDefault,
          }),
        `${name} added.`
      );
      return;
    }
    const change = this.changeOf(
      this.server,
      name,
      hostUrl,
      token,
      value.isDefault
    );
    if (change === null) {
      this.ref.close(false);
      return;
    }
    if (change.hostUrl !== undefined && change.token === undefined) {
      this.failure.set(null);
      this.refusal.set({
        variant: 'error',
        heading: 'Type the token again',
        text: 'A new host needs its token, so the old one never goes there.',
      });
      return;
    }
    const id = this.server.id;
    await this.send(
      () => this.data.store.updateServer(id, change),
      `${name} saved.`
    );
  }

  /** What changed, with the version it was read at; null when nothing did. */
  private changeOf(
    server: SonarServer,
    name: string,
    hostUrl: string,
    token: string,
    isDefault: boolean
  ): SonarServerChange | null {
    const change: SonarServerChange = {
      version: server.version,
      ...(name !== server.name ? { name } : {}),
      ...(hostUrl !== server.hostUrl ? { hostUrl } : {}),
      ...(token !== '' ? { token } : {}),
      ...(isDefault && !server.isDefault ? { isDefault: true } : {}),
    };
    return Object.keys(change).length > 1 ? change : null;
  }

  /** Removes the server and closes. */
  protected async remove(): Promise<void> {
    if (!this.server) return;
    const id = this.server.id;
    await this.send(
      () => this.data.store.removeServer(id),
      `${this.server.name} removed.`
    );
  }

  private async send(
    request: () => Promise<ApiResult<unknown>>,
    done: string
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await request();
    this.busy.set(false);
    if (!result.ok) {
      this.refusal.set(null);
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(done);
    this.ref.close(true);
  }
}
