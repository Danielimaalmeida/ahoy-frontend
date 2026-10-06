import { STORY_KEY_PATTERN, actorLabel, formatTokens, isStoryKey, shortSha } from "./identifiers";

describe("STORY_KEY_PATTERN and isStoryKey", () => {
  const ACCEPTED = ["PROJ-123", "ABC-1", "A1-42", "PROJ-0", "OPS2-987"];
  const REJECTED = ["A-1", "proj-123", "PROJ 123", "PROJ-12A", "PROJ-", "-123", "PROJ-123-4", ""];

  for (const key of ACCEPTED) {
    it(`accepts ${key}`, () => {
      expect(isStoryKey(key)).toBe(true);
      expect(STORY_KEY_PATTERN.test(key)).toBe(true);
    });
  }

  for (const key of REJECTED) {
    it(`rejects "${key}"`, () => {
      expect(isStoryKey(key)).toBe(false);
    });
  }
});

describe("shortSha", () => {
  it("keeps the first seven characters", () => {
    expect(shortSha("a41f9c2b3d4e5f60718293a4b5c6d7e8f9012345")).toBe("a41f9c2");
  });

  it("returns a shorter SHA as it is", () => {
    expect(shortSha("abc")).toBe("abc");
    expect(shortSha("")).toBe("");
  });
});

describe("actorLabel", () => {
  it('shows the system reconciler as "Ahoy"', () => {
    expect(actorLabel("ahoy-reconciler")).toBe("Ahoy");
  });

  it("shows a person by their e-mail", () => {
    expect(actorLabel("alex@example.com")).toBe("alex@example.com");
  });
});

describe("formatTokens", () => {
  const CASES: readonly (readonly [number, string])[] = [
    [0, "0"],
    [999, "999"],
    [1_000, "1k"],
    [18_000, "18k"],
    [164_000, "164k"],
    [182_000, "182k"],
    [1_500_000, "1.5M"],
    [2_000_000, "2M"],
    [12_000_000, "12M"],
  ];

  for (const [tokens, expected] of CASES) {
    it(`shows ${tokens} as "${expected}"`, () => {
      expect(formatTokens(tokens)).toBe(expected);
    });
  }

  it("shows an em dash for a negative or invalid count", () => {
    expect(formatTokens(-1)).toBe("—");
    expect(formatTokens(Number.NaN)).toBe("—");
  });
});
