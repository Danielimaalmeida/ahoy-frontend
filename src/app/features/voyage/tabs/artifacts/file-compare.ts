import type { ApiError } from "@core/api/api-error";
import { diffLines } from "@domain/text-diff";
import { displayText, fileKind, isTooLarge, textBytes } from "./artifact-files";
import type { ArtifactReader } from "./artifact-reader";

/** How one file differs between two revisions of the artifact set. */
export type FileChange =
  | { readonly kind: "same" }
  /** It is in the second revision and was not in the first. */
  | { readonly kind: "new" }
  /** It was in the first revision and is not in the second. */
  | { readonly kind: "removed" }
  /** The line counts and the two texts as shown (JSON re-indented). */
  | {
      readonly kind: "changed";
      readonly added: number;
      readonly removed: number;
      readonly previous: string;
      readonly next: string;
    }
  /** In neither revision. */
  | { readonly kind: "missing" }
  | { readonly kind: "too_large" }
  | { readonly kind: "error"; readonly error: ApiError };

/** What a file's row shows next to its path while the comparison runs, and after. */
export type FileState = { readonly kind: "loading" } | FileChange;

const MINUS = "\u2212";

/** The status a row shows: `same`, `+9 −3`, `+2`, `new`, `removed`, `changed` (JSON), "too large". */
export function statusLabel(state: FileState | undefined, path: string): string {
  if (state === undefined || state.kind === "loading") return "…";
  switch (state.kind) {
    case "same":
      return "same";
    case "new":
      return "new";
    case "removed":
      return "removed";
    case "missing":
      return "—";
    case "too_large":
      return "too large";
    case "error":
      return "error";
    case "changed": {
      if (fileKind(path) === "json") return "changed";
      const parts = [state.added > 0 ? `+${state.added}` : "", state.removed > 0 ? `${MINUS}${state.removed}` : ""];
      return parts.filter((part) => part !== "").join(" ");
    }
  }
}

/** The lines added and removed between two texts, from the domain's diff. */
function countLines(previous: string, next: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diffLines(previous, next)) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "remove") removed += 1;
  }
  return { added, removed };
}

/**
 * How `path` at revision `target` differs from the same file at `base` (plan, lane 5C). It asks as little as it can: when
 * the target's ETag is known (the current set lists them all) it asks the base revision with that ETag as
 * `If-None-Match`, so an unchanged file answers `304` with no text and a file that was not there answers `404`. Only a
 * file that did change is read in full, from both revisions. Everything goes through the reader, so asking again, or
 * asking for the file's text afterwards, repeats nothing.
 */
export async function compareFile(
  reader: ArtifactReader,
  key: string,
  path: string,
  base: number,
  target: number,
): Promise<FileChange> {
  let etag = reader.etag(key, path, target);
  if (etag === null) {
    const first = await reader.text(key, path, target);
    if (first.kind === "error") return first;
    if (first.kind === "absent") {
      const before = await reader.text(key, path, base);
      if (before.kind === "error") return before;
      return before.kind === "absent" ? { kind: "missing" } : { kind: "removed" };
    }
    etag = first.etag;
  }
  if (etag !== null) {
    const match = await reader.sameness(key, path, base, etag);
    if (match.kind === "error") return match;
    if (match.kind === "same") return { kind: "same" };
    if (match.kind === "absent") return { kind: "new" };
  }
  const [before, after] = await Promise.all([reader.text(key, path, base), reader.text(key, path, target)]);
  if (before.kind === "error") return before;
  if (after.kind === "error") return after;
  if (after.kind === "absent") return before.kind === "absent" ? { kind: "missing" } : { kind: "removed" };
  if (before.kind === "absent") return { kind: "new" };
  if (isTooLarge(textBytes(before.text)) || isTooLarge(textBytes(after.text))) return { kind: "too_large" };
  const kind = fileKind(path);
  const previous = displayText(kind, before.text);
  const next = displayText(kind, after.text);
  const { added, removed } = countLines(previous, next);
  if (added === 0 && removed === 0) return { kind: "same" };
  return { kind: "changed", added, removed, previous, next };
}
