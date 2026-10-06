import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Ship's log (lane 5B replaces the placeholder). */
export const LOG_ROUTES: Routes = [
  { path: "", title: "Ship's log · Ahoy", component: Placeholder, data: { heading: "Ship's log", lane: "5B" } },
];
