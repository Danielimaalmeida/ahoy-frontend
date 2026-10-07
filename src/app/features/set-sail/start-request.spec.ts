import { describe, expect, it } from "vitest";
import type { ModelSlot } from "@domain/types";
import type { EffortChoice } from "@ui/model-choice/model-choice";
import {
  budgetNanoAiu,
  budgetProblem,
  buildStartRequest,
  describeAiu,
  keyProblem,
  modelProblem,
  normalizeKey,
  titleProblem,
  type SetSailValues,
} from "./start-request";

const BLANK = { model: "", effort: "" as EffortChoice };

/** A filled-in form with every model left blank; `models` overrides single slots. */
function values(
  overrides: Partial<Omit<SetSailValues, "models">> & { models?: Partial<Record<ModelSlot, typeof BLANK>> } = {},
): SetSailValues {
  const { models, ...rest } = overrides;
  return {
    key: "PROJ-145",
    title: "",
    budget: "25",
    models: {
      intake: BLANK,
      planning: BLANK,
      implementation: BLANK,
      "review-design": BLANK,
      "review-defect": BLANK,
      ...models,
    },
    ...rest,
  };
}

describe("the Jira key text", () => {
  it.each([
    ["PROJ-145", null],
    ["  PROJ-145  ", null],
    ["AB1-7", null],
    ["", "empty"],
    ["   ", "empty"],
    ["proj-145", "pattern"],
    ["P-1", "pattern"],
    ["1PROJ-5", "pattern"],
    ["PROJ145", "pattern"],
    ["PROJ-", "pattern"],
    ["PROJ-12a", "pattern"],
    ["PROJ 145", "pattern"],
    [`${"A".repeat(39)}-1`, "too_long"],
  ] as const)("reads %j as %s", (text, problem) => {
    expect(keyProblem(text)).toBe(problem);
  });

  it("accepts a key of exactly 40 characters", () => {
    expect(keyProblem(`${"A".repeat(37)}-12`)).toBeNull();
  });

  it("writes keys in capitals and trims them", () => {
    expect(normalizeKey("  proj-145 ")).toBe("PROJ-145");
  });
});

describe("the total budget text", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["0", "zero"],
    ["0.0", "zero"],
    ["1e3", "malformed"],
    ["-5", "malformed"],
    ["+5", "malformed"],
    ["25,5", "malformed"],
    ["abc", "malformed"],
    ["25.", "malformed"],
    [".5", "malformed"],
    ["1.1234567890", "decimals"],
    ["9007199254740991", "too_large"],
  ] as const)("refuses %j as %s", (text, problem) => {
    expect(budgetProblem(text)).toBe(problem);
    expect(budgetNanoAiu(text)).toBeNull();
  });

  it.each([
    ["25", 25_000_000_000],
    ["25.5", 25_500_000_000],
    [" 25 ", 25_000_000_000],
    ["0.000000001", 1],
    ["1.123456789", 1_123_456_789],
  ] as const)("reads %j as %d nano-AIU without a float", (text, nano) => {
    expect(budgetProblem(text)).toBeNull();
    expect(budgetNanoAiu(text)).toBe(nano);
  });
});

describe("the request the form sends", () => {
  it("is the key and the budget in nano-AIU when nothing else is filled in", () => {
    expect(buildStartRequest(values())).toStrictEqual({ key: "PROJ-145", budgetNanoAiu: 25_000_000_000 });
  });

  it("carries a model and an effort for a slot the user filled in, and no other slot", () => {
    const request = buildStartRequest(values({ models: { planning: { model: "claude-sonnet-5", effort: "high" } } }));
    expect(request).toStrictEqual({
      key: "PROJ-145",
      budgetNanoAiu: 25_000_000_000,
      models: { planning: { model: "claude-sonnet-5", reasoningEffort: "high" } },
    });
  });

  it("leaves out the effort of a slot with only a model, and the model of a slot with only an effort", () => {
    const request = buildStartRequest(
      values({
        models: {
          intake: { model: " gpt-5.6-terra ", effort: "" },
          implementation: { model: "  ", effort: "max" },
        },
      }),
    );
    expect(request?.models).toEqual({
      intake: { model: "gpt-5.6-terra" },
      implementation: { reasoningEffort: "max" },
    });
  });

  it("has no `models` key when every slot is blank, and no `title` key when the title is blank", () => {
    const request = buildStartRequest(values({ title: "   " }));
    expect(request).not.toBeNull();
    expect(Object.keys(request ?? {})).toEqual(["key", "budgetNanoAiu"]);
  });

  it("trims the title and the key, and writes the key in capitals", () => {
    expect(buildStartRequest(values({ key: " proj-145 ", title: "  Export to CSV  " }))).toStrictEqual({
      key: "PROJ-145",
      title: "Export to CSV",
      budgetNanoAiu: 25_000_000_000,
    });
  });

  it("reads 25.5 as 25 500 000 000 nano-AIU", () => {
    expect(buildStartRequest(values({ budget: "25.5" }))?.budgetNanoAiu).toBe(25_500_000_000);
  });

  it.each([
    ["an invalid key", { key: "nope" }],
    ["an empty budget", { budget: "" }],
    ["a zero budget", { budget: "0" }],
    ["a budget in scientific notation", { budget: "1e3" }],
    ["a title over 500 characters", { title: "x".repeat(501) }],
  ] as const)("is none for %s", (_name, override) => {
    expect(buildStartRequest(values(override))).toBeNull();
  });
});

describe("the AIU amount shown in the button and beside the form", () => {
  it.each([
    [25_000_000_000, "25"],
    [25_500_000_000, "25.5"],
    [1, "0.000000001"],
    [1_123_456_789, "1.123456789"],
    [100_000_000_000, "100"],
  ] as const)("shows %d nano-AIU as %s", (nano, text) => {
    expect(describeAiu(nano)).toBe(text);
  });
});
describe("a typed model id", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["claude-sonnet-5", null],
    ["gpt-5.6-terra", null],
    ["vendor/model:v2_x", null],
    ["model@latest", "pattern"],
    ["-claude", "pattern"],
    ["claude sonnet", "pattern"],
    ["modèle", "pattern"],
    ["a".repeat(201), "too_long"],
  ] as const)("reads %j as %s", (text, problem) => {
    expect(modelProblem(text)).toBe(problem);
  });

  it("keeps the request from being built while a model id would be refused", () => {
    expect(buildStartRequest(values({ models: { planning: { model: "not a model", effort: "" } } }))).toBeNull();
  });
});

describe("the title text", () => {
  it("is fine blank, short, or exactly 500 characters once trimmed", () => {
    expect(titleProblem("")).toBeNull();
    expect(titleProblem("Export to CSV")).toBeNull();
    expect(titleProblem(`${"x".repeat(500)} `)).toBeNull();
  });

  it("counts characters the way the API does (code points), not UTF-16 units", () => {
    expect(titleProblem("😀".repeat(500))).toBeNull();
    expect(titleProblem("😀".repeat(501))).toBe("too_long");
    expect(titleProblem("x".repeat(501))).toBe("too_long");
  });

  it("keeps the request from being built for a title the API would refuse, and sends 500 emoji as they are", () => {
    expect(buildStartRequest(values({ title: "😀".repeat(501) }))).toBeNull();
    expect(buildStartRequest(values({ title: "😀".repeat(500) }))?.title).toBe("😀".repeat(500));
  });
});
