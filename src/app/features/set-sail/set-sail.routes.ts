import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Set sail (lane 3B replaces the placeholder). */
export const SET_SAIL_ROUTES: Routes = [
  { path: "", title: "Set sail · Ahoy", component: Placeholder, data: { heading: "Set sail", lane: "3B" } },
];
