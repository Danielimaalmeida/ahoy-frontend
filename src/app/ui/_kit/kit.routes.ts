import type { Routes } from '@angular/router';
import { Kit } from './kit';

/** Component gallery, development builds only (`environment.devRoutes`); the title comes from the parent route. */
export const KIT_ROUTES: Routes = [{ path: '', component: Kit }];
