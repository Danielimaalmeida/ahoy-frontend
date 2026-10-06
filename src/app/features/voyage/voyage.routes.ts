import type { Routes } from "@angular/router";
import { VoyageShell } from "./shell/voyage-shell";

/** `/voyages/:key` and its tabs. Each tab is lazy and owned by its own lane; lane 4A owns this file. */
export const VOYAGE_ROUTES: Routes = [
  {
    path: "",
    component: VoyageShell,
    children: [
      // Lane 4A replaces this with the default tab for the voyage's status (§5.3).
      { path: "", pathMatch: "full", redirectTo: "plan" },
      { path: "plan", loadChildren: () => import("./tabs/plan/plan.routes").then((m) => m.PLAN_ROUTES) },
      {
        path: "questions",
        loadChildren: () => import("./tabs/questions/questions.routes").then((m) => m.QUESTIONS_ROUTES),
      },
      { path: "runs", loadChildren: () => import("./tabs/runs/runs.routes").then((m) => m.RUNS_ROUTES) },
      { path: "gates", loadChildren: () => import("./tabs/gates/gates.routes").then((m) => m.GATES_ROUTES) },
      {
        path: "artifacts",
        loadChildren: () => import("./tabs/artifacts/artifacts.routes").then((m) => m.ARTIFACTS_ROUTES),
      },
      { path: "log", loadChildren: () => import("./tabs/log/log.routes").then((m) => m.LOG_ROUTES) },
      { path: "models", loadChildren: () => import("./tabs/models/models.routes").then((m) => m.MODELS_ROUTES) },
    ],
  },
];
