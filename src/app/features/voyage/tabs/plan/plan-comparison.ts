import { isNotFound, type ApiResult } from '@core/api/api-error';
import type { ArtifactContent } from '@core/api/types';

/** How many revisions back the Plan tab looks for a plan that differs (the API lists only the current revision: G9). */
export const MAX_PROBES = 5;

/** Reads the plan at one artifact-set revision (`getArtifactContent?revision=`). */
export type ReadRevision = (
  revision: number
) => Promise<ApiResult<ArtifactContent>>;

/** The earlier plan the current one is compared with. */
export interface Comparison {
  /** The artifact-set revision it was read at. */
  readonly revision: number;
  readonly text: string;
}

/**
 * The plan to highlight changes against: the latest earlier revision, within {@link MAX_PROBES}, whose plan text differs
 * from `currentText`. A revision where the plan did not change is passed over (every revision is a whole set, so the plan
 * repeats while other files change), and so is one where there was no plan (`404`). Any other error stops the search:
 * without knowing what an earlier plan said nothing is marked, rather than everything. `cancelled` is asked before each
 * request, so a plan that was replaced meanwhile stops the probing. Null when nothing earlier differs.
 */
export async function findComparison(
  currentText: string,
  currentRevision: number,
  read: ReadRevision,
  cancelled: () => boolean = () => false
): Promise<Comparison | null> {
  const lowest = Math.max(1, currentRevision - MAX_PROBES);
  for (let revision = currentRevision - 1; revision >= lowest; revision--) {
    if (cancelled()) return null;
    const result = await read(revision);
    if (!result.ok) {
      if (isNotFound(result.error)) continue;
      return null;
    }
    if (result.value.kind === 'content' && result.value.text !== currentText) {
      return { revision, text: result.value.text };
    }
  }
  return null;
}
