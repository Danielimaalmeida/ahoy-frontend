import type { Routes } from '@angular/router';
import { LogTab } from './log-tab';

/** Activity: every event of the voyage, newest first (lane 5B). */
export const LOG_ROUTES: Routes = [
  { path: '', title: 'Activity · Ahoy', component: LogTab },
];
