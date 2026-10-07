import type { Routes } from "@angular/router";
import { PlanTab } from "./plan-tab";

/** Plan: the plan, its acceptance criteria and the decision at the plan gate (lane 4B). */
export const PLAN_ROUTES: Routes = [{ path: "", title: "Plan · Ahoy", component: PlanTab }];
