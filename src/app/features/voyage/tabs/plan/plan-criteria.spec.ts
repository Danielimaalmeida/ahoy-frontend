import type { StoryCriterion } from "@core/api/story-state";
import { criteriaOf, criteriaInPlan } from "./plan-criteria";

const PLAN = `# Implementation plan

## Acceptance criteria

- AC1 The billing page shows the due date of each invoice.
- AC2 The invoice list has a due date column.
* AC3: Dates use the viewer's locale format.
- Not a criterion.

## WP1 Due date

- AC9 Mentioned under a work package, not a criterion.
`;

describe("criteriaInPlan", () => {
  it("reads the criteria listed under the Acceptance criteria heading, with or without a colon", () => {
    expect(criteriaInPlan(PLAN)).toEqual([
      { id: "AC1", text: "The billing page shows the due date of each invoice." },
      { id: "AC2", text: "The invoice list has a due date column." },
      { id: "AC3", text: "Dates use the viewer's locale format." },
    ]);
  });

  it("finds none in a plan without that heading, or in nothing", () => {
    expect(criteriaInPlan("# Plan\n\n- AC1 Orphan.\n")).toEqual([]);
    expect(criteriaInPlan(null)).toEqual([]);
  });

  it("stops at the next heading", () => {
    expect(criteriaInPlan("## Acceptance criteria\n\n- AC1 One.\n\n### Notes\n\n- AC2 Two.\n")).toEqual([
      { id: "AC1", text: "One." },
    ]);
  });
});

describe("criteriaOf", () => {
  const fromState: readonly StoryCriterion[] = [{ id: "AC1", text: "From the state." }];

  it("prefers the state's criteria", () => {
    expect(criteriaOf(fromState, PLAN)).toEqual(fromState);
  });

  it("falls back to the plan's own list when the state has none with text", () => {
    expect(criteriaOf([], PLAN)).toHaveLength(3);
    expect(criteriaOf([], null)).toEqual([]);
  });
});
