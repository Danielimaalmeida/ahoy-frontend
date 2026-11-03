import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { DialogShell } from '@ui/dialog/dialog';

/**
 * Asks once before saving a change that turns Ahoy's replies on: from then on the reconciler posts them on the pull
 * requests people commented on, under its own GitHub login. Closes with true when the admin confirms; the page then
 * saves with `confirmReplies`.
 */
@Component({
  selector: 'ah-pr-replies-dialog',
  imports: [DialogShell],
  styles: `
    p {
      margin: 0 0 10px;
    }
    ul {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
  template: `
    <ah-dialog
      icon="bell"
      heading="Turn replies on?"
      subtitle="Ahoy then posts on your colleagues' pull requests"
      confirmLabel="Turn on and save"
      (confirm)="ref.close(true)"
    >
      <p>Once on, for every voyage of the team:</p>
      <ul>
        <li>
          The replies waiting in Ahoy are posted, and every later one once the
          review has ruled: "not changing this" with the reason, or "fixed in"
          the commit once the re-review judged the fix.
        </li>
        <li>
          A fixed thread is resolved. Each reply starts with "Ahoy:" and
          mentions no one.
        </li>
        <li>Turning replies off again stops posting; nothing is taken back.</li>
      </ul>
    </ah-dialog>
  `,
})
export class PrRepliesDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
