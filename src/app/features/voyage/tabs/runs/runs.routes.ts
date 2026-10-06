import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Runs (lane 5A replaces the placeholder). */
export const RUNS_ROUTES: Routes = [
  { path: "", title: "Runs · Ahoy", component: Placeholder, data: { heading: "Runs", lane: "5A" } },
];
