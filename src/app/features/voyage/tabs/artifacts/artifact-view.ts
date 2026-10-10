import type { ApiError } from '@core/api/api-error';
import type { AhoyEvent, Artifact } from '@core/api/types';
import { diffLines } from '@domain/text-diff';

/** A revision selector entry, with context when its event history provides it. */
export interface ArtifactRevision {
  readonly revision: number;
  readonly label: string;
}

/** Content held for one artifact path and revision. */
export interface ArtifactText {
  readonly text: string;
  readonly etag: string | null;
  readonly mediaType: string | null;
}

/** Result of reading a path at a revision. */
export type ArtifactRead =
  | { readonly kind: 'content'; readonly value: ArtifactText }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error'; readonly error: ApiError };

/** Status shown beside a file when compared with another artifact revision. */
export type ArtifactComparison =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'same' }
  | { readonly kind: 'new' }
  | { readonly kind: 'removed' }
  | { readonly kind: 'changed'; readonly label: string };

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringAt = (
  value: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : null;
};

/** Whether an untrusted value is a positive, safe artifact-set revision. */
export function isArtifactRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Labels artifact-set revisions using the event immediately before each update, when available. */
export function artifactRevisions(
  currentRevision: number,
  items: readonly Artifact[],
  events: readonly AhoyEvent[]
): ArtifactRevision[] {
  const contextByRevision = new Map<number, string>();
  for (const [index, event] of events.entries()) {
    if (event.type !== 'artifacts.updated' || !record(event.payload)) continue;
    const revision = event.payload['revision'];
    if (!isArtifactRevision(revision)) continue;
    const previous = events[index - 1];
    if (previous === undefined) continue;
    if (
      previous.type === 'decision.recorded' &&
      record(previous.payload) &&
      previous.payload['decision'] === 'send_back'
    ) {
      contextByRevision.set(revision, 'send-back');
    } else if (previous.type === 'run.finished' && record(previous.payload)) {
      const runId = stringAt(previous.payload, 'runId');
      if (runId !== null) contextByRevision.set(revision, runId);
    }
  }

  const currentRunId = items.find(
    (item) => item.revision === currentRevision
  )?.runId;
  return Array.from({ length: currentRevision }, (_, index) => {
    const revision = index + 1;
    if (revision === currentRevision) {
      const runId = currentRunId ?? contextByRevision.get(revision);
      return {
        revision,
        label: `Revision ${revision} · current${runId ? ` (${runId})` : ''}`,
      };
    }
    const context = contextByRevision.get(revision);
    return {
      revision,
      label: `Revision ${revision}${context ? ` (${context})` : ''}`,
    };
  });
}

/** Status label for one path between an older revision and a newer one. */
export function artifactComparison(
  older: ArtifactRead | null,
  newer: ArtifactRead | null
): ArtifactComparison {
  if (older === null || newer === null) return { kind: 'loading' };
  if (older.kind === 'error' || newer.kind === 'error')
    return { kind: 'error' };
  if (older.kind === 'missing')
    return newer.kind === 'missing' ? { kind: 'same' } : { kind: 'new' };
  if (newer.kind === 'missing') return { kind: 'removed' };

  if (
    older.value.text === newer.value.text ||
    (older.value.etag !== null && older.value.etag === newer.value.etag)
  ) {
    return { kind: 'same' };
  }

  if (
    older.value.mediaType?.includes('json') ||
    newer.value.mediaType?.includes('json')
  ) {
    return { kind: 'changed', label: 'changed' };
  }

  const lines = diffLines(older.value.text, newer.value.text);
  const added = lines.filter((line) => line.kind === 'add').length;
  const removed = lines.filter((line) => line.kind === 'remove').length;
  const label = [
    ...(added > 0 ? [`+${added}`] : []),
    ...(removed > 0 ? [`−${removed}`] : []),
  ].join(' ');
  return { kind: 'changed', label: label || 'changed' };
}

/** UTF-8 byte count of artifact content. */
export function artifactByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
