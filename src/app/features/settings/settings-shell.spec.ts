import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_BASE } from '@core/api/api-base';
import getJiraSettings from '@testing/fixtures/getJiraSettings.json';
import getSonarSettings from '@testing/fixtures/getSonarSettings.json';
import listJiraSettingsEvents from '@testing/fixtures/listJiraSettingsEvents.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_ROUTES } from './settings.routes';

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
