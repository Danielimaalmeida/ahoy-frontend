import { describe, expect, it } from "vitest";
import { adjust, readSelection, selectionParams, type Params } from "./selection";

const PATHS = ["jira-snapshot.md", "implementation-plan.md", "state.json"];

function params(values: Record<string, string> = {}): Params {
  return { get: (name) => values[name] ?? null };
}

describe("readSelection", () => {
  it("opens on the current revision against the one before it, on the plan, in Compare", () => {
    expect(readSelection(params(), 5, PATHS)).toEqual({
      mode: "compare",
      target: 5,
      base: 4,
      path: "implementation-plan.md",
    });
  });

  it("opens on the first file when the voyage has no plan, and on no file when it has none", () => {
    expect(readSelection(params(), 2, ["a.md", "b.md"]).path).toBe("a.md");
    expect(readSelection(params(), 0, []).path).toBeNull();
  });

  it("has nothing to compare with at revision 1: it opens in View", () => {
    expect(readSelection(params(), 1, PATHS)).toMatchObject({ mode: "view", target: 1, base: null });
    expect(readSelection(params({ compare: "1" }), 1, PATHS).base).toBeNull();
  });

  it("follows the query: ?compare=2 is the base, ?to= the target, ?file= the file, ?mode=view the viewer", () => {
    expect(readSelection(params({ compare: "2" }), 5, PATHS)).toMatchObject({ target: 5, base: 2 });
    expect(readSelection(params({ to: "3", compare: "1" }), 5, PATHS)).toMatchObject({ target: 3, base: 1 });
    expect(readSelection(params({ file: "state.json" }), 5, PATHS).path).toBe("state.json");
    expect(readSelection(params({ mode: "view" }), 5, PATHS).mode).toBe("view");
  });

  it("ignores what does not fit: a revision that does not exist, a base at or above the target, an unknown file", () => {
    expect(readSelection(params({ to: "9" }), 5, PATHS).target).toBe(5);
    expect(readSelection(params({ to: "0" }), 5, PATHS).target).toBe(5);
    expect(readSelection(params({ compare: "5" }), 5, PATHS).base).toBe(4);
    expect(readSelection(params({ compare: "9" }), 5, PATHS).base).toBe(4);
    expect(readSelection(params({ file: "../etc/passwd" }), 5, PATHS).path).toBe("implementation-plan.md");
  });

  it("reads only plain positive whole numbers: a query string is untrusted", () => {
    for (const bad of ["4.5", "-1", "1e1", "0x2", " 3", "3 ", "abc", "", "99999999999999999999", "03"]) {
      expect(readSelection(params({ compare: bad }), 5, PATHS).base, bad).toBe(4);
      expect(readSelection(params({ to: bad }), 5, PATHS).target, bad).toBe(5);
    }
  });
});

describe("selectionParams", () => {
  it("leaves out everything that is the default, so the page keeps following the current revision", () => {
    const selection = readSelection(params(), 5, PATHS);
    expect(selectionParams(selection, 5, PATHS)).toEqual({});
  });

  it("writes what differs, and reads back as the same selection", () => {
    const wanted = { mode: "view", target: 3, base: 1, path: "state.json" } as const;
    const query = selectionParams(wanted, 5, PATHS);
    expect(query).toEqual({ to: "3", compare: "1", file: "state.json", mode: "view" });
    expect(readSelection(params(query), 5, PATHS)).toEqual(wanted);
  });
});

describe("adjust", () => {
  const base = readSelection(params({ compare: "2" }), 5, PATHS);

  it("applies the patch", () => {
    expect(adjust(base, { path: "state.json" })).toMatchObject({ path: "state.json", base: 2, target: 5 });
    expect(adjust(base, { mode: "view" }).mode).toBe("view");
  });

  it("moves the base below a new target, to the revision before it", () => {
    expect(adjust(base, { target: 2 })).toMatchObject({ target: 2, base: 1 });
    expect(adjust(base, { target: 3 })).toMatchObject({ target: 3, base: 2 });
  });

  it("drops the comparison at revision 1, and refuses Compare there", () => {
    expect(adjust(base, { target: 1 })).toMatchObject({ target: 1, base: null, mode: "view" });
    expect(adjust(adjust(base, { target: 1 }), { mode: "compare" }).mode).toBe("view");
  });
});
