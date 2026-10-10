import { fail, ok, type ApiError, type ApiResult } from '@core/api/api-error';
import type { ArtifactContent, ArtifactContentQuery } from '@core/api/types';
import { etagFor, type ReadContent } from '../artifact-reader';

/** The unique content hash of a text in specs (not a real sha256; the reader only compares them). */
export function fakeSha(text: string): string {
  let hash = 7;
  for (const char of text)
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007;
  return `sha-${hash}-${text.length}`;
}

/** The files of a voyage by revision, answering like the API: ETag, `304` on a match, `404` when a file is not there. */
export class FakeContent {
  /** Every request it answered. */
  readonly requests: { key: string; query: ArtifactContentQuery }[] = [];
  /** An error to answer instead of a file, by `path@revision`. */
  readonly failures = new Map<string, ApiError>();
  /** Files answered without an ETag, as a server that does not send one would. */
  readonly withoutEtag = new Set<string>();

  constructor(
    private readonly revisions: Readonly<
      Record<number, Readonly<Record<string, string>>>
    >
  ) {}

  /** `ApiClient.getArtifactContent`. */
  readonly read: ReadContent = (key, query) => {
    this.requests.push({ key, query });
    return Promise.resolve(this.answer(query));
  };

  private answer(query: ArtifactContentQuery): ApiResult<ArtifactContent> {
    const failure = this.failures.get(`${query.path}@${query.revision}`);
    if (failure !== undefined) return fail(failure);
    const text = this.revisions[query.revision ?? 0]?.[query.path];
    if (text === undefined) {
      return fail({
        kind: 'problem',
        status: 404,
        code: 'not_found',
        title: 'Not found',
      });
    }
    const noEtag = this.withoutEtag.has(query.path);
    const etag = etagFor(fakeSha(text));
    if (!noEtag && query.ifNoneMatch === etag)
      return ok({ kind: 'not_modified' });
    return ok({
      kind: 'content',
      text,
      etag: noEtag ? null : etag,
      mediaType: null,
    });
  }

  /** How many requests asked for `path` at `revision`. */
  count(path: string, revision: number): number {
    return this.requests.filter(
      (r) => r.query.path === path && r.query.revision === revision
    ).length;
  }
}
