import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  mockBackendInterceptor,
  provideMockBackend,
} from '@core/mock/mock-backend';
import { settle, testServer } from '@testing/mock-backend/spec-helpers';
import { routes } from './app.routes';

/**
 * Every route of §5.3 that is still a placeholder, with the placeholder text and the document title it must show. The
 * screens of lane 3A (`/` and `/voyages`) and the Artifacts tab are real now; their feature specs cover them.
 */
const CASES = [
  {
    url: '/no/such/page',
    text: 'Not found',
    lane: '6A',
    title: 'Not found · Ahoy',
  },
] as const;

describe('app routes', () => {
  // The voyage shell (lane 4A) reads the story before it shows a tab: the mock backend answers it.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([mockBackendInterceptor])),
        provideMockBackend(testServer().server),
      ],
    });
  });

  async function open(
    url: string
  ): Promise<{ root: HTMLElement; harness: RouterTestingHarness }> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    for (let i = 0; i < 3; i++) {
      await settle();
      await harness.fixture.whenStable();
    }
    return { root: harness.fixture.nativeElement as HTMLElement, harness };
  }

  for (const c of CASES) {
    it(`shows the lane ${c.lane} placeholder and its title at ${c.url}`, async () => {
      const { root } = await open(c.url);
      expect(root.querySelector('ah-placeholder h1')?.textContent).toBe(c.text);
      expect(root.textContent).toContain(`Not built yet · lane ${c.lane}`);
      expect(document.title).toBe(c.title);
    });
  }

  it('shows the Artifacts tab instead of the retired placeholder', async () => {
    const { root } = await open('/voyages/PROJ-123/artifacts');
    expect(root.querySelector('ah-artifacts-tab')).not.toBeNull();
    expect(root.textContent).toContain('Artifacts');
    expect(root.textContent).not.toContain('Not built yet');
    expect(document.title).toBe('Artifacts · Ahoy');
  });

  it('shows Backlog, the real screen of lane 3C, and its title at /docks', async () => {
    const { root } = await open('/docks');
    expect(root.querySelector('h1')?.textContent).toBe('Backlog');
    expect(root.textContent).toContain(
      "Every user story in the team's Jira backlog"
    );
    expect(root.textContent).not.toContain('Planned screen.');
    expect(root.textContent).not.toContain('Not built yet');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(
      [...root.querySelectorAll('.docks__sprint-name')].map((name) =>
        name.textContent?.trim()
      )
    ).toEqual(['Sprint 12', 'Sprint 13', 'No sprint']);
    expect(document.title).toBe('Backlog · Ahoy');
  });

  it('opens a voyage on its default tab and passes the key to the shell', async () => {
    const { root } = await open('/voyages/PROJ-123');
    // PROJ-123 waits on the plan decision, so it opens on Plan (§5.3).
    expect(TestBed.inject(Router).url).toBe('/voyages/PROJ-123/plan');
    expect(
      root.querySelector("nav[aria-label='Breadcrumb']")?.textContent
    ).toContain('PROJ-123');
    expect(root.querySelector('ah-plan-tab')).not.toBeNull();
  });
});
