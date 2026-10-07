import { compareEventIds, isEventId, laterEventId } from "./event-id";

describe("event ids", () => {
  it("accepts decimal ids of 1 to 20 digits and nothing else", () => {
    for (const id of ["0", "1", "42", "18446744073709551615", "00012"]) expect(isEventId(id), id).toBe(true);
    for (const id of ["", "-1", "1.5", "1e3", " 1", "1\n", "abc", "123456789012345678901", 42, null]) {
      expect(isEventId(id), String(id)).toBe(false);
    }
  });

  it("orders ids as numbers, beyond the safe integers too", () => {
    expect(compareEventIds("9", "10")).toBeLessThan(0);
    expect(compareEventIds("10", "9")).toBeGreaterThan(0);
    expect(compareEventIds("42", "42")).toBe(0);
    expect(compareEventIds("007", "7")).toBe(0);
    expect(compareEventIds("0", "00")).toBe(0);
    expect(compareEventIds("9007199254740993", "9007199254740992")).toBeGreaterThan(0);
    expect(compareEventIds("18446744073709551615", "18446744073709551614")).toBeGreaterThan(0);
  });

  it("picks the later of two ids, null being before everything", () => {
    expect(laterEventId(null, null)).toBeNull();
    expect(laterEventId(null, "3")).toBe("3");
    expect(laterEventId("3", null)).toBe("3");
    expect(laterEventId("9", "10")).toBe("10");
    expect(laterEventId("10", "9")).toBe("10");
  });
});
