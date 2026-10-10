import type { Routes } from '@angular/router';
import { SetSailPage } from './set-sail-page';

/** Start voyage: `/voyages/new?key=&title=` (lane 3B). The top-level route is lazy, so this feature loads on demand. */
export const SET_SAIL_ROUTES: Routes = [
  { path: '', title: 'Start voyage · Ahoy', component: SetSailPage },
];
