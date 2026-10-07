/** The plan is the file the tab opens on, when the voyage has one. */
export const DEFAULT_FILE = "implementation-plan.md";

/** What the tab shows: one file at one revision, or one file against an earlier revision. */
export interface Selection {
  readonly mode: "view" | "compare";
  /** The revision shown (View) or compared (Compare), the current one unless the URL says another. */
  readonly target: number;
  /** The earlier revision the target is compared with; null when there is none (the target is revision 1). */
  readonly base: number | null;
  /** The open file, one of the voyage's known paths; null when the voyage has no artifacts. */
  readonly path: string | null;
}

/** What is read from the URL's query string: `get` is `ParamMap.get`. */
export interface Params {
  get(name: string): string | null;
}

/** A positive whole number from a query value, or null. A query string is untrusted. */
function integer(value: string | null): number | null {
  if (value === null || !/^[1-9][0-9]{0,8}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** The file the tab opens on: the plan when the voyage has one, else the first path it knows. */
function defaultFile(paths: readonly string[]): string | null {
  return paths.includes(DEFAULT_FILE) ? DEFAULT_FILE : (paths[0] ?? null);
}

/** The base that fits under `target`: the revision asked for when it is below it, else the one just before. */
function baseFor(target: number, asked: number | null): number | null {
  if (target <= 1) return null;
  return asked !== null && asked < target ? asked : target - 1;
}

/**
 * The selection the URL asks for, held to what exists. `?compare=4` compares revision 4 with the target; `?to=3` makes
 * the target revision 3 (the current one when absent); `?file=` names the file; `?mode=view` shows the file instead of the
 * comparison. A value that does not fit (a revision that does not exist, a file the voyage has not got) is ignored.
 */
export function readSelection(params: Params, current: number, paths: readonly string[]): Selection {
  const asked = integer(params.get("to"));
  const target = asked !== null && asked <= current ? asked : Math.max(current, 1);
  const wanted = integer(params.get("compare"));
  const base = baseFor(target, wanted);
  const file = params.get("file");
  const fallback = defaultFile(paths);
  const path = file !== null && paths.includes(file) ? file : fallback;
  const mode = base === null || params.get("mode") === "view" ? "view" : "compare";
  return { mode, target, base, path };
}

/**
 * The query string that makes `selection` and nothing else: what is the default (the current revision, the revision
 * before it, the plan, Compare) is left out, so the page keeps following the current revision as it moves.
 */
export function selectionParams(
  selection: Selection,
  current: number,
  paths: readonly string[],
): Record<string, string> {
  const params: Record<string, string> = {};
  const fallback = defaultFile(paths);
  if (selection.target !== current) params["to"] = String(selection.target);
  if (selection.base !== null && selection.base !== selection.target - 1) params["compare"] = String(selection.base);
  if (selection.path !== null && selection.path !== fallback) params["file"] = selection.path;
  if (selection.mode === "view" && selection.base !== null) params["mode"] = "view";
  return params;
}

/**
 * `selection` with `patch` applied, and held to what fits: a new target takes a base below it (the revision just before
 * when the old base no longer fits), and revision 1 has nothing to compare with.
 */
export function adjust(selection: Selection, patch: Partial<Selection>): Selection {
  const target = patch.target ?? selection.target;
  const asked = patch.base !== undefined ? patch.base : selection.base;
  const base = baseFor(target, asked);
  const path = patch.path !== undefined ? patch.path : selection.path;
  const mode = base === null ? "view" : (patch.mode ?? selection.mode);
  return { mode, target, base, path };
}
