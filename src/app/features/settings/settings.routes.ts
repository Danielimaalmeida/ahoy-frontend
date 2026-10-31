import type { Routes } from '@angular/router';
import { JiraSettingsPage } from './jira-settings-page';
import { SettingsPage } from './settings-page';
import { SettingsShell } from './settings-shell';

/** Team settings: SonarQube and Jira, kept in the database and changed by admins, one section per page. 0 AIU. */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: SettingsShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'sonar' },
      {
        path: 'sonar',
        title: 'SonarQube · Team settings · Ahoy',
        component: SettingsPage,
      },
      {
        path: 'jira',
        title: 'Jira · Team settings · Ahoy',
        component: JiraSettingsPage,
      },
    ],
  },
];
