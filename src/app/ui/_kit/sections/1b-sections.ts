import type { KitSection } from "../kit-section";
import { KitBudgetMeter } from "./1b-budget-meter";
import { KitEmptyState } from "./1b-empty-state";
import { KitFilterChips } from "./1b-filter-chips";
import { KitOutcomePill } from "./1b-outcome-pill";
import { KitPhaseStepper } from "./1b-phase-stepper";
import { KitPipes } from "./1b-pipes";
import { KitSectionTabs } from "./1b-section-tabs";
import { KitSkeleton } from "./1b-skeleton";
import { KitStatusBadge } from "./1b-status-badge";
import { KitToast } from "./1b-toast";
import { KitTopBar } from "./1b-top-bar";

/** Lane 1B's gallery sections, in page order. Lane 1B owns this file: add its sections here, not in `kit.ts`. */
export const KIT_SECTIONS_1B: readonly KitSection[] = [
  { id: "status-badge", title: "StatusBadge", lane: "1B", component: KitStatusBadge },
  { id: "phase-stepper", title: "PhaseStepper", lane: "1B", component: KitPhaseStepper },
  { id: "budget-meter", title: "BudgetMeter", lane: "1B", component: KitBudgetMeter },
  { id: "outcome-pill", title: "OutcomePill", lane: "1B", component: KitOutcomePill },
  { id: "filter-chips", title: "FilterChips", lane: "1B", component: KitFilterChips },
  { id: "section-tabs", title: "SectionTabs", lane: "1B", component: KitSectionTabs },
  { id: "top-bar", title: "TopBar", lane: "1B", component: KitTopBar },
  { id: "empty-state", title: "EmptyState", lane: "1B", component: KitEmptyState },
  { id: "skeleton", title: "Skeleton", lane: "1B", component: KitSkeleton },
  { id: "toast", title: "Toast", lane: "1B", component: KitToast },
  { id: "pipes", title: "Pipes", lane: "1B", component: KitPipes },
];
