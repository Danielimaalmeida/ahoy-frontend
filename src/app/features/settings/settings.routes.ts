import type { Routes } from '@angular/router';
import { AgentSettingsPage } from './agent-settings-page';
import { BranchReleaseSettingsPage } from './branch-release-settings-page';
import { ConfluenceSettingsPage } from './confluence-settings-page';
import { CopilotTokenPage } from './copilot-token-page';
import { DefectSettingsPage } from './defect-settings-page';
import { FigmaSettingsPage } from './figma-settings-page';
import { JiraSettingsPage } from './jira-settings-page';
import { MeetingSettingsPage } from './meeting-settings-page';
import { PeopleSettingsPage } from './people-settings-page';
import { PhaseSettingsPage } from './phase-settings-page';
import { PrCommentSettingsPage } from './pr-comment-settings-page';
import { SettingsPage } from './settings-page';
import { SettingsShell } from './settings-shell';
import { SetupPage } from './setup-page';
import { TeamsSettingsPage } from './teams-settings-page';

/**
 * Team settings: Setup first (what is still needed before stories run), then SonarQube, Jira, Confluence, the crew's
 * Teams channel, Figma, the agents' jobs, the phases, pull request comments, the defect watch, branch releases, the names of a
 * meeting's two sides and who may use Ahoy, kept in the database and changed by admins, one section per page; last, the
 * person's own Copilot token. Reading and changing them is 0 AIU.
 */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: SettingsShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'setup' },
      {
        path: 'setup',
        title: 'Setup · Team settings · Ahoy',
        component: SetupPage,
      },
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
        path: 'confluence',
        title: 'Confluence · Team settings · Ahoy',
        component: ConfluenceSettingsPage,
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
      {
        path: 'pr-comments',
        title: 'Pull request comments · Team settings · Ahoy',
        component: PrCommentSettingsPage,
      },
      {
        path: 'defects',
        title: 'Defects · Team settings · Ahoy',
        component: DefectSettingsPage,
      },
      {
        path: 'branch-releases',
        title: 'Branch releases · Team settings · Ahoy',
        component: BranchReleaseSettingsPage,
      },
      {
        path: 'meetings',
        title: 'Meetings · Team settings · Ahoy',
        component: MeetingSettingsPage,
      },
      {
        path: 'people',
        title: 'People · Team settings · Ahoy',
        component: PeopleSettingsPage,
      },
      {
        path: 'copilot-token',
        title: 'My Copilot token · Team settings · Ahoy',
        component: CopilotTokenPage,
      },
    ],
  },
];
