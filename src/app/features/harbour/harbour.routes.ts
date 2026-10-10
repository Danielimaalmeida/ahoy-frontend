import type { Routes } from '@angular/router';
import { AllHandsPage } from './all-hands';

/** Needs you (`/`): the voyages that wait on a person, and the ones in progress. */
export const HARBOUR_ROUTES: Routes = [
  { path: '', title: 'Needs you · Ahoy', component: AllHandsPage },
];
