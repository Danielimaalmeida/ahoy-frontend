import type { Routes } from '@angular/router';
import { PackagesTab } from './packages-tab';

/** Work packages: the plan's packages, their runs, and Retry / Accept on a stuck one. */
export const PACKAGES_ROUTES: Routes = [
  { path: '', title: 'Work packages · Ahoy', component: PackagesTab },
];
