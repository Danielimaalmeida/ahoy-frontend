/**
 * A defensive reader for the `state` of `getStoryState`: the worker's `state.json`, rendered from Postgres.
 *
 * The contract only says that `state` is an object, and that its field names follow the control repo's `state.json`
 * (snake_case). Agents write parts of it, so every value is checked and a field that is missing or of the wrong type reads
 * as empty rather than failing the page. The names below were read from the hosted API's own renderer
 * (`encodeStory` in ahoy-hosted `packages/core/src/domain/story-document.ts`, commit 1890d5a), not from a live response:
 * confirm them against an answer from `npm run dev -- --simulate` when one is at hand.
 */
import { isRecord, isWholeNumber } from './guard-kit';

/** The revision ceiling the hosted API uses when `revision_ceiling` is unset (`DEFAULT_REVISION_CEILING`). */
export const DEFAULT_REVISION_CEILING = 4;

/** An acceptance criterion of the plan (`acceptance_criteria[]`). */
export interface StoryCriterion {
  readonly id: string;
  readonly text: string;
  /** The plan alias of the repository that implements it. */
  readonly repo?: string;
}

/** A work package of the plan (`work_packages[]`) and what the implementation phase has done with it. */
export interface StoryPackage {
  readonly id: string;
  readonly repo: string;
  readonly agent: string;
  /** `pending` when the state sets none. Free text from the worker: the UI needs a fallback for values it does not know. */
  readonly status: string;
  /** Whether this package opens its repository's pull request. */
  readonly openPr: boolean;
  readonly dependsOn: readonly string[];
}

/** A human gate's entry (`human_gates[<gate>]`). All parts are optional: an undecided gate has none. */
export interface StoryGate {
  readonly status?: string;
  /** `timestamp` in the document. */
  readonly decidedAt?: string;
  readonly reason?: string;
}

/** What the UI reads of a story's state. */
export interface StoryStateView {
  readonly criteria: readonly StoryCriterion[];
  readonly packages: readonly StoryPackage[];
  /** By human gate key, such as `plan_accepted`. */
  readonly humanGates: ReadonlyMap<string, StoryGate>;
  /** Send-back rounds counted so far, by human gate key. */
  readonly revisions: ReadonlyMap<string, number>;
  /** How many send-backs a gate takes before it refuses more; {@link DEFAULT_REVISION_CEILING} when the state sets none. */
  readonly revisionCeiling: number;
}

/** The entries of a list that `read` accepts, in order; anything that is not a list gives none. */
function readList<T>(
  value: unknown,
  read: (item: Record<string, unknown>) => T | null
): readonly T[] {
  if (!Array.isArray(value)) return [];
  const items: readonly unknown[] = value;
  const out: T[] = [];
  for (const item of items) {
    const entry = isRecord(item) ? read(item) : null;
    if (entry !== null) out.push(entry);
  }
  return out;
}

/** The entries of an object that `read` accepts, by key; anything that is not an object gives none. */
function readMap<T>(
  value: unknown,
  read: (entry: unknown) => T | null
): ReadonlyMap<string, T> {
  const out = new Map<string, T>();
  if (!isRecord(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    const entry = read(raw);
    if (entry !== null) out.set(key, entry);
  }
  return out;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function readCriterion(raw: Record<string, unknown>): StoryCriterion | null {
  const id = str(raw['id']);
  const text = str(raw['text']);
  if (id === undefined || id === '' || text === undefined) return null;
  const repo = str(raw['repo']);
  return { id, text, ...(repo !== undefined ? { repo } : {}) };
}

function readPackage(raw: Record<string, unknown>): StoryPackage | null {
  const id = str(raw['id']);
  if (id === undefined || id === '') return null;
  const dependsOn: readonly unknown[] = Array.isArray(raw['depends_on'])
    ? raw['depends_on']
    : [];
  return {
    id,
    repo: str(raw['repo']) ?? '',
    agent: str(raw['agent']) ?? '',
    status: str(raw['status']) ?? 'pending',
    openPr: raw['open_pr'] === true,
    dependsOn: dependsOn.filter(
      (dep): dep is string => typeof dep === 'string'
    ),
  };
}

function readGate(raw: unknown): StoryGate | null {
  if (!isRecord(raw)) return null;
  const status = str(raw['status']);
  const decidedAt = str(raw['timestamp']);
  const reason = str(raw['reason']);
  return {
    ...(status !== undefined ? { status } : {}),
    ...(decidedAt !== undefined ? { decidedAt } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

function readRevision(raw: unknown): number | null {
  return isWholeNumber(raw) && raw >= 0 ? raw : null;
}

/**
 * Reads the `state` of `getStoryState`. It never throws and accepts anything: a state that is not an object, or fields
 * that are missing or of the wrong type, read as empty. Fields this reader does not know are ignored.
 */
export function readStoryState(state: unknown): StoryStateView {
  const doc = isRecord(state) ? state : {};
  const ceiling = doc['revision_ceiling'];
  return {
    criteria: readList(doc['acceptance_criteria'], readCriterion),
    packages: readList(doc['work_packages'], readPackage),
    humanGates: readMap(doc['human_gates'], readGate),
    revisions: readMap(doc['revisions'], readRevision),
    revisionCeiling:
      isWholeNumber(ceiling) && ceiling > 0
        ? ceiling
        : DEFAULT_REVISION_CEILING,
  };
}
