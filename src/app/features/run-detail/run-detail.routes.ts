import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Run detail (lane 5A replaces the placeholder). */
export const RUN_DETAIL_ROUTES: Routes = [
  { path: "", title: "Run · Ahoy", component: Placeholder, data: { heading: "Run detail", lane: "5A" } },
];
