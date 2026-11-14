import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { DialogShell } from '@ui/dialog/dialog';
import { conversationErrorView } from './product-errors';
import type { ProductStore } from './product-store';

/** What the Delete conversation dialog is opened with: the page's store, whose open conversation it deletes. */
export interface DeleteConversationData {
  readonly store: ProductStore;
}

/**
 * "Delete this conversation?": its questions, answers and proposals go; a session still running stops first, and
 * what it spent stays counted. Closes with true once deleted.
 */
@Component({
  selector: 'ah-delete-conversation-dialog',
  imports: [DialogShell],
  template: `
    <ah-dialog
      kind="danger"
      heading="Delete this conversation?"
      [subtitle]="title"
      confirmLabel="Delete"
      busyLabel="Deleting…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Its questions, answers and proposals are deleted for everyone it is
        shared with. A session still running stops; what it spent stays
        counted.</span
      >
    </ah-dialog>
  `,
})
export class DeleteConversationDialog {
  private readonly store = inject<DeleteConversationData>(DIALOG_DATA).store;
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly title = this.store.conversation()?.title ?? '';
  protected readonly busy = this.store.busy;
  private readonly failed = signal(false);
  protected readonly error = computed(() => {
    const error = this.store.commandError();
    return this.failed() && error !== null
      ? conversationErrorView(error)
      : null;
  });

  /** Deletes it and closes. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    this.failed.set(false);
    const result = await this.store.remove();
    if (result.ok) this.ref.close(true);
    else this.failed.set(true);
  }
}
