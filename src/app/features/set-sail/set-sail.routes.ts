import type { Routes } from "@angular/router";
import { SetSailPage } from "./set-sail-page";

/** Set sail: `/voyages/new?key=&title=` (lane 3B). The top-level route is lazy, so this feature loads on demand. */
export const SET_SAIL_ROUTES: Routes = [{ path: "", title: "Set sail · Ahoy", component: SetSailPage }];
