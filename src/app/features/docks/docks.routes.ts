import type { Routes } from '@angular/router';
import { Docks } from './docks';

/** Backlog: the Jira backlog beside each story's state in Ahoy (see `BacklogPort`). */
export const DOCKS_ROUTES: Routes = [
  { path: '', title: 'Backlog · Ahoy', component: Docks },
];
