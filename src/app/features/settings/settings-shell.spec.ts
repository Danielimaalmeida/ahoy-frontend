import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_BASE } from '@core/api/api-base';
import getAgentSettings from '@testing/fixtures/getAgentSettings.json';
import getFigmaSettings from '@testing/fixtures/getFigmaSettings.json';
import getJiraSettings from '@testing/fixtures/getJiraSettings.json';
import getPhaseSettings from '@testing/fixtures/getPhaseSettings.json';
import getSonarSettings from '@testing/fixtures/getSonarSettings.json';
import getTeamsSettings from '@testing/fixtures/getTeamsSettings.json';
import listJiraSettingsEvents from '@testing/fixtures/listJiraSettingsEvents.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_ROUTES } from './settings.routes';
import {
  isAgentSettingsPage,
  isFigmaSettingsPage,
  isPhaseSettingsPage,
  isTeamsSettingsPage,
} from '@core/api/guards';
import type {
  AgentSettingsPage,
  FigmaSettingsPage,
  PhaseSettingsPage,
  TeamsSettingsPage,
} from '@core/api/types';
import {
  agentsState,
  figmaState,
  phasesState,
  teamsState,
} from './settings-summary';

/** A fixture as the type its guard proves. */
function proven<T>(guard: (v: unknown) => v is T, value: unknown): T {
  if (!guard(value)) throw new Error('the fixture does not pass its guard');
  return value;
}
const teams = (v: unknown): TeamsSettingsPage => proven(isTeamsSettingsPage, v);
const figma = (v: unknown): FigmaSettingsPage => proven(isFigmaSettingsPage, v);
const agents = (v: unknown): AgentSettingsPage =>
  proven(isAgentSettingsPage, v);
const phases = (v: unknown): PhaseSettingsPage =>
  proven(isPhaseSettingsPage, v);

const BASE = '/api/v1';

