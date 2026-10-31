import type { Routes } from '@angular/router';
import { SettingsPage } from './settings-page';

/** Team settings: the SonarQube servers and repositories, kept in the database and changed by admins. 0 AIU. */
export const SETTINGS_ROUTES: Routes = [
  { path: '', title: 'Team settings · Ahoy', component: SettingsPage },
];
