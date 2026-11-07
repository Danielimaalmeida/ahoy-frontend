import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '@core/api/api-base';
import { SetupStore } from '@core/stores/setup-store';
import { bannerHeadings, buttonNamed, problem, text } from '@testing/dom';
import getSetup from '@testing/fixtures/getSetup.json';
import keepPhaseDefaults from '@testing/fixtures/keepPhaseDefaults.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SetupPage } from './setup-page';

const BASE = '/api/v1';

describe('the Setup section of Team settings', () => {
  let fixture: ComponentFixture<SetupPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const setupRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/setup` });
  const step = (key: string) =>
    root.querySelector<HTMLElement>(`[data-step="${key}"]`);
  const links = (key: string) =>
    [...(step(key)?.querySelectorAll('a') ?? [])].map((a) => [
      text(a),
      a.getAttribute('href'),
    ]);

  async function open(page: object = getSetup): Promise<void> {
    setupRead().flush(page);
    await settle();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SetupPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    http.verify();
  });

  it('shows how many required steps are done, what is left, and the next step', async () => {
    await open();
    const summary = text(root.querySelector('.summary'));
    expect(text(root.querySelector('.count'))).toMatch(
      /^6 of 8\s*required steps done$/
    );
    expect(summary).toContain(
      '2 to fix here · 1 to check · 6 optional not set'
    );
    expect(summary).toContain('Next: Agents.');
    expect(
      root.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')
    ).toBe('75');
  });

  it('lists the installation read-only and leads an admin to the section that fixes each team step', async () => {
    await open();
    expect(text(step('runs'))).toContain(
      'Agents run with Kubernetes Jobs; live runs are allowed.'
    );
    expect(step('database')?.querySelector('a, button')).toBeNull();
    expect(
      step('mcp')?.querySelector('[role="img"]')?.getAttribute('aria-label')
    ).toBe('Needs a look');
    expect(links('jira')).toEqual([['Open', '/settings/jira']]);
    expect(links('agents')).toEqual([['Fix in Agents', '/settings/agents']]);
    expect(links('phases')).toEqual([['Review', '/settings/phases']]);
    expect(links('meetings')).toEqual([['Set', '/settings/meetings']]);
    expect(links('branch_releases')).toEqual([
      ['Set', '/settings/branch-releases'],
    ]);
    expect(text(step('agents'))).toContain('Required');
    expect(text(step('meetings'))).not.toContain('Required');
  });

  it('lets an admin keep the phases’ defaults, and shows the step done', async () => {
    await open();
    buttonNamed(step('phases')!, 'Keep defaults').click();
    const keep = http.expectOne({
      method: 'POST',
      url: `${BASE}/setup/phases/keep-defaults`,
    });
    keep.flush(keepPhaseDefaults);
    await settle();
    expect(text(step('phases'))).toContain(
      'An admin chose to keep the defaults.'
    );
    expect(links('phases')).toEqual([['Open', '/settings/phases']]);
    expect(text(root.querySelector('.summary'))).toContain('7 of 8');
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.text)
    ).toEqual(['The phases keep their defaults']);
    expect(TestBed.inject(SetupStore).setup()?.requiredDone).toBe(7);
  });

  it('shows a refused keep as a banner and keeps the step as it was', async () => {
    await open();
    buttonNamed(step('phases')!, 'Keep defaults').click();
    http
      .expectOne({ method: 'POST', url: `${BASE}/setup/phases/keep-defaults` })
      .flush(problem('forbidden'), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'content-type': 'application/problem+json' },
      });
    await settle();
    expect(bannerHeadings(root).length).toBe(1);
    expect(text(step('phases'))).toContain(
      'Nobody has reviewed the phases yet'
    );
  });

  it('shows a member the steps with no way to change them, and where the admins are', async () => {
    await open({ ...getSetup, canEdit: false });
    expect(bannerHeadings(root)).toEqual(['Admins finish the setup']);
    expect(links('agents')).toEqual([['Open', '/settings/agents']]);
    expect(step('phases')?.querySelector('button')).toBeNull();
    // Their own token is theirs to set, admin or not.
    expect(links('copilot')).toEqual([['Set', '/settings/copilot-token']]);
    expect(text(step('copilot'))).not.toContain('Required');
    expect(
      [...root.querySelectorAll('ah-banner a')].map((a) =>
        a.getAttribute('href')
      )
    ).toEqual(['/settings/people']);
  });

  it('checks again on demand, and says when the steps cannot be read', async () => {
    await open();
    buttonNamed(root, 'Check again').click();
    setupRead().flush(problem('internal_error'), {
      status: 500,
      statusText: 'Error',
      headers: { 'content-type': 'application/problem+json' },
    });
    await settle();
    expect(bannerHeadings(root).length).toBe(1);
    // The last answer stays on show.
    expect(text(root.querySelector('.summary'))).toContain('6 of 8');
    buttonNamed(root, 'Try again').click();
    setupRead().flush(getSetup);
    await settle();
    expect(bannerHeadings(root)).toEqual([]);
  });
});
