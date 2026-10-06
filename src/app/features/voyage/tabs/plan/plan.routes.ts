import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Plan (lane 4B replaces the placeholder). */
export const PLAN_ROUTES: Routes = [
  { path: "", title: "Plan · Ahoy", component: Placeholder, data: { heading: "Plan", lane: "4B" } },
];
