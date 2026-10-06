import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** The Docks (lane 3C replaces the placeholder). */
export const DOCKS_ROUTES: Routes = [
  { path: "", title: "The Docks · Ahoy", component: Placeholder, data: { heading: "The Docks", lane: "3C" } },
];
