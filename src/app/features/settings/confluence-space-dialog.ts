import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  type ValidatorFn,
} from '@angular/forms';
import type { ConfluenceSettings } from '@core/api/types';
import {
  MAX_SPACE_KEY_CHARS,
  spaceKeyProblem,
} from '@domain/confluence-settings';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import type { ConfluenceSettingsStore } from './confluence-settings-store';
import { DialogSend } from './dialog-send';

/** What the space dialog is opened with: the page's store and Confluence as set. */
export interface ConfluenceSpaceData {
  readonly store: ConfluenceSettingsStore;
  readonly confluence: ConfluenceSettings;
}

/** Refuses what is not a space key, as the API does. */
const spaceKey: ValidatorFn = (control) =>
  typeof control.value === 'string' && spaceKeyProblem(control.value) !== null
    ? { spaceKey: true }
    : null;

/** Sets the space the parent page search looks in, such as PROJ. Empty searches every space the token can see. */
@Component({
  selector: 'ah-confluence-space-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="compass"
      heading="Space"
      subtitle="Where Create in Confluence looks for a parent page"
      confirmLabel="Save"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="key.invalid"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <form (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Space key"
          optional
          hint="Empty searches every space the token can see."
          [errorMessages]="{
            spaceKey: 'One word of letters, digits, _, ~ or -, such as PROJ.',
          }"
        >
          <input
            ahInput
            mono
            [formControl]="key"
            autocomplete="off"
            spellcheck="false"
            [attr.maxlength]="max"
            placeholder="PROJ"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class ConfluenceSpaceDialog {
  private readonly data = inject<ConfluenceSpaceData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly max = MAX_SPACE_KEY_CHARS;
  protected readonly key = new FormControl(
    this.data.confluence.spaceKey ?? '',
    { nonNullable: true, validators: [spaceKey] }
  );

  /** Saves the space and closes. */
  async submit(): Promise<void> {
    this.key.markAsTouched();
    if (this.key.invalid || this.send.busy()) return;
    const typed = this.key.value.trim();
    const key = typed === '' ? null : typed;
    if (key === this.data.confluence.spaceKey) {
      this.ref.close(false);
      return;
    }
    await this.send.run(
      () =>
        this.data.store.change({
          version: this.data.confluence.version,
          spaceKey: key,
        }),
      key === null
        ? 'Pages are searched in every space now.'
        : `Pages are searched in space ${key} now.`
    );
  }
}
