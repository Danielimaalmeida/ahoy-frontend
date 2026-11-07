import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import {
  JIRA_ISSUE_TYPES,
  type JiraIssueType,
  type Meeting,
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

/**
 * What the Jira target dialog is opened with: the page's store and what to change, a series or a one-off meeting (whose
 * stories go to a target of its own).
 */
export type SeriesJiraData =
  | { readonly store: MeetingsStore; readonly series: MeetingSeries }
  | { readonly store: MeetingsStore; readonly meeting: Meeting };

/** Refuses a typed key Jira would not have; an empty one is fine (it turns creating off). */
function projectKeyValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const key = normaliseProjectKey(control.value);
  return key === '' || isProjectKey(key) ? null : { projectKey: true };
}

/**
 * "Where do Finance sync's stories go?": the Jira project and issue type every story drafted from the series' meetings
 * is created as, or, for a one-off meeting, from that meeting's topics. Set once per series or meeting, also after a
 * one-off meeting ended; an empty project turns creating off. Closes with the changed series or meeting.
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
        >Stories drafted from this {{ what }} are created in this Jira project,
        as this type of issue. Leave the project empty to stop creating
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
  private readonly ref = inject<DialogRef<MeetingSeries | Meeting>>(DialogRef);
  private readonly toasts = inject(ToastService);

  private readonly current =
    'series' in this.data
      ? {
          name: this.data.series.name,
          projectKey: this.data.series.jiraProjectKey,
          issueType: this.data.series.jiraIssueType,
        }
      : {
          name: this.data.meeting.title,
          projectKey: this.data.meeting.jiraProjectKey,
          issueType: this.data.meeting.jiraIssueType ?? ('Story' as const),
        };
  protected readonly name = this.current.name;
  /** What the stories are drafted from, for the lead. */
  protected readonly what =
    'series' in this.data ? "series' meetings" : 'meeting';
  protected readonly types = JIRA_ISSUE_TYPES;
  protected readonly max = PROJECT_KEY_MAX;
  protected readonly messages: Readonly<Record<string, string>> = {
    projectKey:
      'A project key: a capital letter, then capitals, digits or _ (such as FIN).',
  };
  protected readonly form = new FormGroup({
    projectKey: new FormControl(this.current.projectKey ?? '', {
      nonNullable: true,
      validators: [projectKeyValidator],
    }),
    issueType: new FormControl<JiraIssueType>(this.current.issueType, {
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
    const project = key === '' ? null : key;
    const type = this.form.controls.issueType.value;
    const result =
      'series' in this.data
        ? await this.data.store.setSeriesTarget(
            this.data.series.id,
            project,
            type
          )
        : await this.data.store.setMeetingTarget(
            this.data.meeting.id,
            project,
            type
          );
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(
      key === ''
        ? `${this.name}'s stories are no longer created in Jira.`
        : `${this.name}'s stories go to ${key} as ${type}.`
    );
    this.ref.close(result.value);
  }
}
