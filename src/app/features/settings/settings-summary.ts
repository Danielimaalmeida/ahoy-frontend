import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type {
  AgentSettingsPage,
  FigmaSettingsPage,
  JiraSettingsPage,
  SonarSettings,
  TeamsSettingsPage,
} from '@core/api/types';
import { jobsOnLabel } from '@domain/agent-settings';

/** One section in the settings' side navigation: its state in a word, and whether it is off. */
export interface SectionState {
  readonly label: string;
  readonly off: boolean;
}

/** "1 server", "2 servers", or "None". */
export function sonarState(settings: SonarSettings): SectionState {
  const n = settings.servers.length;
  if (n === 0) return { label: 'None', off: true };
  return { label: n === 1 ? '1 server' : `${n} servers`, off: false };
}

/** "On" while Jira is connected and its token opens, "Off" otherwise. */
export function jiraState(page: JiraSettingsPage): SectionState {
  if (page.jira === null) return { label: 'Off', off: true };
  return page.tokenReadable
    ? { label: 'On', off: false }
    : { label: 'Token needed', off: true };
}

/** "On" while the crew's channel is connected and its webhook opens, "Off" otherwise. */
export function teamsState(page: TeamsSettingsPage): SectionState {
  if (page.teams === null) return { label: 'Off', off: true };
  return page.webhookReadable
    ? { label: 'On', off: false }
    : { label: 'Webhook needed', off: true };
}

/** "On" while Figma has a token that opens, "Off" otherwise. */
export function figmaState(page: FigmaSettingsPage): SectionState {
  if (page.figma.token === null) return { label: 'Off', off: true };
  return page.tokenReadable
    ? { label: 'On', off: false }
    : { label: 'Token needed', off: true };
}

/** "2 of 4 on", or how many jobs are paused because their profile is gone. */
export function agentsState(page: AgentSettingsPage): SectionState {
  const paused = page.missing.length;
  if (paused > 0) return { label: `${paused} paused`, off: true };
  return { label: jobsOnLabel(page.agents), off: false };
}

/** A section the frame shows a state for. */
export type SettingsSectionKey =
  'sonar' | 'jira' | 'teams' | 'figma' | 'agents';
type Section = SettingsSectionKey;

/**
 * What the Team settings' frame shows around a section: whether the person is an admin and each section's state. The
 * section on show reads its own settings and tells the summary (`claim`, then `…Read`); the summary reads only the
 * other sections, once, so no request is sent twice.
 */
@Injectable()
export class SettingsSummary {
  private readonly api = inject(ApiClient);

  /** Whether the person may change the settings, once known. */
  readonly admin = signal<boolean | null>(null);
  /** SonarQube's state, once read. */
  readonly sonar = signal<SectionState | null>(null);
  /** Jira's state, once read. */
  readonly jira = signal<SectionState | null>(null);
  /** The Teams channel's state, once read. */
  readonly teams = signal<SectionState | null>(null);
  /** Figma's state, once read. */
  readonly figma = signal<SectionState | null>(null);
  /** The agents' jobs' state, once read. */
  readonly agents = signal<SectionState | null>(null);

  /** The sections whose page reads them itself. */
  private readonly claimed = new Set<Section>();

  /** Says a section's page reads its settings, so the summary does not. */
  claim(section: Section): void {
    this.claimed.add(section);
  }

  /** Reads the state of every section no page has claimed; a section that cannot be read shows none. */
  async load(): Promise<void> {
    const [sonar, jira, teams, figma, agents] = await Promise.all([
      this.claimed.has('sonar') ? null : this.api.getSonarSettings(),
      this.claimed.has('jira') ? null : this.api.getJiraSettings(),
      this.claimed.has('teams') ? null : this.api.getTeamsSettings(),
      this.claimed.has('figma') ? null : this.api.getFigmaSettings(),
      this.claimed.has('agents') ? null : this.api.getAgentSettings(),
    ]);
    if (sonar?.ok && this.sonar() === null) this.sonarRead(sonar.value);
    if (jira?.ok && this.jira() === null) this.jiraRead(jira.value);
    if (teams?.ok && this.teams() === null) this.teamsRead(teams.value);
    if (figma?.ok && this.figma() === null) this.figmaRead(figma.value);
    if (agents?.ok && this.agents() === null) this.agentsRead(agents.value);
  }

  /** What the SonarQube section read. */
  sonarRead(settings: SonarSettings): void {
    this.admin.set(settings.canEdit);
    this.sonar.set(sonarState(settings));
  }

  /** What the Jira section read. */
  jiraRead(page: JiraSettingsPage): void {
    this.admin.set(page.canEdit);
    this.jira.set(jiraState(page));
  }

  /** What the Teams section read. */
  teamsRead(page: TeamsSettingsPage): void {
    this.admin.set(page.canEdit);
    this.teams.set(teamsState(page));
  }

  /** What the Figma section read. */
  figmaRead(page: FigmaSettingsPage): void {
    this.admin.set(page.canEdit);
    this.figma.set(figmaState(page));
  }

  /** What the Agents section read. */
  agentsRead(page: AgentSettingsPage): void {
    this.admin.set(page.canEdit);
    this.agents.set(agentsState(page));
  }
}
