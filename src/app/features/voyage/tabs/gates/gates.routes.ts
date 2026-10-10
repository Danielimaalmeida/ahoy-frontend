import type { Routes } from '@angular/router';
import { GatesTab } from './gates-tab';

/** Gates: the voyage's automated checks and human decisions, oldest first (lane 5B). */
export const GATES_ROUTES: Routes = [
  { path: '', title: 'Gates · Ahoy', component: GatesTab },
];
