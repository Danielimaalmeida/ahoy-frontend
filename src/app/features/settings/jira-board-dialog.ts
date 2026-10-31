import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { JiraSettings } from '@core/api/types';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './jira-dialog-send';
import type { JiraSettingsStore } from './jira-settings-store';

/** What the board dialog is opened with: the page's store and Jira as set. */
export interface JiraBoardData {
  readonly store: JiraSettingsStore;
  readonly jira: JiraSettings;
}

/** A board id as typed: digits only, no leading zero, at most 15 so it stays a safe integer. */
const BOARD_ID = /^\s*[1-9]\d{0,14}\s*$/;

/**
 * Sets the board whose sprints the Crew page and its Teams cards follow, by its id in Jira (the number in the board's
 * address). The API looks it up, so a board the token cannot see is refused. Empty takes the board off.
 */
@Component({
  selector: 'ah-jira-board-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="compass"
      heading="Crew sprints"
      subtitle="The board whose sprints the Crew page follows"
      confirmLabel="Save"
      busyLabel="Looking it up in Jira…"
      [busy]="send.busy()"
      [confirmDisabled]="board.invalid"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <form (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Board id"
          optional
          hint="The number in the board's address (rapidView=…). Leave it empty and the Crew page has no sprints."
          [errorMessages]="{ pattern: 'A whole number, such as 87022.' }"
        >
          <input
            ahInput
            mono
            inputmode="numeric"
            [formControl]="board"
            autocomplete="off"
            maxlength="15"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class JiraBoardDialog {
  private readonly data = inject<JiraBoardData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly board = new FormControl(
    this.data.jira.board ? String(this.data.jira.board.id) : '',
    {
      nonNullable: true,
      validators: [Validators.pattern(BOARD_ID)],
    }
  );

  /** Saves the board and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.board.markAsTouched();
    if (this.board.invalid || this.send.busy()) return;
    const typed = this.board.value.trim();
    const boardId = typed === '' ? null : Number(typed);
    if (boardId === (this.data.jira.board?.id ?? null)) {
      this.ref.close(false);
      return;
    }
    await this.send.run(
      () =>
        this.data.store.change({ version: this.data.jira.version, boardId }),
      boardId === null
        ? 'The Crew page has no board now.'
        : `The crew follows board ${boardId}.`
    );
  }
}
