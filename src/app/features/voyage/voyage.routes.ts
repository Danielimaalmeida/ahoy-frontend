import type { Routes } from '@angular/router';
import { VoyageDefaultTab } from './context/default-tab';
import { VoyageShell } from './shell/voyage-shell';

/**
 * `/voyages/:key` and its tabs. Each tab is lazy and owned by its own lane; lane 4A owns this file. The tabs inject the
 * `VoyageContext` the shell provides. `/voyages/:key` itself opens the default tab for the voyage's status (§5.3).
 */
export const VOYAGE_ROUTES: Routes = [
  {
    path: '',
    component: VoyageShell,
    children: [
      { path: '', pathMatch: 'full', component: VoyageDefaultTab },
      {
        path: 'plan',
        loadChildren: () =>
          import('./tabs/plan/plan.routes').then((m) => m.PLAN_ROUTES),
      },
      {
        path: 'questions',
        loadChildren: () =>
          import('./tabs/questions/questions.routes').then(
            (m) => m.QUESTIONS_ROUTES
          ),
      },
      {
        path: 'runs',
        loadChildren: () =>
          import('./tabs/runs/runs.routes').then((m) => m.RUNS_ROUTES),
      },
      {
        path: 'gates',
        loadChildren: () =>
          import('./tabs/gates/gates.routes').then((m) => m.GATES_ROUTES),
      },
      {
        path: 'artifacts',
        loadChildren: () =>
          import('./tabs/artifacts/artifacts.routes').then(
            (m) => m.ARTIFACTS_ROUTES
          ),
      },
      {
        path: 'log',
        loadChildren: () =>
          import('./tabs/log/log.routes').then((m) => m.LOG_ROUTES),
      },
      {
        path: 'models',
        loadChildren: () =>
          import('./tabs/models/models.routes').then((m) => m.MODELS_ROUTES),
      },
    ],
  },
];
