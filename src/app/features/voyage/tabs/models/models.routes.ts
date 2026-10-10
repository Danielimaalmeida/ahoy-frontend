import type { Routes } from '@angular/router';
import { ModelsTab } from './models-tab';

/** Models: what each phase's next run gets, and the Change models dialog (lane 4D). */
export const MODELS_ROUTES: Routes = [
  { path: '', title: 'Models · Ahoy', component: ModelsTab },
];
