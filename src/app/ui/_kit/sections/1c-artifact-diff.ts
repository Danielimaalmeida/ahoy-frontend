import { Component } from '@angular/core';
import { ArtifactDiff, Mark } from '@ui/artifact-diff/artifact-diff';

/** Gallery: the ArtifactDiff preview, and `ahMark` on changed text in a rendered plan. */
@Component({
  selector: 'ah-kit-artifact-diff',
  imports: [ArtifactDiff, Mark],
  template: `
    <div class="ah-panel">
      <ah-artifact-diff
        [previous]="previous"
        [next]="next"
        [context]="1"
        label="Plan, revision 3 to 4"
      />
    </div>
    <p class="kit-flush">
      WP1 now
      <span ahMark>computes isOverdue against the customer's timezone</span>.
    </p>
  `,
  styles: `
    .kit-flush {
      margin: 0;
    }
  `,
})
export class KitArtifactDiff {
  protected readonly previous =
    "## Summary\n\nShow each invoice's due date on the billing page,\nin the server's timezone.\n";
  protected readonly next =
    "## Summary\n\nShow each invoice's due date on the billing page,\nin the customer's timezone, with a clear overdue state.\n";
}
