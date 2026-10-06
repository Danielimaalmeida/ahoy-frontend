import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Questions (lane 4C replaces the placeholder). */
export const QUESTIONS_ROUTES: Routes = [
  { path: "", title: "Questions · Ahoy", component: Placeholder, data: { heading: "Questions", lane: "4C" } },
];
