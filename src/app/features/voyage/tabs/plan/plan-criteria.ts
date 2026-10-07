import type { StoryCriterion } from "@core/api/story-state";

const HEADING = /^#{1,6}\s+acceptance criteria\s*#*\s*$/i;
const ANY_HEADING = /^#{1,6}\s+\S/;
const ITEM = /^[-*]\s+(AC\d+)\s*:?\s+(.+?)\s*$/i;

/**
 * The criteria the plan itself lists under its "Acceptance criteria" heading (`- AC1 The billing page…`), up to the next
 * heading. The state's `acceptance_criteria` is the source (`criteriaOf`); this is for a state that gives an id without its
 * text, which the plan always has.
 */
export function criteriaInPlan(plan: string | null): readonly StoryCriterion[] {
  if (plan === null) return [];
  const found: StoryCriterion[] = [];
  let inside = false;
  for (const line of plan.split("\n")) {
    if (HEADING.test(line)) {
      inside = true;
    } else if (ANY_HEADING.test(line)) {
      inside = false;
    } else if (inside) {
      const match = ITEM.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined)
        found.push({ id: match[1].toUpperCase(), text: match[2] });
    }
  }
  return found;
}

/** The criteria to show: the state's, else those the plan lists. */
export function criteriaOf(fromState: readonly StoryCriterion[], plan: string | null): readonly StoryCriterion[] {
  return fromState.length > 0 ? fromState : criteriaInPlan(plan);
}
