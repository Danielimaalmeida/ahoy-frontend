import type { Routes } from '@angular/router';
import { VoyagesPage } from './voyages';

/** Voyages (`/voyages`): the list, filtered by `?status=` and `?q=`. */
export const VOYAGES_ROUTES: Routes = [
  { path: '', title: 'Voyages · Ahoy', component: VoyagesPage },
];
