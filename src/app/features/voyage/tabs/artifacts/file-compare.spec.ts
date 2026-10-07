import { describe, expect, it } from "vitest";
import { ArtifactReader, etagFor } from "./artifact-reader";
import { compareFile, statusLabel } from "./file-compare";
import { FakeContent, fakeSha } from "./testing/fake-content";

const KEY = "PROJ-123";

/** `count` lines "line 1" … "line N", for diffs of a known size. */
const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

function setup(revisions: Record<number, Record<string, string>>, listed?: { revision: number; paths: string[] }) {
  const content = new FakeContent(revisions);
  const reader = new ArtifactReader(content.read);
  // The current set's listing teaches the reader every file's ETag.
  for (const path of listed?.paths ?? []) {
    const text = revisions[listed?.revision ?? 0]?.[path];
    if (text !== undefined) reader.learn(KEY, path, listed?.revision ?? 0, etagFor(fakeSha(text)));
  }
  return { content, reader };
}

describe("compareFile against the current set (ETags known)", () => {
  const OLD = lines("# Plan", "", "## Summary", "one", "two", "three", "four");
  const NEW = lines("# Plan", "", "## Summary", "one", "TWO", "three", "four", "five", "six");

  it("says 'same' with a single 304 and no download of the text", async () => {
    const { content, reader } = setup(
      { 4: { "jira-snapshot.md": "snap" }, 5: { "jira-snapshot.md": "snap" } },
      { revision: 5, paths: ["jira-snapshot.md"] },
    );
    expect(await compareFile(reader, KEY, "jira-snapshot.md", 4, 5)).toEqual({ kind: "same" });
    expect(content.requests).toEqual([
      { key: KEY, query: { path: "jira-snapshot.md", revision: 4, ifNoneMatch: etagFor(fakeSha("snap")) } },
    ]);
  });

  it("counts the lines added and removed with the domain's diff, and keeps both texts for the viewer", async () => {
    const { reader } = setup({ 4: { "p.md": OLD }, 5: { "p.md": NEW } }, { revision: 5, paths: ["p.md"] });
    expect(await compareFile(reader, KEY, "p.md", 4, 5)).toEqual({
      kind: "changed",
      added: 3,
      removed: 1,
      previous: OLD,
      next: NEW,
    });
  });

  it("says 'new' when the earlier revision answers 404", async () => {
    const { content, reader } = setup({ 5: { "plan-round-1.md": "x" } }, { revision: 5, paths: ["plan-round-1.md"] });
    expect(await compareFile(reader, KEY, "plan-round-1.md", 4, 5)).toEqual({ kind: "new" });
    expect(content.requests).toHaveLength(1);
  });

  it("asks nothing more when the same comparison is opened again", async () => {
    const { content, reader } = setup(
      { 4: { "p.md": OLD, "s.md": "s", "n.md": "n" }, 5: { "p.md": NEW, "s.md": "s" } },
      { revision: 5, paths: ["p.md", "s.md"] },
    );
    const run = async (): Promise<void> => {
      for (const path of ["p.md", "s.md"]) await compareFile(reader, KEY, path, 4, 5);
    };
    await run();
    const asked = content.requests.length;
    await run();
    expect(content.requests).toHaveLength(asked);
  });

  it("returns a failure for that file and lets the next ask try again", async () => {
    const { content, reader } = setup({ 4: { "p.md": OLD }, 5: { "p.md": NEW } }, { revision: 5, paths: ["p.md"] });
    content.failures.set("p.md@4", { kind: "network" });
    expect(await compareFile(reader, KEY, "p.md", 4, 5)).toMatchObject({ kind: "error" });
    content.failures.clear();
    expect(await compareFile(reader, KEY, "p.md", 4, 5)).toMatchObject({ kind: "changed" });
  });

  it("calls a JSON file changed, and compares its re-indented text", async () => {
    const before = '{"phase":"planning","round":1}';
    const after = '{"phase":"plan_review","round":1}';
    const { reader } = setup(
      { 4: { "state.json": before }, 5: { "state.json": after } },
      { revision: 5, paths: ["state.json"] },
    );
    const change = await compareFile(reader, KEY, "state.json", 4, 5);
    expect(change).toMatchObject({ kind: "changed", added: 1, removed: 1 });
    expect(statusLabel(change, "json")).toBe("changed");
    expect(change.kind === "changed" && change.next).toBe('{\n  "phase": "plan_review",\n  "round": 1\n}');
  });

  it("calls a JSON file 'same' when only its formatting differs", async () => {
    const { reader } = setup(
      { 4: { "q.json": '{"a":1}' }, 5: { "q.json": '{ "a": 1 }' } },
      { revision: 5, paths: ["q.json"] },
    );
    expect(await compareFile(reader, KEY, "q.json", 4, 5)).toEqual({ kind: "same" });
  });

  it("says 'same' when the ETags differ but the lines do not (a server that quotes ETags another way)", async () => {
    const content = new FakeContent({ 4: { "p.md": "same\n" }, 5: { "p.md": "same\n" } });
    const reader = new ArtifactReader(content.read);
    reader.learn(KEY, "p.md", 5, 'W/"other-format"');
    expect(await compareFile(reader, KEY, "p.md", 4, 5)).toEqual({ kind: "same" });
  });

  it("does not preview a file over 1 MB", async () => {
    const big = "x".repeat(1_048_577);
    const { reader } = setup(
      { 4: { "big.md": `${big}a` }, 5: { "big.md": `${big}b` } },
      { revision: 5, paths: ["big.md"] },
    );
    expect(await compareFile(reader, KEY, "big.md", 4, 5)).toEqual({ kind: "too_large" });
  });
});

