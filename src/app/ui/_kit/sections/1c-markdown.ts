import { Component } from '@angular/core';
import { changedBlocks } from '@domain/text-diff';
import { Markdown } from '@ui/markdown/markdown';

const PREVIOUS = `## Summary

Show each invoice's due date on the billing page and in the invoice list.

## Work packages

1. **WP1** · compute \`isOverdue\` in the server's timezone.
2. **WP2** · show the badge in the list.
`;

const NEXT = `## Summary

Show each invoice's due date on the billing page and in the invoice list.

## Work packages

1. **WP1** · compute \`isOverdue\` against the customer's timezone, with a clear overdue state.
2. **WP2** · show the badge in the list.

| WP  | Size | Risk |
| --- | ---- | ---- |
| WP1 | S    | Low  |
| WP2 | S    | Low  |

\`\`\`ts
const overdue = dueAt < now; // in the customer's zone
\`\`\`

> Out of scope: bulk download. See [the billing docs](https://example.com/billing).
`;

const HOSTILE = `Untrusted input stays inert:

<script>alert("script")</script>

<img src="x" onerror="alert('img')"> and ![a remote pixel](https://example.com/pixel.png)

[a javascript: link](javascript:alert(1)) · <b onclick="alert(1)">embedded HTML</b>
`;

/** Gallery: a rendered plan in the reading style with its changed blocks marked, and hostile markdown kept inert. */
@Component({
  selector: 'ah-kit-markdown',
  imports: [Markdown],
  template: `
    <div class="kit-grid-2">
      <div class="ah-panel kit-pad">
        <ah-markdown [source]="next" [changedBlocks]="changed" />
      </div>
      <div class="ah-panel kit-pad"><ah-markdown [source]="hostile" /></div>
    </div>
  `,
  styles: `
    .kit-pad {
      padding: 14px 16px;
    }
  `,
})
export class KitMarkdown {
  protected readonly next = NEXT;
  protected readonly hostile = HOSTILE;
  protected readonly changed = changedBlocks(PREVIOUS, NEXT);
}
