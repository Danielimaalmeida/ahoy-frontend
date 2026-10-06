import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** All hands (lane 3A replaces the placeholder). */
export const HARBOUR_ROUTES: Routes = [
  { path: "", title: "All hands · Ahoy", component: Placeholder, data: { heading: "All hands", lane: "3A" } },
];
