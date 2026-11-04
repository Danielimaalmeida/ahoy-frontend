import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { map } from 'rxjs';
import type {
  BranchReleaseRepository,
  BranchReleaseRepositoryChange,
} from '@core/api/types';
import { inputsOf, inputsText, workflowFileOf } from '@domain/branch-releases';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import type { BranchReleaseSettingsStore } from './branch-release-settings-store';
import { DialogSend } from './dialog-send';

/** What the dialog is opened with: the page's store, and the row to edit or null for a new one. */
export interface BranchReleaseRepositoryData {
  readonly store: BranchReleaseSettingsStore;
  readonly repository: BranchReleaseRepository | null;
}

/** The inputs a new repository starts with: FIO's "Create Test Image & Publish to ACR", deploying to TEST. */
const STARTING_INPUTS = 'environment=test\nupdate-ops-tag=true';

/**
 * Gives a repository the `workflow_dispatch` workflow its pull request branches are released to TEST with, and the
 * inputs it is started with, or changes or removes them. The inputs are one `name=value` per line, sent as written:
 * one repository's `test` is another's `TEST`. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-branch-release-repository-dialog',
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
          : 'Give a repository its release workflow'
      "
      subtitle="Started on a work package's pull request branch from the voyage page"
      [confirmLabel]="repository ? 'Save' : 'Add repository'"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="form.invalid || inputsProblem() !== null"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        @if (!repository) {
          <ah-field
            label="Repository"
            required
            hint="owner/name, its slug, or the plan's alias."
          >
            <input
              ahInput
              mono
              formControlName="repository"
              autocomplete="off"
              maxlength="200"
              placeholder="sflp/r3da_cdm_frontend"
            />
          </ah-field>
        }
        <ah-field
          label="Workflow"
          required
          hint="A file of .github/workflows/ with a workflow_dispatch trigger."
          [errorText]="workflowProblem()"
        >
          <input
            ahInput
            mono
            formControlName="workflow"
            autocomplete="off"
            maxlength="200"
            placeholder="branch-release.yaml"
          />
        </ah-field>
        <ah-field
          label="Inputs"
          optional
          hint="One name=value per line, as the workflow names them; the case of each value is kept. true and false for a boolean."
          [errorText]="inputsProblem() ?? ''"
        >
          <textarea
            ahInput
            mono
            rows="4"
            formControlName="inputs"
            spellcheck="false"
          ></textarea>
        </ah-field>
      </form>
      @if (repository) {
        <div class="remove">
          @if (confirmingRemove()) {
            <p>
              Take {{ repository.repository }}'s release workflow away? Its work
              packages no longer offer a release.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="send.busy()"
              (click)="remove()"
            >
              Take it away
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Take the release workflow away…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class BranchReleaseRepositoryDialog {
  private readonly data = inject<BranchReleaseRepositoryData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);

  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly repository = this.data.repository;
  protected readonly form = new FormGroup({
    repository: new FormControl(this.repository?.repository ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\s*\S+\s*$/)],
    }),
    workflow: new FormControl(
      this.repository?.workflow ?? 'branch-release.yaml',
      { nonNullable: true, validators: [Validators.required] }
    ),
    inputs: new FormControl(
      this.repository ? inputsText(this.repository.inputs) : STARTING_INPUTS,
      { nonNullable: true }
    ),
  });
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  protected readonly confirmingRemove = signal(false);
  protected readonly inputsProblem = computed(() => {
    const read = inputsOf(this.value().inputs);
    return 'problem' in read ? read.problem : null;
  });
  protected readonly workflowProblem = computed(() =>
    workflowFileOf(this.value().workflow) === undefined
      ? 'A file name such as branch-release.yaml.'
      : ''
  );

  /** Adds or saves the repository and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    const workflow = workflowFileOf(value.workflow);
    const read = inputsOf(value.inputs);
    if (this.form.invalid || workflow === undefined || 'problem' in read)
      return;
    const inputs = { ...read.inputs };
    if (this.repository === null) {
      const repository = value.repository.trim();
      await this.send.run(
        () => this.data.store.addRepository({ repository, workflow, inputs }),
        `${repository} releases its branches with ${workflow}.`
      );
      return;
    }
    const current = this.repository;
    const inputsChanged = inputsText(inputs) !== inputsText(current.inputs);
    const change: BranchReleaseRepositoryChange = {
      version: current.version,
      ...(workflow !== current.workflow ? { workflow } : {}),
      ...(inputsChanged ? { inputs } : {}),
    };
    if (Object.keys(change).length === 1) {
      this.ref.close(false);
      return;
    }
    await this.send.run(
      () => this.data.store.updateRepository(current.id, change),
      `${current.repository} saved.`
    );
  }

  /** Takes the repository's release workflow away and closes. */
  protected async remove(): Promise<void> {
    if (!this.repository) return;
    const { id, repository } = this.repository;
    await this.send.run(
      () => this.data.store.removeRepository(id),
      `${repository} has no release workflow now.`
    );
  }
}
