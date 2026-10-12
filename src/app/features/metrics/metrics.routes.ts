import type { Routes } from '@angular/router';
import { MetricsCost } from './metrics-cost';
import { MetricsGates } from './metrics-gates';
import { MetricsHalts } from './metrics-halts';
import { MetricsOverview } from './metrics-overview';
import { MetricsShell } from './metrics-shell';

/** Metrics: the overview and its three sections, which share the shell's `MetricsStore`. Read-only, 0 AIU. */
export const METRICS_ROUTES: Routes = [
  {
    path: '',
    component: MetricsShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Metrics · Ahoy',
        component: MetricsOverview,
      },
      { path: 'cost', title: 'Cost · Metrics · Ahoy', component: MetricsCost },
      {
        path: 'halts',
        title: 'Halts & errors · Metrics · Ahoy',
        component: MetricsHalts,
      },
      {
        path: 'gates',
        title: 'Gates & human wait · Metrics · Ahoy',
        component: MetricsGates,
      },
    ],
  },
];
