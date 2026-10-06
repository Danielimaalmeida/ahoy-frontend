import {
  arrayOf,
  boundedText,
  describe as describeValue,
  guard,
  isRecord,
  isWholeNumber,
  nonEmptyText,
  nullable,
  oneOf,
  optional,
  patterned,
  shape,
  text,
  timestamp,
  wholeNumber,
  type Check,
} from "./guard-kit";

describe("describe", () => {
  const cases: readonly (readonly [unknown, string])[] = [
    [null, "null"],
    [undefined, "undefined"],
    [12.5, "12.5"],
    [NaN, "NaN"],
    [-0, "-0"],
    [true, "true"],
    ["abc", '"abc"'],
    ["line\nbreak", '"line\\nbreak"'],
    [[1, 2], "an array"],
    [{ a: 1 }, "an object"],
    [() => 1, "function"],
    [10n, "bigint"],
  ];
  it.each(cases)("shows %o as %s", (value, shown) => {
    expect(describeValue(value)).toBe(shown);
  });

  it("cuts a long string at 40 characters so a message stays short", () => {
    expect(describeValue("x".repeat(100))).toBe(`"${"x".repeat(40)}"…`);
  });
});

describe("isRecord and isWholeNumber", () => {
  it("accepts objects only, not null or arrays", () => {
    expect([{}, { a: 1 }].every(isRecord)).toBe(true);
    expect([null, [], "x", 1, undefined].some(isRecord)).toBe(false);
  });

  it("accepts whole numbers JavaScript holds exactly and nothing else", () => {
    expect([0, 1, -1, 2 ** 53 - 1].every(isWholeNumber)).toBe(true);
    expect([1.5, NaN, Infinity, -Infinity, 2 ** 53, 1e21, "1", null, undefined].some(isWholeNumber)).toBe(false);
  });
});

describe("primitive checks", () => {
  it("text takes any string, nonEmptyText refuses the empty one", () => {
    expect(text("", "x")).toBeNull();
    expect(text(1, "x")).toBe("x must be a string (got 1)");
    expect(nonEmptyText("a", "x")).toBeNull();
    expect(nonEmptyText("", "x")).toBe('x must be a non-empty string (got "")');
  });

  it("boundedText checks both ends", () => {
    const check = boundedText("1 to 3 characters", 1, 3);
    expect([check("a", "x"), check("abc", "x")]).toEqual([null, null]);
    expect(check("", "x")).toBe('x must be 1 to 3 characters (got "")');
    expect(check("abcd", "x")).toContain('got "abcd"');
  });

  it("patterned checks the length before the pattern", () => {
    const check = patterned("digits", /^[0-9]+$/, 3);
    expect(check("123", "x")).toBeNull();
    expect(check("1234", "x")).toContain("x must be digits");
    expect(check("12a", "x")).toContain("x must be digits");
  });

  it("wholeNumber enforces its bounds and refuses fractions, NaN and infinities", () => {
    const check = wholeNumber("a count from 1 to 5", 1, 5);
    expect([1, 5].map((n) => check(n, "x"))).toEqual([null, null]);
    for (const bad of [0, 6, 2.5, NaN, Infinity, "3", null]) expect(check(bad, "x")).not.toBeNull();
  });

  it("timestamp takes RFC 3339 date-times that Date can read", () => {
    for (const ok of ["2026-10-06T09:48:00Z", "2026-10-06T09:48:00.123Z", "2026-10-06T09:48:00+01:00"]) {
      expect(timestamp(ok, "x")).toBeNull();
    }
    for (const bad of ["2026-10-06", "2026-13-06T09:48:00Z", "2026-10-06T25:00:00Z", "yesterday", 0, null]) {
      expect(timestamp(bad, "x")).not.toBeNull();
    }
  });

  it("oneOf lists what it accepts in its message", () => {
    const check = oneOf(["a", "b"]);
    expect(check("a", "x")).toBeNull();
    expect(check("c", "x")).toBe('x must be one of a, b (got "c")');
    expect(check(1, "x")).toContain("one of a, b");
  });
});

describe("combinators", () => {
  it("nullable accepts null and otherwise defers to the check", () => {
    const check = nullable(text);
    expect([check(null, "x"), check("a", "x")]).toEqual([null, null]);
    expect(check(undefined, "x")).not.toBeNull();
    expect(check(1, "x")).not.toBeNull();
  });

  it("optional accepts an absent value but not null", () => {
    const check = optional(text);
    expect([check(undefined, "x"), check("a", "x")]).toEqual([null, null]);
    expect(check(null, "x")).not.toBeNull();
    expect(check(1, "x")).not.toBeNull();
  });

  it("arrayOf names the index of the first bad item", () => {
    const check = arrayOf(wholeNumber("a count", 0));
    expect(check([], "xs")).toBeNull();
    expect(check([1, 2, 3], "xs")).toBeNull();
    expect(check([1, -2, "x"], "xs")).toBe("xs[1] must be a count (got -2)");
    expect(check("nope", "xs")).toBe('xs must be an array (got "nope")');
  });

  it("shape names the first failing field, tolerates extra fields and refuses non-objects", () => {
    interface Point {
      readonly x: number;
      readonly label?: string;
    }
    const check = shape<Point>({ x: wholeNumber("a count", 0), label: optional(text) });
    expect(check({ x: 1 }, "p")).toBeNull();
    expect(check({ x: 1, label: "a", extra: [] }, "p")).toBeNull();
    expect(check({ x: -1, label: 5 }, "p")).toBe("p.x must be a count (got -1)");
    expect(check({ x: 1, label: 5 }, "p")).toBe("p.label must be a string (got 5)");
    expect(check({}, "p")).toBe("p.x must be a count (got undefined)");
    for (const bad of [null, [], "x", 1]) expect(check(bad, "p")).toContain("p must be an object");
  });

  it("shape runs the checks in the order given", () => {
    const seen: string[] = [];
    const spy =
      (name: string): Check =>
      () => {
        seen.push(name);
        return null;
      };
    shape<{ a: number; b: number; c: number }>({ a: spy("a"), b: spy("b"), c: spy("c") })({}, "p");
    expect(seen).toEqual(["a", "b", "c"]);
  });
});

describe("guard", () => {
  const isCount = guard<number>("Count", wholeNumber("a count", 0));

  it("is a type guard that never throws", () => {
    expect(isCount(3)).toBe(true);
    expect([-1, "3", null, undefined, {}, [], NaN].some(isCount)).toBe(false);
  });

  it("explains a refusal starting from its name, and returns null for what it accepts", () => {
    expect(isCount.explain(3)).toBeNull();
    expect(isCount.explain(-1)).toBe("Count must be a count (got -1)");
  });
});
