import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { SonarServer, SonarServerChange } from '@core/api/types';
import { tokenLabel } from '@domain/settings';
import { absoluteDay } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { Icon } from '@ui/icon/icon';
import { ToastService } from '@ui/toast/toast';
import { settingsErrorView } from './settings-errors';
import { hostOf } from './settings-url';
import type { SettingsStore } from './settings-store';

/** What the server dialog is opened with: the page's store and the server to edit, or null to add one. */
export interface SonarServerData {
  readonly store: SettingsStore;
  readonly server: SonarServer | null;
  /** Whether this would be the first server, which is then the default. */
  readonly first: boolean;
}

/** "1 repository" or "3 repositories". */
function repositories(count: number): string {
  return count === 1 ? '1 repository' : `${count} repositories`;
}

/** The dialog's subtitle when editing: whether it is the default, and how many repositories are on it. */
function subtitleOf(server: SonarServer): string {
  const on =
    server.repositoryCount === 0
      ? 'No repository on it'
      : `${repositories(server.repositoryCount)} on it`;
  return server.isDefault ? `The default server · ${on}` : on;
}

/**
 * Adds a SonarQube server or edits one: its name, host, token and whether it is the default, and removing it. The
 * token is typed once and never shown again: editing keeps it unless a new one is typed, and a new host needs it typed
 * again so the old token never goes there. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-sonar-server-dialog',
  imports: [
    Banner,
    Button,
    DialogShell,
    Field,
    FieldControl,
    Icon,
    ReactiveFormsModule,
  ],
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
    .is-default {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--surface-sunken);
    }
    .is-default ah-icon {
      flex: none;
      margin-top: 1px;
    }
    .is-default__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .is-default__title {
      font-weight: 600;
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
      [heading]="server ? 'Edit ' + server.name : 'Add a SonarQube server'"
      [subtitle]="subtitle"
      [confirmLabel]="server ? 'Save' : 'Add server'"
      busyLabel="Saving…"
      [busy]="busy()"
      [confirmDisabled]="form.invalid || needsToken()"
      [error]="error()"
      (confirm)="submit()"
    >
      @if (needsToken()) {
        <ah-banner variant="notice" heading="Type the token again">
          A new host needs its token, so the old one never goes there.
        </ah-banner>
      }
      @if (plainHttp()) {
        <ah-banner variant="notice" heading="This host is not HTTPS">
          The reconciler would send the token to it unencrypted. Use its https
          address if it has one.
        </ah-banner>
      }
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Name" required hint="How the team calls it.">
          <input
            ahInput
            formControlName="name"
            autocomplete="off"
            maxlength="100"
          />
        </ah-field>
        <ah-field label="Host" required [hint]="hostHint()">
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
          [label]="server ? 'New token' : 'Token'"
          [required]="!server || needsToken()"
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
              server ? 'Leave empty to keep ' + token(server.tokenHint) : null
            "
          />
        </ah-field>
        @if (server?.isDefault) {
          <div class="is-default">
            <ah-icon name="check" />
            <span class="is-default__text">
              <span class="is-default__title">The default server</span>
              <span class="ah-hint"
                >For every repository not listed under Repositories. To change
                it, make another server the default.</span
              >
            </span>
          </div>
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
          <span class="ah-label">Remove</span>
          @if (server.repositoryCount > 0) {
            <span class="ah-hint"
              >{{ repositoryCount }}
              {{ server.repositoryCount === 1 ? 'is' : 'are' }}
              on this server. Move or remove
              {{ server.repositoryCount === 1 ? 'it' : 'them' }} before removing
              the server.</span
            >
            <button ahButton="danger-outline" size="sm" type="button" disabled>
              Remove this server…
            </button>
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
            <span class="ah-hint"
              >No repository is listed on it. Its token is deleted with
              it.</span
            >
            <button
              ahButton="danger-outline"
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
  protected readonly token = tokenLabel;
  protected readonly subtitle = this.server
    ? subtitleOf(this.server)
    : 'CI fixes read its findings with this token';
  protected readonly repositoryCount = repositories(
    this.server?.repositoryCount ?? 0
  );
  protected readonly tokenHint =
    'A SonarQube user token that can read the projects. Stored encrypted; never shown again.' +
    (this.server
      ? ` Set by ${this.server.tokenSetByName ?? this.server.tokenSetBy} on ${absoluteDay(this.server.tokenSetAt, new Date())}.`
      : '');
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
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  /** Whether the host was changed without a new token: the old one never goes to a new host. */
  protected readonly needsToken = computed(() => {
    const value = this.value();
    return (
      this.server !== null &&
      hostOf(value.hostUrl ?? '') !== this.server.hostUrl &&
      (value.token ?? '').trim() === ''
    );
  });
  /** Whether the host is plain http, so the token would travel unencrypted. */
  protected readonly plainHttp = computed(() =>
    /^http:\/\//i.test((this.value().hostUrl ?? '').trim())
  );
  /** The host's hint: what it was when it changed, else an example. */
  protected readonly hostHint = computed(() =>
    this.server !== null &&
    hostOf(this.value().hostUrl ?? '') !== this.server.hostUrl
      ? `Was ${this.server.hostUrl}`
      : 'The address of SonarQube, such as https://sonar.example.com.'
  );
  protected readonly busy = signal(false);
  protected readonly confirmingRemove = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : settingsErrorView(failure);
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
    if (change.hostUrl !== undefined && change.token === undefined) return;
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
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(done);
    this.ref.close(true);
  }
}
