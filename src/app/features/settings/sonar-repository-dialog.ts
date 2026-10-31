import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  SonarRepository,
  SonarRepositoryChange,
  SonarServer,
} from '@core/api/types';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { settingsErrorView } from './settings-errors';
import type { SettingsStore } from './settings-store';

/** What the repository dialog is opened with: the page's store, the servers to pick from, and the row to edit or null. */
export interface SonarRepositoryData {
  readonly store: SettingsStore;
  readonly servers: readonly SonarServer[];
  readonly repository: SonarRepository | null;
}

/**
 * Puts a repository on a SonarQube server, or moves one, sets its project key or takes it off. The repository is named
 * once, as the plan names it; an empty project key lets the reconciler find it. Closes with true once something was
 * saved.
 */
@Component({
  selector: 'ah-sonar-repository-dialog',
  imports: [Button, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .remove {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
  `,
  template: `
    <ah-dialog
      icon="tool"
      [heading]="
        repository
          ? 'Edit ' + repository.repository
          : 'Put a repository on a server'
      "
      [confirmLabel]="repository ? 'Save' : 'Add repository'"
      busyLabel="Saving…"
      [busy]="busy()"
      [confirmDisabled]="form.invalid"
      [error]="error()"
      (confirm)="submit()"
    >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        @if (!repository) {
          <ah-field
            label="Repository"
            required
            hint="As the plan names it: owner/name or its slug."
          >
            <input
              ahInput
              mono
              formControlName="repository"
              autocomplete="off"
              maxlength="200"
            />
          </ah-field>
        }
        <ah-field label="Server" required>
          <select ahInput formControlName="serverId">
            @for (s of servers; track s.id) {
              <option [value]="s.id">
                {{ s.name }}{{ s.isDefault ? ' (default)' : '' }}
              </option>
            }
          </select>
        </ah-field>
        <ah-field
          label="Project key"
          optional
          hint="Leave it empty and the reconciler finds it from the failing check or sonar-project.properties."
        >
          <input
            ahInput
            mono
            formControlName="projectKey"
            autocomplete="off"
            maxlength="400"
          />
        </ah-field>
      </form>
      @if (repository) {
        <div class="remove">
          @if (confirmingRemove()) {
            <p>
              Take {{ repository.repository }} off its server? It goes back to
              the default server.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="busy()"
              (click)="remove()"
            >
              Take it off
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Take it off its server…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class SonarRepositoryDialog {
  private readonly data = inject<SonarRepositoryData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly repository = this.data.repository;
  protected readonly servers = this.data.servers;
  protected readonly form = new FormGroup({
    repository: new FormControl(this.repository?.repository ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\s*\S+\s*$/)],
    }),
    serverId: new FormControl(
      this.repository?.serverId ??
        (this.servers.find((s) => s.isDefault) ?? this.servers[0])?.id ??
        '',
      { nonNullable: true, validators: [Validators.required] }
    ),
    projectKey: new FormControl(this.repository?.projectKey ?? '', {
      nonNullable: true,
      validators: [Validators.pattern(/^\s*\S*\s*$/)],
    }),
  });
  protected readonly busy = signal(false);
  protected readonly confirmingRemove = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : settingsErrorView(failure);
  });

  /** Adds or saves the repository and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();
    const key = value.projectKey.trim();
    const projectKey = key === '' ? null : key;
    if (this.repository === null) {
      const repository = value.repository.trim();
      await this.send(
        () =>
          this.data.store.addRepository({
            repository,
            serverId: value.serverId,
            projectKey,
          }),
        `${repository} is on ${this.data.store.serverName(value.serverId)}.`
      );
      return;
    }
    const current = this.repository;
    const change: SonarRepositoryChange = {
      version: current.version,
      ...(value.serverId !== current.serverId
        ? { serverId: value.serverId }
        : {}),
      ...(projectKey !== current.projectKey ? { projectKey } : {}),
    };
    if (Object.keys(change).length === 1) {
      this.ref.close(false);
      return;
    }
    await this.send(
      () => this.data.store.updateRepository(current.id, change),
      `${current.repository} saved.`
    );
  }

  /** Takes the repository off its server and closes. */
  protected async remove(): Promise<void> {
    if (!this.repository) return;
    const { id, repository } = this.repository;
    await this.send(
      () => this.data.store.removeRepository(id),
      `${repository} is back on the default server.`
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
