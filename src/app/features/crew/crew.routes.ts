import type { Routes } from '@angular/router';
import { CrewPage } from './crew-page';

/** Crew: who is the sprint person and who hosts lunch and the retro, sprint by sprint. 0 AIU. */
export const CREW_ROUTES: Routes = [
  { path: '', title: 'Crew · Ahoy', component: CrewPage },
];
