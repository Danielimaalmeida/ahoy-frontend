import type { Routes } from '@angular/router';
import { AgentSettingsPage } from './agent-settings-page';
import { FigmaSettingsPage } from './figma-settings-page';
import { JiraSettingsPage } from './jira-settings-page';
import { PhaseSettingsPage } from './phase-settings-page';
import { SettingsPage } from './settings-page';
import { SettingsShell } from './settings-shell';
import { TeamsSettingsPage } from './teams-settings-page';

/**
 * Team settings: SonarQube, Jira, the crew's Teams channel, Figma, the agents' jobs and the phases, kept in the database and
 * changed by admins, one section per page. Reading and changing them is 0 AIU.
 */
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
      {
        path: 'teams',
        title: 'Teams · Team settings · Ahoy',
        component: TeamsSettingsPage,
      },
      {
        path: 'figma',
        title: 'Figma · Team settings · Ahoy',
        component: FigmaSettingsPage,
      },
      {
        path: 'agents',
        title: 'Agents · Team settings · Ahoy',
        component: AgentSettingsPage,
      },
      {
        path: 'phases',
        title: 'Phases · Team settings · Ahoy',
        component: PhaseSettingsPage,
      },
    ],
  },
];