describe("compareFile between two earlier revisions (ETags not known)", () => {
  it("reads the target first, then asks the base with its ETag", async () => {
    const { content, reader } = setup({ 2: { "a.md": "t" }, 3: { "a.md": "t" } });
    expect(await compareFile(reader, KEY, "a.md", 2, 3)).toEqual({ kind: "same" });
    expect(content.requests.map((r) => [r.query.revision, r.query.ifNoneMatch !== undefined])).toEqual([
      [3, false],
      [2, true],
    ]);
  });

  it("says 'removed' for a file in the base and not in the target, and 'missing' for one in neither", async () => {
    const { reader } = setup({ 2: { "gone.md": "g" }, 3: {} });
    expect(await compareFile(reader, KEY, "gone.md", 2, 3)).toEqual({ kind: "removed" });
    expect(await compareFile(reader, KEY, "never.md", 2, 3)).toEqual({ kind: "missing" });
  });

  it("says 'new' for a file in the target and not in the base", async () => {
    const { reader } = setup({ 2: {}, 3: { "a.md": "x\n" } });
    expect(await compareFile(reader, KEY, "a.md", 2, 3)).toEqual({ kind: "new" });
  });

  it("counts the lines of a changed file when the server sends no ETag", async () => {
    const { content, reader } = setup({ 2: { "a.md": "one\ntwo\n" }, 3: { "a.md": "one\nTWO\n" } });
    content.withoutEtag.add("a.md");
    expect(await compareFile(reader, KEY, "a.md", 2, 3)).toEqual({
      kind: "changed",
      added: 1,
      removed: 1,
      previous: "one\ntwo\n",
      next: "one\nTWO\n",
    });
  });

  it("returns the failure of whichever side could not be read", async () => {
    const { content, reader } = setup({ 2: { "a.md": "x" }, 3: { "a.md": "y" } });
    content.failures.set("a.md@3", { kind: "network" });
    expect(await compareFile(reader, KEY, "a.md", 2, 3)).toMatchObject({ kind: "error" });
    content.failures.clear();
    content.failures.set("a.md@2", { kind: "network" });
    expect(await compareFile(reader, KEY, "a.md", 2, 3)).toMatchObject({ kind: "error" });
  });
});

describe("statusLabel", () => {
  const changed = (added: number, removed: number) =>
    ({ kind: "changed", added, removed, previous: "", next: "" }) as const;

  it("writes +9 −3 with the real minus sign, and only the side that has lines", () => {
    expect(statusLabel(changed(9, 3), "markdown")).toBe("+9 \u22123");
    expect(statusLabel(changed(2, 0), "markdown")).toBe("+2");
    expect(statusLabel(changed(0, 4), "markdown")).toBe("\u22124");
  });

  it("writes the other states as the board does", () => {
    expect(statusLabel({ kind: "same" }, "markdown")).toBe("same");
    expect(statusLabel({ kind: "new" }, "markdown")).toBe("new");
    expect(statusLabel({ kind: "removed" }, "markdown")).toBe("removed");
    expect(statusLabel({ kind: "too_large" }, "markdown")).toBe("too large");
    expect(statusLabel({ kind: "error", error: { kind: "network" } }, "markdown")).toBe("error");
    expect(statusLabel({ kind: "loading" }, "markdown")).toBe("…");
    expect(statusLabel(undefined, "markdown")).toBe("…");
  });
});
