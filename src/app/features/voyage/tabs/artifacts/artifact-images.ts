import { InjectionToken } from '@angular/core';
import { isNotFound, type ApiError, type ApiResult } from '@core/api/api-error';
import type { ArtifactContentQuery } from '@core/api/types';

/** `ApiClient.getArtifactBlob`, as the image cache needs it. */
export type ReadBlob = (
  key: string,
  query: ArtifactContentQuery
) => Promise<ApiResult<Blob>>;

/** How a Blob becomes a URL an `<img>` can show, and how that URL is let go. */
export interface ObjectUrls {
  readonly create: (blob: Blob) => string;
  readonly revoke: (url: string) => void;
}

/** One image at one revision: a URL for `<img src>`, or why there is none. `absent` is the API's `404`. */
export type ImageRead =
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly error: ApiError };

/** How many images are kept as object URLs; the least recently used is revoked first. */
export const IMAGE_CACHE_LIMIT = 40;

/** The browser's object URLs. */
export const BROWSER_OBJECT_URLS: ObjectUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

/**
 * Reads image artifacts (a design frame's PNG) as bytes and keeps each as an object URL, so the viewer shows the picture
 * instead of its bytes as text. A revision never changes, so `(path, revision)` is read once while it is kept; reads in
 * flight are shared, a `404` is kept as an answer and a failure is not. Evicted URLs are revoked, so memory stays bounded.
 */
export class ArtifactImages {
  private readonly entries = new Map<string, ImageRead>();
  private readonly flights = new Map<string, Promise<ImageRead>>();

  constructor(
    private readonly read: ReadBlob,
    private readonly urls: ObjectUrls = BROWSER_OBJECT_URLS
  ) {}

  /** The image at `revision`, as a URL to show. */
  image(key: string, path: string, revision: number): Promise<ImageRead> {
    const id = `${key}|${revision}|${path}`;
    const held = this.entries.get(id);
    if (held !== undefined) {
      this.put(id, held);
      return Promise.resolve(held);
    }
    const running = this.flights.get(id);
    if (running !== undefined) return running;
    const flight = this.fetch(id, key, path, revision).finally(() =>
      this.flights.delete(id)
    );
    this.flights.set(id, flight);
    return flight;
  }

  private async fetch(
    id: string,
    key: string,
    path: string,
    revision: number
  ): Promise<ImageRead> {
    const result = await this.read(key, { path, revision });
    if (!result.ok) {
      if (!isNotFound(result.error))
        return { kind: 'error', error: result.error };
      this.put(id, { kind: 'absent' });
      return { kind: 'absent' };
    }
    const entry: ImageRead = {
      kind: 'image',
      url: this.urls.create(result.value),
    };
    this.put(id, entry);
    return entry;
  }

  private put(id: string, entry: ImageRead): void {
    this.entries.delete(id);
    this.entries.set(id, entry);
    while (this.entries.size > IMAGE_CACHE_LIMIT) {
      const oldest = this.entries.entries().next();
      if (oldest.done === true) break;
      const [oldId, old] = oldest.value;
      this.entries.delete(oldId);
      if (old.kind === 'image') this.urls.revoke(old.url);
    }
  }
}

/** The image cache the Artifacts tab uses, provided by its route beside the reader. */
export const ARTIFACT_IMAGES = new InjectionToken<ArtifactImages>(
  'ARTIFACT_IMAGES'
);
