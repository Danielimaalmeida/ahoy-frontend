import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import type { ApiError } from "@core/api/api-error";
import type { Artifact } from "@core/api/types";
import { VoyageContext } from "../../context/voyage-context";
import { displayText, fileKind, isTooLarge, textBytes, type FileKind } from "./artifact-files";
import { ARTIFACT_READER, etagFor } from "./artifact-reader";
import { compareFile, type FileChange, type FileState } from "./file-compare";
import { revisionOptions } from "./revision-labels";
import { adjust, readSelection, selectionParams, type Selection } from "./selection";

/** What the right-hand pane shows for the open file. */
export type Detail =
  | { readonly kind: "loading" }
  /** View: the file's text. */
  | { readonly kind: "text"; readonly fileKind: FileKind; readonly text: string }
  /** Compare: the two texts, and how the file changed. */
  | {
      readonly kind: "diff";
      readonly change: "changed" | "new" | "removed";
      readonly previous: string;
      readonly next: string;
    }
  | { readonly kind: "same" }
  /** View: not in that revision. Compare: in neither. */
  | { readonly kind: "absent" }
  | { readonly kind: "too_large"; readonly bytes: number | null }
  | { readonly kind: "error"; readonly error: ApiError };

/** What a comparison of the whole set depends on; two equal jobs are one job. */
interface SetJob {
  readonly key: string;
  readonly base: number;
  readonly target: number;
  /** The revision `items` belong to. */
  readonly revision: number;
  readonly items: readonly Artifact[];
  /** Every path to compare: the current listing plus those seen at older revisions. */
  readonly paths: readonly string[];
  readonly attempt: number;
}

/** What the open file depends on. */
interface FileJob extends Selection {
  readonly key: string;
  readonly revision: number;
  readonly item: Artifact | null;
  readonly attempt: number;
}

function sameItems(a: readonly Artifact[], b: readonly Artifact[]): boolean {
  return a.length === b.length && a.every((item, i) => item.path === b[i]?.path && item.sha256 === b[i]?.sha256);
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((path, i) => path === b[i]);
}

function sameSetJob(a: SetJob | null, b: SetJob | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.key === b.key &&
    a.base === b.base &&
    a.target === b.target &&
    a.revision === b.revision &&
    a.attempt === b.attempt &&
    sameItems(a.items, b.items) &&
    sameStrings(a.paths, b.paths)
  );
}

function sameFileJob(a: FileJob | null, b: FileJob | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.key === b.key &&
    a.mode === b.mode &&
    a.path === b.path &&
    a.base === b.base &&
    a.target === b.target &&
    a.revision === b.revision &&
    a.attempt === b.attempt &&
    a.item?.sha256 === b.item?.sha256
  );
}

/**
 * What the Artifacts tab shows (plan, lane 5C): the voyage's current file set and every path seen at an older revision,
 * the revisions to choose from, the file and revisions the URL asks for, the status of every file against the comparison
 * revision, and the open file. The URL is the state (`?compare=`, `?to=`, `?file=`, `?mode=`), so a link opens the same
 * view. Files of other revisions are read only when the page needs them, through the `ArtifactReader`, which remembers
 * them. Read-only: it never writes.
 */
