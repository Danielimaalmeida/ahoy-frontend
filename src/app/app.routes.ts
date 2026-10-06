import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";
import { environment } from "../environments/environment";

/**
 * Top-level routes (§5.3 of the plan): one lazy `loadChildren` per feature, so lanes never edit this file.
 * Order matters: `voyages/new` and the run detail come before `voyages/:key`.
 */
export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    loadChildren: () => import("@features/harbour/harbour.routes").then((m) => m.HARBOUR_ROUTES),
  },
  {
    path: "voyages/new",
    loadChildren: () => import("@features/set-sail/set-sail.routes").then((m) => m.SET_SAIL_ROUTES),
  },
  {
    path: "voyages/:key/runs/:runId",
    loadChildren: () => import("@features/run-detail/run-detail.routes").then((m) => m.RUN_DETAIL_ROUTES),
  },
  {
    path: "voyages/:key",
    loadChildren: () => import("@features/voyage/voyage.routes").then((m) => m.VOYAGE_ROUTES),
  },
  {
    path: "voyages",
    loadChildren: () => import("@features/voyages/voyages.routes").then((m) => m.VOYAGES_ROUTES),
  },
  {
    path: "docks",
    loadChildren: () => import("@features/docks/docks.routes").then((m) => m.DOCKS_ROUTES),
  },
  ...environment.devRoutes,
  // Lane 6A replaces this with the "not found" state.
  { path: "**", title: "Not found · Ahoy", component: Placeholder, data: { heading: "Not found", lane: "6A" } },
];
