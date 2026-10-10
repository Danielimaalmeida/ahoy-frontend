import { diffArrays, diffLines as jsDiffLines } from 'diff';

/** Kind of a line in a diff. */
export type DiffLineKind = 'same' | 'add' | 'remove';

/** One line of a diff, without its trailing newline. */
export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

/** A run of changed lines with context around it, as the artifact diff renders it. */
export interface DiffHunk {
  /** Nearest markdown heading above the hunk; "" when there is none. */
  readonly section: string;
  /** Header for the hunk: "@@ Summary @@" (or "@@ @@" without a section). */
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Splits a change's text into lines, dropping the trailing newline. */
function splitLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Diffs two documents line by line, one entry per line, using jsdiff. */
export function diffLines(previous: string, next: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const change of jsDiffLines(previous, next)) {
    const kind: DiffLineKind = change.added
      ? 'add'
      : change.removed
        ? 'remove'
        : 'same';
    for (const text of splitLines(change.value)) lines.push({ kind, text });
  }
  return lines;
}

/** Nearest markdown heading above a position, without its `#`s; "" when there is none. */
function sectionAbove(lines: readonly DiffLine[], from: number): string {
  for (let index = from; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const match = HEADING.exec(line.text);
    if (match !== null) return (match[1] ?? '').trim();
  }
  return '';
}

/**
 * Groups a diff into hunks with up to `context` unchanged lines around each change (3 by default), merging changes
 * whose contexts touch. A hunk stays inside one markdown section: an unchanged heading ends its context and is never
 * merged across, so each header names the section its changes are in ("@@ Summary @@", "@@ Acceptance criteria @@").
 */
export function hunks(lines: readonly DiffLine[], context = 3): DiffHunk[] {
  // For each line, the index of the unchanged heading that opens its section (-1 before the first one).
  const opens: number[] = [];
  let open = -1;
  lines.forEach((line, index) => {
    if (line.kind === 'same' && HEADING.test(line.text)) open = index;
    opens.push(open);
  });
  const changedIndexes = lines.flatMap((line, index) =>
    line.kind === 'same' ? [] : [index]
  );
  if (changedIndexes.length === 0) return [];
  const ranges: { start: number; end: number }[] = [];
  for (const index of changedIndexes) {
    const last = ranges[ranges.length - 1];
    if (
      last !== undefined &&
      opens[index] === opens[last.end] &&
      index - last.end <= context * 2 + 1
    )
      last.end = index;
    else ranges.push({ start: index, end: index });
  }
  return ranges.map(({ start, end }) => {
    const opening = opens[start] ?? -1;
    const from = Math.max(start - context, opening + 1);
    let to = Math.min(lines.length, end + context + 1);
    for (let index = end + 1; index < to; index += 1) {
      if (opens[index] !== opening) {
        to = index;
        break;
      }
    }
    const section = sectionAbove(lines, start);
    return {
      section,
      header: section.length > 0 ? `@@ ${section} @@` : '@@ @@',
      lines: lines.slice(from, to),
    };
  });
}

/**
 * Splits markdown into its top-level blocks: blank-line separated, with fenced code blocks kept whole. The indices
 * `changedBlocks` returns refer to this list, so the markdown renderer splits the same way.
 */
export function markdownBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = (): void => {
    const block = current.join('\n').trim();
    if (block.length > 0) blocks.push(block);
    current = [];
  };
  for (const line of markdown.split('\n')) {
    const isFence = FENCE.test(line);
    if (isFence) inFence = !inFence;
    if (!inFence && !isFence && line.trim() === '') flush();
    else current.push(line);
  }
  flush();
  return blocks;
}

/**
 * Indices into `markdownBlocks(next)` of the top-level blocks that are new or changed relative to `previous`.
 * Removed blocks no longer exist in `next`; `null` means there is no previous revision, so nothing is marked.
 */
export function changedBlocks(previous: string | null, next: string): number[] {
  if (previous === null) return [];
  const before = markdownBlocks(previous);
  const after = markdownBlocks(next);
  const changed: number[] = [];
  let index = 0;
  for (const change of diffArrays(before, after)) {
    const count = change.value.length;
    if (change.added) {
      for (let offset = 0; offset < count; offset += 1)
        changed.push(index + offset);
      index += count;
    } else if (!change.removed) {
      index += count;
    }
  }
  return changed;
}