@Injectable()
export class ArtifactsView {
  private readonly context = inject(VoyageContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reader = inject(ARTIFACT_READER);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly attempt = signal(0);
  private readonly changesSignal = signal<ReadonlyMap<string, FileState>>(new Map());
  private readonly detailSignal = signal<Detail>({ kind: "loading" });
  private setRuns = 0;
  private fileRuns = 0;

  readonly key = this.context.key;

  /** The current artifact set, as `listArtifacts` gives it; null until it is read. */
  readonly listing = computed(() => this.context.handle()?.artifacts.value() ?? null);

  /** `loading` until the list is read, `error` when it could not be and nothing is held, else `ready`. */
  readonly status = computed<"loading" | "error" | "ready">(() => {
    const resource = this.context.handle()?.artifacts;
    if (resource === undefined) return "loading";
    if (resource.value() !== undefined) return "ready";
    return resource.status() === "error" ? "error" : "loading";
  });

  /** Why the list could not be read. */
  readonly error = computed(() => this.context.handle()?.artifacts.error() ?? null);

  /** The current revision of the set; 0 before the first. */
  readonly current = computed(() => this.listing()?.revision ?? 0);

  /** The files of the current revision: the paths this tab knows to ask for. */
  readonly items = computed<readonly Artifact[]>(() => this.listing()?.items ?? []);

  /**
   * The paths the voyage has shown or read at any revision (the current listing plus what the reader has seen): a file
   * removed by a later revision stays known, so it can still be listed and compared as `removed`.
   */
  readonly paths = computed<readonly string[]>(() => {
    const key = this.key();
    if (key === null) return [];
    const seen = [...this.reader.paths(key)];
    for (const item of this.items()) {
      if (!seen.includes(item.path)) seen.push(item.path);
    }
    return seen;
  });

  /** Revisions 1 to current, newest first, each labelled from the voyage's events. */
  readonly options = computed(() => revisionOptions(this.context.events(), this.current()));

  readonly selection = computed(() => readSelection(this.params(), this.current(), this.paths()));

  /** How each file differs from the comparison revision (Compare only). */
  readonly changes = this.changesSignal.asReadonly();

  /** The open file's pane. */
  readonly detail = this.detailSignal.asReadonly();

  private readonly setJob = computed<SetJob | null>(
    () => {
      const key = this.key();
      const listing = this.listing();
      const selection = this.selection();
      if (key === null || listing === null || selection.mode !== "compare" || selection.base === null) return null;
      return {
        key,
        base: selection.base,
        target: selection.target,
        revision: listing.revision,
        items: listing.items,
        paths: this.paths(),
        attempt: this.attempt(),
      };
    },
    { equal: sameSetJob },
  );

  private readonly fileJob = computed<FileJob | null>(
    () => {
      const key = this.key();
      const listing = this.listing();
      const selection = this.selection();
      if (key === null || listing === null || selection.path === null) return null;
      const item = listing.items.find((candidate) => candidate.path === selection.path) ?? null;
      return { ...selection, key, revision: listing.revision, item, attempt: this.attempt() };
    },
    { equal: sameFileJob },
  );

  constructor() {
    effect(() => this.context.handle()?.watch("artifacts"));
    // Every listing observed teaches the reader its paths (and ETags), in View as well as in Compare, so a file a later
    // revision drops stays known. No content is read here.
    effect(() => {
      const key = this.key();
      const listing = this.listing();
      if (key === null || listing === null) return;
      untracked(() => this.seed(key, listing.revision, listing.items));
    });
    effect(() => {
      const job = this.setJob();
      untracked(() => this.compareSet(job));
    });
    effect(() => {
      const job = this.fileJob();
      untracked(() => void this.openFile(job));
    });
  }

  /**
   * How the viewer, the diff and the row status treat `path`: by its extension, then by the media type the current
   * listing gives it. One answer everywhere, so a JSON file the listing types is re-indented in Compare as in View.
   */
  kindOf(path: string): FileKind {
    return fileKind(path, this.items().find((item) => item.path === path)?.mediaType ?? null);
  }

  /** Reads the list, or the files, again after a failure. */
  retry(): void {
    if (this.status() === "error") void this.context.handle()?.artifacts.refresh();
    else this.attempt.update((n) => n + 1);
  }

  /** Goes to the view the patch asks for. The URL changes; the rest follows it. */
  go(patch: Partial<Selection>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: this.queryFor(patch) });
  }

  /** The query string of the view `patch` asks for, for a link. */
  queryFor(patch: Partial<Selection>): Record<string, string> {
    return selectionParams(adjust(this.selection(), patch), this.current(), this.paths());
  }

  /** Tells the reader the ETags the current listing carries, so asking another revision can send them. */
  private seed(key: string, revision: number, items: readonly Artifact[]): void {
    for (const item of items) this.reader.learn(key, item.path, revision, etagFor(item.sha256));
  }

  private compareSet(job: SetJob | null): void {
    const run = ++this.setRuns;
    if (job === null) {
      this.changesSignal.set(new Map());
      return;
    }
    this.seed(job.key, job.revision, job.items);
    this.changesSignal.set(new Map(job.paths.map((path): [string, FileState] => [path, { kind: "loading" }])));
    for (const path of job.paths) {
      void this.changeOf(job.key, path, job.items, job.base, job.target, job.revision).then((change) => {
        if (run === this.setRuns) this.changesSignal.update((all) => new Map(all).set(path, change));
      });
    }
  }

  /** How one file differs; one too large to preview is not asked for at all. */
  private changeOf(
    key: string,
    path: string,
    items: readonly Artifact[],
    base: number,
    target: number,
    revision: number,
  ): Promise<FileChange> {
    const item = items.find((candidate) => candidate.path === path);
    if (item !== undefined && target === revision && isTooLarge(item.sizeBytes)) {
      return Promise.resolve({ kind: "too_large" });
    }
    return compareFile(this.reader, key, path, base, target, fileKind(path, item?.mediaType ?? null));
  }

  private async openFile(job: FileJob | null): Promise<void> {
    const run = ++this.fileRuns;
    const show = (detail: Detail): void => {
      if (run === this.fileRuns) this.detailSignal.set(detail);
    };
    if (job === null || job.path === null) {
      show({ kind: "loading" });
      return;
    }
    show({ kind: "loading" });
    this.seed(job.key, job.revision, job.item === null ? [] : [job.item]);
    const path = job.path;
    const kind = fileKind(path, job.item?.mediaType ?? null);
    if (job.item !== null && job.target === job.revision && isTooLarge(job.item.sizeBytes)) {
      show({ kind: "too_large", bytes: job.item.sizeBytes });
      return;
    }
    if (job.mode === "view" || job.base === null) {
      const read = await this.reader.text(job.key, path, job.target);
      if (read.kind === "error") return show(read);
      if (read.kind === "absent") return show({ kind: "absent" });
      const bytes = textBytes(read.text);
      return show(
        isTooLarge(bytes)
          ? { kind: "too_large", bytes }
          : { kind: "text", fileKind: kind, text: displayText(kind, read.text) },
      );
    }
    const change = await compareFile(this.reader, job.key, path, job.base, job.target, kind);
    switch (change.kind) {
      case "changed":
        return show({ kind: "diff", change: "changed", previous: change.previous, next: change.next });
      case "same":
      case "error":
        return show(change);
      case "too_large":
        return show({ kind: "too_large", bytes: null });
      case "missing":
        return show({ kind: "absent" });
      case "new":
      case "removed": {
        // Only one side exists: show it all added, or all removed.
        const side = change.kind === "new" ? job.target : job.base;
        const read = await this.reader.text(job.key, path, side);
        if (read.kind === "error") return show(read);
        if (read.kind === "absent") return show({ kind: "absent" });
        if (isTooLarge(textBytes(read.text))) return show({ kind: "too_large", bytes: null });
        const text = displayText(kind, read.text);
        return show(
          change.kind === "new"
            ? { kind: "diff", change: "new", previous: "", next: text }
            : { kind: "diff", change: "removed", previous: text, next: "" },
        );
      }
    }
  }
}
