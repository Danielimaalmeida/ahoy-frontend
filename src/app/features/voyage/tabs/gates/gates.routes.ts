import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Gates (lane 5B replaces the placeholder). */
export const GATES_ROUTES: Routes = [
  { path: "", title: "Gates · Ahoy", component: Placeholder, data: { heading: "Gates", lane: "5B" } },
];
