import { InjectionToken, signal } from "@angular/core";
import { invalidResponse, isNotFound, type ApiError, type ApiResult } from "@core/api/api-error";
import type { ArtifactContent, ArtifactContentQuery } from "@core/api/types";

/** `ApiClient.getArtifactContent`, as the reader needs it. */
export type ReadContent = (key: string, query: ArtifactContentQuery) => Promise<ApiResult<ArtifactContent>>;

/** The text of one file at one revision, or why there is none. `absent` is the API's `404`: the file was not in that set. */
export type Fetched =
  | { readonly kind: "text"; readonly text: string; readonly etag: string | null }
  | { readonly kind: "absent" }
  | { readonly kind: "error"; readonly error: ApiError };

/** Whether a file at one revision has the content an ETag names. */
export type Sameness =
  | { readonly kind: "same" }
  | { readonly kind: "different" }
  | { readonly kind: "absent" }
  | { readonly kind: "error"; readonly error: ApiError };

/** What is known of one file at one revision. A `digest` is its ETag without its text. */
type Entry =
  | { readonly kind: "text"; readonly text: string; readonly etag: string | null }
  | { readonly kind: "digest"; readonly etag: string }
  | { readonly kind: "absent" };

/** How many `(path, revision)` answers the reader keeps; the least recently used go first. */
export const CACHE_LIMIT = 200;

/** The ETag the API sends for a file: its `sha256`, quoted. */
export function etagFor(sha256: string): string {
  return `"${sha256}"`;
}

/**
 * Reads files of a voyage at any revision of its artifact set, and remembers what it was told (plan, lane 5C, G9). A
 * revision never changes, so an answer for `(path, revision)` is kept as long as it fits (the least recently used goes
 * first): asking again makes no request.
 * `404` is an answer too ("it was not in that revision"); a failure is not, so it is asked again. The ETag is for
 * comparing: asking a file of one revision with the ETag of another (`If-None-Match`) answers `304` with no text when
 * they are the same, so an unchanged file costs no download. Reads that are in flight are shared.
 */
export class ArtifactReader {
  private readonly entries = new Map<string, Entry>();
  private readonly textFlights = new Map<string, Promise<Fetched>>();
  private readonly samenessFlights = new Map<string, Promise<Sameness>>();
  /** Every path ever seen per voyage, in the order it was first seen: a listing item or a read. */
  private readonly seen = signal<ReadonlyMap<string, readonly string[]>>(new Map());

  constructor(private readonly read: ReadContent) {}

  /** The paths the voyage has shown or read at any revision, so a file removed later stays known. */
  paths(key: string): readonly string[] {
    return this.seen().get(key) ?? [];
  }

  /** Records the ETag of a file at a revision without reading it (the current set's `listArtifacts` has them all). */
  learn(key: string, path: string, revision: number, etag: string): void {
    this.note(key, path);
    if (!this.entries.has(slot(key, path, revision))) this.put(slot(key, path, revision), { kind: "digest", etag });
  }

  /** The ETag known for a file at a revision, if any. */
  etag(key: string, path: string, revision: number): string | null {
    const entry = this.entries.get(slot(key, path, revision));
    return entry === undefined || entry.kind === "absent" ? null : entry.etag;
  }

  /** The text of a file at a revision. */
  text(key: string, path: string, revision: number): Promise<Fetched> {
    this.note(key, path);
    const id = slot(key, path, revision);
    const entry = this.entries.get(id);
    if (entry?.kind === "text" || entry?.kind === "absent") {
      this.put(id, entry);
      return Promise.resolve(entry);
    }
    return share(this.textFlights, id, async () => this.settle(id, await this.read(key, { path, revision })));
  }

  /**
   * Whether a file at `revision` has the content `etag` names. Answered from what is known when it can be; otherwise one
   * request with `If-None-Match`: `304` means the same (no text comes), a `200` brings the text, which is kept.
   */
  sameness(key: string, path: string, revision: number, etag: string): Promise<Sameness> {
    this.note(key, path);
    const id = slot(key, path, revision);
    const entry = this.entries.get(id);
    if (entry?.kind === "absent") {
      this.put(id, entry);
      return Promise.resolve({ kind: "absent" });
    }
    if (entry !== undefined && entry.etag !== null) {
      this.put(id, entry);
      return Promise.resolve({ kind: entry.etag === etag ? "same" : "different" });
    }
    return share(this.samenessFlights, `${id}|${etag}`, async (): Promise<Sameness> => {
      const result = await this.read(key, { path, revision, ifNoneMatch: etag });
      if (result.ok && result.value.kind === "not_modified") {
        // A text held without an ETag keeps its text and learns the ETag; otherwise only the ETag is known.
        const held = this.entries.get(id);
        this.put(id, held?.kind === "text" ? { kind: "text", text: held.text, etag } : { kind: "digest", etag });
        return { kind: "same" };
      }
      const fetched = this.settle(id, result);
      if (fetched.kind !== "text") return fetched;
      return { kind: fetched.etag === etag ? "same" : "different" };
    });
  }

  /** Turns an answer into what is kept and what is returned. A failure is returned and not kept. */
  private settle(id: string, result: ApiResult<ArtifactContent>): Fetched {
    if (!result.ok) {
      if (isNotFound(result.error)) {
        this.put(id, { kind: "absent" });
        return { kind: "absent" };
      }
      return { kind: "error", error: result.error };
    }
    if (result.value.kind !== "content") {
      // Nothing was sent to match, so "unchanged" cannot be a true answer.
      return { kind: "error", error: invalidResponse("getArtifactContent", "304 without If-None-Match") };
    }
    const entry: Entry = { kind: "text", text: result.value.text, etag: result.value.etag };
    this.put(id, entry);
    return entry;
  }

  private put(id: string, entry: Entry): void {
    this.entries.delete(id);
    this.entries.set(id, entry);
    while (this.entries.size > CACHE_LIMIT) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Remembers a path as seen for its voyage, once, in the order it first appeared. */
  private note(key: string, path: string): void {
    const current = this.seen();
    const paths = current.get(key) ?? [];
    if (paths.includes(path)) return;
    const next = new Map(current);
    next.set(key, [...paths, path]);
    this.seen.set(next);
  }
}

/** Runs `start` unless the same read is already in flight, in which case both share it. */
function share<T>(flights: Map<string, Promise<T>>, id: string, start: () => Promise<T>): Promise<T> {
  const running = flights.get(id);
  if (running !== undefined) return running;
  const flight = start().finally(() => flights.delete(id));
  flights.set(id, flight);
  return flight;
}

function slot(key: string, path: string, revision: number): string {
  return `${key}|${revision}|${path}`;
}

/** The reader the Artifacts tab uses, provided by its route so what it learned outlives the tab. */
export const ARTIFACT_READER = new InjectionToken<ArtifactReader>("ARTIFACT_READER");
