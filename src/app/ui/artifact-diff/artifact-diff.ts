import {
  Component,
  Directive,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import type { DiffLine } from '@domain/text-diff';
import { diffLines, hunks } from '@domain/text-diff';

/** A diff line ready to show: its kind, its line number in the revision it belongs to, and its text with a sign. */
export interface DiffRow {
  readonly kind: DiffLine['kind'];
  /** The line's number: in the previous revision for a removed line, in the next one otherwise. */
  readonly number: number;
  /** The text with its sign: "+ " added, "− " removed, nothing for context, so change never relies on colour. */
  readonly display: string;
}

/** A hunk ready to show. */
export interface DiffBlock {
  readonly header: string;
  readonly rows: readonly DiffRow[];
}

const SIGNS: Readonly<Record<DiffLine['kind'], string>> = {
  add: '+ ',
  remove: '− ',
  same: '',
};

/**
 * Diffs two revisions of an artifact into hunks (the domain's `diffLines` and `hunks`), numbering each line in the
 * revision it belongs to.
 */
export function diffBlocks(
  previous: string,
  next: string,
  context = 3
): DiffBlock[] {
  const lines = diffLines(previous, next);
  const numbers = new Map<DiffLine, number>();
  let before = 0;
  let after = 0;
  for (const line of lines) {
    if (line.kind !== 'add') before += 1;
    if (line.kind !== 'remove') after += 1;
    numbers.set(line, line.kind === 'remove' ? before : after);
  }
  return hunks(lines, context).map((hunk) => ({
    header: hunk.header,
    rows: hunk.lines.map((line) => ({
      kind: line.kind,
      number: numbers.get(line) ?? 0,
      display: SIGNS[line.kind] + line.text,
    })),
  }));
}

/**
 * A line diff between two revisions of a story artifact (plan, snapshot, state): hunk headers name the markdown
 * section, added and removed lines use the `diff-add-*` / `diff-del-*` colours and keep a + or − sign.
 *
 * ```html
 * <ah-artifact-diff [previous]="r3" [next]="r4" label="Plan, revision 3 to 4" />
 * ```
 */
@Component({
  selector: 'ah-artifact-diff',
  styles: `
    :host {
      display: block;
    }
    .ah-diff {
      padding: var(--space-2) 0;
    }
    .ah-artifact-diff__empty {
      margin: 0;
      padding: var(--space-3) var(--space-4);
    }
  `,
  template: `
    @if (blocks().length === 0) {
      <p class="ah-artifact-diff__empty ah-hint">
        No changes between these revisions.
      </p>
    } @else {
      <div class="ah-diff" role="group" [attr.aria-label]="label() || null">
        @for (block of blocks(); track $index) {
          <div class="ah-diff__hunk">{{ block.header }}</div>
          @for (row of block.rows; track $index) {
            <div
              [class.ah-diff__add]="row.kind === 'add'"
              [class.ah-diff__del]="row.kind === 'remove'"
            >
              <span class="ah-diff__ln">{{ row.number }}</span
              ><span>{{ row.display }}</span>
            </div>
          }
        }
      </div>
    }
  `,
})
export class ArtifactDiff {
  /** The older revision's text. */
  readonly previous = input.required<string>();
  /** The newer revision's text. */
  readonly next = input.required<string>();
  /** Unchanged lines kept around each change. */
  readonly context = input(3);
  /** The diff's accessible name ("Plan, revision 3 to 4"). */
  readonly label = input('');

  protected readonly blocks = computed(() =>
    diffBlocks(this.previous(), this.next(), this.context())
  );
}

/**
 * Marks text that changed since the last revision with `ah-mark` (the highlight). `<span ahMark>…</span>`, or
 * `[ahMark]="changed"` to switch it.
 */
@Directive({
  selector: '[ahMark]',
  host: { '[class.ah-mark]': 'on()' },
})
export class Mark {
  /** Whether the text is marked; a bare `ahMark` marks it. */
  readonly on = input(true, {
    alias: 'ahMark',
    transform: (v: unknown) => v === '' || booleanAttribute(v),
  });
}
