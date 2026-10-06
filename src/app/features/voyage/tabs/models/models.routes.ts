import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Models (lane 4D replaces the placeholder). */
export const MODELS_ROUTES: Routes = [
  { path: "", title: "Models · Ahoy", component: Placeholder, data: { heading: "Models", lane: "4D" } },
];
