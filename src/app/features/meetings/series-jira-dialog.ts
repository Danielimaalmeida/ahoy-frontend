import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import {
  JIRA_ISSUE_TYPES,
  type JiraIssueType,
  type MeetingSeries,
} from '@core/api/types';
import {
  isProjectKey,
  normaliseProjectKey,
  PROJECT_KEY_MAX,
} from '@domain/story-drafts';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import type { MeetingsStore } from './meetings-store';
import { storyErrorView } from './story-errors';

/** What the Jira target dialog is opened with: the page's store and the series to change. */
export interface SeriesJiraData {
  readonly store: MeetingsStore;
  readonly series: MeetingSeries;
}

/** Refuses a typed key Jira would not have; an empty one is fine (it turns creating off). */
function projectKeyValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const key = normaliseProjectKey(control.value);
  return key === '' || isProjectKey(key) ? null : { projectKey: true };
}

/**
 * "Where do Finance sync's stories go?": the Jira project and issue type every story drafted from the series' meetings
 * is created as. Set once per series; an empty project turns creating off. Closes with the changed series.
 */
@Component({
  selector: 'ah-series-jira-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      [heading]="'Where do ' + name + '’s stories go?'"
      confirmLabel="Save"
      busyLabel="Saving…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Stories drafted from this series' meetings are created in this Jira
        project, as this type of issue. Leave the project empty to stop creating
        them.</span
      >
      <form
        class="row"
        [formGroup]="form"
        (submit)="$event.preventDefault(); submit()"
      >
        <ah-field
          label="Jira project"
          optional
          hint="Its key, such as FIN."
          [errorMessages]="messages"
        >
          <input
            ahInput
            formControlName="projectKey"
            autocomplete="off"
            [maxlength]="max"
          />
        </ah-field>
        <ah-field label="Issue type">
          <select ahInput formControlName="issueType">
            @for (type of types; track type) {
              <option [value]="type">{{ type }}</option>
            }
          </select>
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class SeriesJiraDialog {
  private readonly data = inject<SeriesJiraData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<MeetingSeries>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly name = this.data.series.name;
  protected readonly types = JIRA_ISSUE_TYPES;
  protected readonly max = PROJECT_KEY_MAX;
  protected readonly messages: Readonly<Record<string, string>> = {
    projectKey:
      'A project key: a capital letter, then capitals, digits or _ (such as FIN).',
  };
  protected readonly form = new FormGroup({
    projectKey: new FormControl(this.data.series.jiraProjectKey ?? '', {
      nonNullable: true,
      validators: [projectKeyValidator],
    }),
    issueType: new FormControl<JiraIssueType>(this.data.series.jiraIssueType, {
      nonNullable: true,
    }),
  });
  protected readonly busy = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : storyErrorView(failure, 'target');
  });

  /** Saves the target and closes with the changed series; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const key = normaliseProjectKey(this.form.controls.projectKey.value);
    this.busy.set(true);
    const result = await this.data.store.setSeriesTarget(
      this.data.series.id,
      key === '' ? null : key,
      this.form.controls.issueType.value
    );
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(
      key === ''
        ? `${this.name}'s stories are no longer created in Jira.`
        : `${this.name}'s stories go to ${key} as ${result.value.jiraIssueType}.`
    );
    this.ref.close(result.value);
  }
}
