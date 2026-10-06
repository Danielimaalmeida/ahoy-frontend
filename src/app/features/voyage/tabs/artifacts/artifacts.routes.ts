import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Artifacts (lane 5C replaces the placeholder). */
export const ARTIFACTS_ROUTES: Routes = [
  { path: "", title: "Artifacts · Ahoy", component: Placeholder, data: { heading: "Artifacts", lane: "5C" } },
];
