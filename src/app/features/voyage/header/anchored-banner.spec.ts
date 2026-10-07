import { afterTitle, slotToChange } from "./anchored-banner";

describe("afterTitle", () => {
  it("keeps what the vocabulary says beyond the title's sentence", () => {
    expect(
      afterTitle(
        "The voyage has spent its whole AIU budget. Raise the budget, then resume.",
        "The voyage has spent its whole AIU budget.",
      ),
    ).toBe("Raise the budget, then resume.");
  });

  it("gives nothing when the text is only the title's sentence, and the whole text when it does not start with it", () => {
    expect(afterTitle("Ahoy couldn't start.", "Ahoy couldn't start.")).toBe("");
    expect(afterTitle("worker_on_fire", "something else")).toBe("worker_on_fire");
  });
});

describe("slotToChange", () => {
  it("takes the one slot of the phase", () => {
    expect(slotToChange([{ slot: "planning" }], "planning")).toBe("planning");
  });

  it("gives none for the two Lookouts of pr_review: the person picks in the Models tab", () => {
    expect(slotToChange([{ slot: "review-design" }, { slot: "review-defect" }], "pr_review")).toBeNull();
  });

  it("falls back to the phase name while the model plan is not read, if it names a slot", () => {
    expect(slotToChange([], "implementation")).toBe("implementation");
    expect(slotToChange([], "plan_review")).toBeNull();
  });
});
