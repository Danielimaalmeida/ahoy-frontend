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

/** Who accepted a stuck work package as it stood (`work_packages[].accepted`), why, and from which status. */
export interface StoryPackageAcceptance {
  readonly by: string;
  readonly reason: string;
  /** The status the package had when it was accepted, such as `unverified`. */
  readonly fromStatus: string;
  readonly at: string;
}

/**
 * A work package of the plan (`work_packages[]`) and what the implementation phase has done with it. The state names no
 * goal or description for a package: what it is for is only in the plan's prose (`implementation-plan.md`).
 */
export interface StoryPackage {
  readonly id: string;
  readonly repo: string;
  readonly agent: string;
  /** `pending` when the state sets none. Free text from the worker: the UI needs a fallback for values it does not know. */
  readonly status: string;
  /** Whether this package opens its repository's pull request. */
  readonly openPr: boolean;
  readonly dependsOn: readonly string[];
  /** The note its next run gets (`rework_note`): a reviewer's findings, or the reason a person gave for a retry. */
  readonly reworkNote?: string;
  /** The package it waits on (`handback_to`) while `waiting_on_handback`. */
  readonly handbackTo?: string;
  /** Set once a person accepted it as it stood (`decideWorkPackage` with `accept`). */
  readonly accepted?: StoryPackageAcceptance;
}

/** A human gate's entry (`human_gates[<gate>]`). All parts are optional: an undecided gate has none. */
export interface StoryGate {
  readonly status?: string;
  /** `timestamp` in the document. */
  readonly decidedAt?: string;
  readonly reason?: string;
}

/** A pull request the harness opened and verified for a child repository (`child_repos[].pr_url`). */
export interface StoryPullRequest {
  /** The plan alias of the repository. */
  readonly repo: string;
  /** An absolute `http(s)` URL, normalised by `URL`. */
  readonly url: string;
  readonly number?: number;
  /** GitHub's word, such as `OPEN` or `MERGED`, as the gate last read it. */
  readonly state?: string;
}

/** What the UI reads of a story's state. */
export interface StoryStateView {
  /** Valid, distinct plan aliases from `child_repos`, including repositories without a pull request yet. */
  readonly repositoryAliases: readonly string[];
  readonly criteria: readonly StoryCriterion[];
  readonly packages: readonly StoryPackage[];
  /** The child repositories' pull requests, in plan order; a repository without a recorded pull request has none. */
  readonly pullRequests: readonly StoryPullRequest[];
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
  const reworkNote = nonBlank(raw['rework_note']);
  const handbackTo = nonBlank(raw['handback_to']);
  const accepted = readAcceptance(raw['accepted']);
  return {
    id,
    repo: str(raw['repo']) ?? '',
    agent: str(raw['agent']) ?? '',
    status: str(raw['status']) ?? 'pending',
    openPr: raw['open_pr'] === true,
    dependsOn: dependsOn.filter(
      (dep): dep is string => typeof dep === 'string'
    ),
    ...(reworkNote !== undefined ? { reworkNote } : {}),
    ...(handbackTo !== undefined ? { handbackTo } : {}),
    ...(accepted !== null ? { accepted } : {}),
  };
}

/** A string with something in it besides white space; anything else gives `undefined`. */
const nonBlank = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** `accepted` when it names who, why, from which status and when; anything less gives `null`. */
function readAcceptance(raw: unknown): StoryPackageAcceptance | null {
  if (!isRecord(raw)) return null;
  const by = nonBlank(raw['by']);
  const reason = nonBlank(raw['reason']);
  const fromStatus = nonBlank(raw['from_status']);
  const at = nonBlank(raw['at']);
  return by === undefined ||
    reason === undefined ||
    fromStatus === undefined ||
    at === undefined
    ? null
    : { by, reason, fromStatus, at };
}

/** The URL if it is an absolute `http(s)` URL, normalised by `URL`; anything else gives `null`. */
function httpUrl(value: string | undefined): string | null {
  if (value === undefined) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:'
    ? url.href
    : null;
}

function readPullRequest(
  raw: Record<string, unknown>
): StoryPullRequest | null {
  const url = httpUrl(str(raw['pr_url']));
  if (url === null) return null;
  const number = raw['pr_number'];
  const state = str(raw['pr_state']);
  return {
    repo: str(raw['repo']) ?? '',
    url,
    ...(isWholeNumber(number) && number > 0 ? { number } : {}),
    ...(state !== undefined && state !== '' ? { state } : {}),
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
    repositoryAliases: [
      ...new Set(
        readList(doc['child_repos'], (entry) => {
          const repo = entry['repo'];
          return typeof repo === 'string' &&
            repo.length <= 64 &&
            /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo)
            ? repo
            : null;
        })
      ),
    ],
    criteria: readList(doc['acceptance_criteria'], readCriterion),
    packages: readList(doc['work_packages'], readPackage),
    pullRequests: readList(doc['child_repos'], readPullRequest),
    humanGates: readMap(doc['human_gates'], readGate),
    revisions: readMap(doc['revisions'], readRevision),
    revisionCeiling:
      isWholeNumber(ceiling) && ceiling > 0
        ? ceiling
        : DEFAULT_REVISION_CEILING,
  };
}