/** The text of an element, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('the Team settings frame', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  /** Lets the answers, the promises after them and the next render finish. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      harness.detectChanges();
      await harness.fixture.whenStable();
    }
  }

  /** Answers every pending read of the settings, as `jira` and `sonar` say. */
  function answerAll(
    jira: object = getJiraSettings,
    sonar: object = getSonarSettings
  ): void {
    for (const r of http.match(`${BASE}/settings/jira`)) r.flush(jira);
    for (const r of http.match(`${BASE}/settings/sonar`)) r.flush(sonar);
    for (const r of http.match(`${BASE}/settings/teams`))
      r.flush(getTeamsSettings);
    for (const r of http.match(`${BASE}/settings/figma`))
      r.flush(getFigmaSettings);
    for (const r of http.match(`${BASE}/settings/agents`))
      r.flush(getAgentSettings);
    for (const r of http.match(`${BASE}/settings/phases`))
      r.flush(getPhaseSettings);
    for (const r of http.match((q) => q.url === `${BASE}/settings/events`))
      r.flush(
        r.request.params.get('section') === 'jira'
          ? listJiraSettingsEvents
          : { items: [] }
      );
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
        provideRouter([{ path: 'settings', children: SETTINGS_ROUTES }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  it('opens on SonarQube, names each section with its state and marks the one on show', async () => {
    await harness.navigateByUrl('/settings');
    answerAll();
    await settle();
    const root =
      harness.routeNativeElement?.closest('ah-settings-shell') ?? document.body;
    const nav = document.querySelector('[aria-label="Settings sections"]');
    const links = [...(nav?.querySelectorAll('a') ?? [])];
    expect(links.map((a) => text(a))).toEqual([
      'SonarQube 2 servers',
      'Jira On',
      'Teams On',
      'Figma On',
      'Agents 2 of 4 on',
      'Phases 1 changed',
    ]);
    expect(links[0]?.getAttribute('aria-current')).toBe('page');
    expect(text(document.querySelector('h1'))).toBe('Team settings');
    expect(text(document.querySelector('h2'))).toBe('SonarQube');
    expect(text(root)).toContain('You can change these · admin');

    links[1]?.click();
    await settle();
    answerAll();
    await settle();
    expect(text(document.querySelector('h2'))).toBe('Jira');
    expect(links[1]?.getAttribute('aria-current')).toBe('page');
    expect(links[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('reads each section once: the one on show for itself, the others for the navigation', async () => {
    await harness.navigateByUrl('/settings/jira');
    await settle();
    for (const section of [
      'jira',
      'sonar',
      'teams',
      'figma',
      'agents',
      'phases',
    ])
      expect(http.match(`${BASE}/settings/${section}`), section).toHaveLength(
        1
      );
    for (const r of http.match((q) => q.url === `${BASE}/settings/events`))
      r.flush({ items: [] });
  });

  it('shows Jira as needing its token when the API cannot open the stored one', async () => {
    await harness.navigateByUrl('/settings/sonar');
    await settle();
    answerAll({ ...getJiraSettings, tokenReadable: false });
    await settle();
    expect(
      text(document.querySelector('[aria-label="Settings sections"]'))
    ).toContain('Jira Token needed');
  });

  it("shows Jira as off, and keeps the section's state current after it reads again", async () => {
    await harness.navigateByUrl('/settings/jira');
    answerAll({ ...getJiraSettings, jira: null, canEdit: false });
    await settle();
    const nav = document.querySelector('[aria-label="Settings sections"]');
    expect(text(nav)).toContain('Jira Off');
    expect(nav?.querySelector('.nav__state--off')).not.toBeNull();
    expect(text(document.body)).not.toContain('You can change these');
  });
});

describe('the state of the Teams, Figma, Agents and Phases sections in the navigation', () => {
  it('says Off, On, or what is needed for the channel and the token', () => {
    expect(teamsState(teams({ ...getTeamsSettings, teams: null }))).toEqual({
      label: 'Off',
      off: true,
    });
    expect(teamsState(teams(getTeamsSettings))).toEqual({
      label: 'On',
      off: false,
    });
    expect(
      teamsState(teams({ ...getTeamsSettings, webhookReadable: false }))
    ).toEqual({
      label: 'Webhook needed',
      off: true,
    });
    expect(
      figmaState(
        figma({
          ...getFigmaSettings,
          figma: { ...getFigmaSettings.figma, token: null },
        })
      )
    ).toEqual({
      label: 'Off',
      off: true,
    });
    expect(
      figmaState(figma({ ...getFigmaSettings, tokenReadable: false }))
    ).toEqual({ label: 'Token needed', off: true });
  });

  it('counts the jobs on, and the paused ones first', () => {
    expect(agentsState(agents(getAgentSettings))).toEqual({
      label: '2 of 4 on',
      off: false,
    });
    expect(
      agentsState(
        agents({
          ...getAgentSettings,
          missing: [
            { job: 'refinementAgent', name: 'Pre-refinement', profile: 'old' },
          ],
        })
      )
    ).toEqual({ label: '1 paused', off: true });
  });

  it('says the phases are as deployed, or how many an admin changed', () => {
    expect(phasesState(phases(getPhaseSettings))).toEqual({
      label: '1 changed',
      off: false,
    });
    const asDeployed = getPhaseSettings.phases.map((p) => ({
      ...p,
      saved: getPhaseSettings.phases[0]?.saved,
    }));
    expect(
      phasesState(phases({ ...getPhaseSettings, phases: asDeployed }))
    ).toEqual({ label: 'As deployed', off: false });
    expect(
      phasesState(
        phases({
          ...getPhaseSettings,
          phases: asDeployed,
          catalog: {
            ...getPhaseSettings.catalog,
            saved: getPhaseSettings.catalog.models,
          },
        })
      )
    ).toEqual({ label: 'Models changed', off: false });
  });
});
