import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import type { JiraSettings } from '@core/api/types';
import {
  hasControlCharacter,
  MAX_SUMMARY_PREFIX_CHARS,
  prefixExample,
} from '@domain/jira-settings';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './jira-dialog-send';
import type { JiraSettingsStore } from './jira-settings-store';

/** What the prefix dialog is opened with: the page's store and Jira as set. */
export interface JiraPrefixData {
  readonly store: JiraSettingsStore;
  readonly jira: JiraSettings;
}

/** Refuses a prefix with a control character (a tab, a line break), as the API does. */
const oneLine: ValidatorFn = (control) =>
  typeof control.value === 'string' && hasControlCharacter(control.value)
    ? { control: true }
    : null;

/**
 * Sets the text every story created from a meeting starts its summary with, such as "[PROJ] ". It is kept as typed,
 * with its trailing space, since the summary follows it directly. Empty means no prefix.
 */
@Component({
  selector: 'ah-jira-prefix-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="message"
      heading="Summary prefix"
      subtitle="Every story created from a meeting starts with it"
      confirmLabel="Save"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="prefix.invalid"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <form (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Prefix"
          optional
          [hint]="example()"
          [errorMessages]="{
            control: 'One line, without tabs or other control characters.',
            maxlength: 'At most ' + max + ' characters.',
          }"
        >
          <input
            ahInput
            mono
            [formControl]="prefix"
            autocomplete="off"
            [attr.maxlength]="max"
            placeholder="[PROJ] "
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class JiraPrefixDialog {
  private readonly data = inject<JiraPrefixData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly max = MAX_SUMMARY_PREFIX_CHARS;
  protected readonly prefix = new FormControl(
    this.data.jira.storySummaryPrefix,
    {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_SUMMARY_PREFIX_CHARS), oneLine],
    }
  );
  private readonly typed = toSignal(this.prefix.valueChanges, {
    initialValue: this.prefix.value,
  });
  protected readonly example = computed(() => prefixExample(this.typed()));

  /** Saves the prefix as typed and closes. */
  async submit(): Promise<void> {
    this.prefix.markAsTouched();
    if (this.prefix.invalid || this.send.busy()) return;
    const storySummaryPrefix = this.prefix.value;
    if (storySummaryPrefix === this.data.jira.storySummaryPrefix) {
      this.ref.close(false);
      return;
    }
    await this.send.run(
      () =>
        this.data.store.change({
          version: this.data.jira.version,
          storySummaryPrefix,
        }),
      storySummaryPrefix === ''
        ? 'Stories have no prefix now.'
        : 'Summary prefix saved.'
    );
  }
}
