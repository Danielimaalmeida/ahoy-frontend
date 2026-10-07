import { FormControl } from "@angular/forms";
import { capChange, capValidator, checkCap, exactAiu } from "./budget-dialog";

const AIU = 1_000_000_000;

describe("exactAiu", () => {
  it("keeps every decimal and drops trailing zeros", () => {
    expect(exactAiu(40 * AIU)).toBe("40");
    expect(exactAiu(12_430_000_000)).toBe("12.43");
    expect(exactAiu(1)).toBe("0.000000001");
  });
});

describe("capChange", () => {
  it("says how much more a higher cap allows, as the Dialogs wireframe", () => {
    expect(capChange(40 * AIU, 30 * AIU)).toBe("Allows up to 10 AIU more");
  });

  it("says how much less a lower cap allows, and when the cap does not change", () => {
    expect(capChange(25 * AIU, 30 * AIU)).toBe("Allows 5 AIU less");
    expect(capChange(30 * AIU, 30 * AIU)).toBe("The cap stays at 30 AIU");
  });
});

describe("capValidator", () => {
  const spent = 12_400_000_000;
  const check = (text: string) => capValidator(() => spent)(new FormControl(text, { nonNullable: true }));

  it("accepts a cap at or above what is spent", () => {
    expect(check("40")).toBeNull();
    expect(check("12.4")).toBeNull();
    expect(check(" 25.5 ")).toBeNull();
  });

  it("refuses a cap below what is spent", () => {
    expect(check("12.399999999")).toEqual({ belowSpent: true });
    expect(check("5")).toEqual({ belowSpent: true });
  });

  it("refuses text that is not an amount, without floats", () => {
    for (const text of ["1e3", "-5", "12,5", "abc", "25.1234567891"]) expect(check(text)).toEqual({ amount: true });
  });

  it("asks for a value when empty, and for more than zero", () => {
    expect(check("  ")).toEqual({ required: true });
    expect(capValidator(() => 0)(new FormControl("0", { nonNullable: true }))).toEqual({ positive: true });
  });
});

describe("checkCap", () => {
  it("gives the cap in nano-AIU, or the reason it is refused", () => {
    expect(checkCap("40.5", 0)).toEqual({ cap: 40_500_000_000 });
    expect(checkCap("10", 12 * AIU)).toEqual({ error: "belowSpent" });
    expect(checkCap("1e3", 0)).toEqual({ error: "amount" });
  });
});
