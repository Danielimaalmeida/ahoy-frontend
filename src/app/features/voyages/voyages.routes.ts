import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Voyages (lane 3A replaces the placeholder). */
export const VOYAGES_ROUTES: Routes = [
  { path: "", title: "Voyages · Ahoy", component: Placeholder, data: { heading: "Voyages", lane: "3A" } },
];
