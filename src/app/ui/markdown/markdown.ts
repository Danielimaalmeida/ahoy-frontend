import { Component, ViewEncapsulation, computed, input } from "@angular/core";
import { renderMarkdown } from "./render-markdown";

/**
 * Agent markdown (plans, snapshots) in the `reading` type style: 13.5/22, lines near 75 characters. The source is
 * untrusted: `renderMarkdown` escapes raw HTML, drops images and keeps only `http(s)`/`mailto` links, and Angular
 * sanitizes the result again on `[innerHTML]`. Never `bypassSecurityTrust*`.
 *
 * ```html
 * <ah-markdown [source]="plan" [changedBlocks]="changed" />
 * ```
 */
@Component({
  selector: "ah-markdown",
  // The rendered HTML carries no Angular attributes, so these rules can't be scoped; every one sits under
  // `.ah-markdown`. The bundle has no styles for rendered markdown (the `reading` token exists only in tokens.json).
  encapsulation: ViewEncapsulation.None,
  styles: `
    .ah-markdown {
      display: block;
      max-width: 75ch;
      font-size: 13.5px;
      line-height: 22px;
      overflow-wrap: anywhere;
    }
    .ah-markdown > :first-child,
    .ah-markdown .ah-mark > :first-child {
      margin-top: 0;
    }
    .ah-markdown p,
    .ah-markdown ul,
    .ah-markdown ol,
    .ah-markdown pre,
    .ah-markdown table,
    .ah-markdown blockquote {
      margin: 0 0 var(--space-2);
    }
    .ah-markdown h1,
    .ah-markdown h2,
    .ah-markdown h3,
    .ah-markdown h4,
    .ah-markdown h5,
    .ah-markdown h6 {
      margin: var(--space-4) 0 var(--space-1\\.5);
      font-size: 14px;
      line-height: 20px;
      font-weight: 700;
    }
    .ah-markdown h1,
    .ah-markdown h2 {
      font-size: 15px;
    }
    .ah-markdown ul,
    .ah-markdown ol {
      padding-left: 20px;
    }
    .ah-markdown li {
      margin: 2px 0;
    }
    .ah-markdown code {
      font-family: var(--font-mono);
      font-size: 12px;
      background: var(--surface-sunken);
      border-radius: var(--radius-xs);
      padding: 1px 5px;
    }
    .ah-markdown pre {
      overflow-x: auto;
      padding: var(--space-2\\.5) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
      line-height: 1.6;
    }
    .ah-markdown pre code {
      padding: 0;
      background: none;
    }
    .ah-markdown table {
      display: block;
      overflow-x: auto;
      border-collapse: collapse;
      font-size: 13px;
    }
    .ah-markdown th,
    .ah-markdown td {
      padding: 5px 10px;
      border: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    .ah-markdown th {
      background: var(--surface-raised);
    }
    .ah-markdown blockquote {
      padding-left: var(--space-3);
      border-left: 3px solid var(--line);
      color: var(--ink-muted);
    }
    .ah-markdown hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: var(--space-3) 0;
    }
    .ah-markdown div.ah-mark {
      margin: 0 0 var(--space-2);
      padding: 2px 6px;
    }
    .ah-markdown div.ah-mark > :last-child {
      margin-bottom: 0;
    }
    .ah-markdown__image,
    .ah-markdown__task {
      color: var(--ink-muted);
    }
  `,
  host: { class: "ah-markdown", "[innerHTML]": "html()" },
  template: "",
})
export class Markdown {
  /** The markdown, as the agent wrote it. */
  readonly source = input("");
  /** Top-level blocks to mark as changed (indices into the domain's `markdownBlocks(source)`). */
  readonly changedBlocks = input<readonly number[]>([]);

  protected readonly html = computed(() => renderMarkdown(this.source(), { changedBlocks: this.changedBlocks() }));
}
