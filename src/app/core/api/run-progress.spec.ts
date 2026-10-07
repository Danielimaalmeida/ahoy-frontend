import listStoryEvents from "@testing/fixtures/listStoryEvents.json";
import { withField, withoutField } from "@testing/fixtures/mutate";
import { parseRunProgress } from "./run-progress";

const progress = listStoryEvents.items.filter((event) => event.type === "run.progress").map((event) => event.payload);
const [message, tool, spend] = progress;

describe("parseRunProgress", () => {
  it("reads the three kinds of payload the API sends", () => {
    expect(progress).toHaveLength(3);
    expect(parseRunProgress(message)).toEqual({
      kind: "message",
      runId: "r-04",
      line: 2,
      at: "2026-10-06T09:11:02.000Z",
      text: "Reading the Jira snapshot and the billing code.",
    });
    expect(parseRunProgress(tool)).toMatchObject({
      kind: "tool",
      line: 3,
      tool: "view",
      summary: "specs/PROJ-123/jira-snapshot.md",
    });
    expect(parseRunProgress(spend)).toMatchObject({
      kind: "spend",
      nanoAiu: 350_000_000,
      requests: 2,
      omitted: 0,
      events: 3,
    });
  });

  it("returns the payload itself, with the fields it was sent", () => {
    expect(parseRunProgress(spend)).toEqual(spend);
  });

  it("accepts a tool step without a summary and a step without a time", () => {
    expect(parseRunProgress({ runId: "r-1", kind: "tool", line: 1, tool: "bash" })).toEqual({
      runId: "r-1",
      kind: "tool",
      line: 1,
      tool: "bash",
    });
    expect(parseRunProgress({ runId: "r-1", kind: "message", line: 1, text: "hi" })).not.toBeNull();
  });

  it("tolerates fields it does not know", () => {
    expect(parseRunProgress(withField(message!, "color", "red"))).not.toBeNull();
  });

  it("ignores a kind this version does not know, so the API may add some", () => {
    expect(parseRunProgress({ runId: "r-1", kind: "thought", line: 1, text: "hm" })).toBeNull();
  });

  it("returns null for anything that is not an object with a kind", () => {
    for (const payload of [null, undefined, [], "tool", 3, {}, { kind: 3 }]) {
      expect(parseRunProgress(payload)).toBeNull();
    }
  });

  const BROKEN: readonly (readonly [string, unknown])[] = [
    ["a tool step without its tool", { runId: "r-1", kind: "tool", line: 1 }],
    ["a tool step with an empty tool", { runId: "r-1", kind: "tool", line: 1, tool: "" }],
    ["a tool step on line 0", { runId: "r-1", kind: "tool", line: 0, tool: "view" }],
    ["a tool step on a fractional line", { runId: "r-1", kind: "tool", line: 1.5, tool: "view" }],
    ["a tool step with a summary that is not text", { runId: "r-1", kind: "tool", line: 1, tool: "v", summary: 3 }],
    ["a step with a time that is not a timestamp", { runId: "r-1", kind: "message", line: 1, text: "x", at: "soon" }],
    ["a step with a run id that is not one", { runId: "r 1", kind: "message", line: 1, text: "x" }],
    ["a message without text", { runId: "r-1", kind: "message", line: 1 }],
    ["a message with empty text", { runId: "r-1", kind: "message", line: 1, text: "" }],
  ];

  it.each(BROKEN)("returns null for %s", (_what, payload) => {
    expect(parseRunProgress(payload)).toBeNull();
  });

  describe("spend", () => {
    const FIELDS = ["line", "offset", "nanoAiu", "requests", "steps", "omitted", "skipped", "events"] as const;

    it.each(FIELDS)("returns null when %s is missing", (field) => {
      expect(parseRunProgress(withoutField(spend!, field))).toBeNull();
    });

    it.each(FIELDS)("returns null when %s is fractional, negative or not a number", (field) => {
      for (const bad of [1.5, -1, NaN, "3", null]) {
        expect(parseRunProgress(withField(spend!, field, bad))).toBeNull();
      }
    });

    it("refuses a fractional or negative nano-AIU amount", () => {
      for (const nanoAiu of [0.5, -350_000_000, NaN, Infinity, 2 ** 53]) {
        expect(parseRunProgress(withField(spend!, "nanoAiu", nanoAiu))).toBeNull();
      }
    });

    it("accepts the first poll of a run: nothing read yet", () => {
      const first = { ...spend, line: 0, offset: 0, nanoAiu: 0, requests: 0, steps: 0, events: 1 };
      expect(parseRunProgress(first)).not.toBeNull();
    });

    it("needs at least one event: the spend event itself", () => {
      expect(parseRunProgress(withField(spend!, "events", 0))).toBeNull();
    });
  });
});
