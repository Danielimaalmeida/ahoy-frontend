import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ok } from '@core/api/api-error';
import type { AhoyEvent, Story } from '@core/api/types';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { VoyageContext } from '../context/voyage-context';
import { CiWaitBanner } from './ci-wait-banner';

const RUNNING =
  'PR #7 has 2 check(s) still running (build, e2e); poll again rather than recording ready';

/** The reconciler's waiting batch: the step's `child_ready` verdict and the routing it wrote with it. */
const WAITING: readonly AhoyEvent[] = [
  anEvent(1, 'run.queued', {
    runId: 'r-05',
    phase: 'implementation',
    workPackage: 'WP2',
  }),
  anEvent(2, 'implementation.reported', {
    runId: 'r-05',
    workPackage: 'WP2',
    status: 'ready',
  }),
  {
    ...anEvent(3, 'gate.evaluated', {
      gate: 'child_ready',
      code: 1,
      result: 'fail',
      message: RUNNING,
    }),
    createdAt: '2026-10-06T10:00:00.000Z',
  },
  {
    ...anEvent(4, 'story.routed', { phase: 'implementation' }),
    createdAt: '2026-10-06T10:00:00.000Z',
  },
].map((event) => ({ ...event, storyKey: 'PROJ-131' }));

const STATE = {
  work_packages: [
    {
      id: 'WP2',
      repo: 'billing-api',
      agent: 'implementer',
      open_pr: true,
      status: 'in_progress',
    },
  ],
  child_repos: [
    {
      repo: 'billing-api',
      pr_url: 'https://github.example/luta/billing-api/pull/7',
      pr_number: 7,
      pr_state: 'OPEN',
    },
  ],
};

describe('CiWaitBanner', () => {
  let story: Story;
  let events: readonly AhoyEvent[];
  let state: Record<string, unknown>;
  let fixture: ComponentFixture<CiWaitBanner>;

  beforeEach(() => {
    state = STATE;
    story = aStory('PROJ-131', {
      phase: 'implementation',
      status: 'ready',
      currentRunId: null,
    });
    events = WAITING;
    const api = new FakeApi();
    const net = new FakeFetch();
    net.stream();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version: story.version, state }))
      )
      .on('listStoryRuns', () => Promise.resolve(ok([])))
      .on('listQuestions', () => Promise.resolve(ok([])))
      .on('listGateRecords', () => Promise.resolve(ok([])))
      .on('getStoryModels', (key) =>
        Promise.resolve(
          ok({ storyKey: key, version: story.version, slots: [] })
        )
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: events, lastEventId: null }))
      );
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net }),
        provideRouter([]),
        VoyageContext,
      ],
    });
  });

  async function flush(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      await fixture.whenStable();
    }
  }

  async function render(): Promise<HTMLElement> {
    TestBed.inject(VoyageContext).open('PROJ-131');
    fixture = TestBed.createComponent(CiWaitBanner);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('says Ahoy waits for CI, with the pull request link, the count and the names of the checks', async () => {
    const root = await render();
    const banner = root.querySelector('ah-banner');
    expect(text(banner)).toContain('Waiting for CI on the pull request');
    expect(text(banner)).toContain('no agent is running');
    const link = banner?.querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      'https://github.example/luta/billing-api/pull/7'
    );
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(text(banner?.querySelector('li') ?? null)).toContain(
      '2 checks still running: build, e2e'
    );
  });

  it('is gone once a run is queued after the waiting batch', async () => {
    const root = await render();
    expect(root.querySelector('ah-banner')).not.toBeNull();
    events = [
      ...WAITING,
      {
        ...anEvent(5, 'run.queued', { runId: 'r-07', workPackage: 'WP3' }),
        storyKey: 'PROJ-131',
      },
    ];
    story = { ...story, status: 'running', currentRunId: 'r-07' };
    await TestBed.inject(VoyageContext).refresh();
    await flush();
    expect(root.querySelector('ah-banner')).toBeNull();
  });

  it('is gone once the voyage halts', async () => {
    const root = await render();
    story = { ...story, status: 'halted', haltReason: 'package_stuck' };
    await TestBed.inject(VoyageContext).refresh();
    await flush();
    expect(root.querySelector('ah-banner')).toBeNull();
  });

  it('names the repositories a pull request could be in, without a link, when two record its number', async () => {
    state = {
      ...STATE,
      child_repos: [
        ...STATE.child_repos,
        {
          repo: 'billing-web',
          pr_url: 'https://github.example/luta/billing-web/pull/7',
          pr_number: 7,
          pr_state: 'OPEN',
        },
      ],
    };
    // One batch, as the reconciler writes it: both verdicts, then the routing note.
    const second = {
      ...anEvent(4, 'gate.evaluated', {
        gate: 'child_ready',
        code: 1,
        result: 'fail',
        message:
          'PR #7 has 1 check(s) still running (lint); poll again rather than recording ready',
      }),
      storyKey: 'PROJ-131',
      createdAt: '2026-10-06T10:00:00.000Z',
    };
    const routed = {
      ...anEvent(5, 'story.routed', { phase: 'implementation' }),
      storyKey: 'PROJ-131',
      createdAt: '2026-10-06T10:00:00.000Z',
    };
    events = [...WAITING.slice(0, 3), second, routed];
    const root = await render();
    const items = [...root.querySelectorAll('ah-banner li')].map(text);
    expect(items).toEqual([
      'PR #7 in billing-api or billing-web · 2 checks still running: build, e2e',
      'PR #7 in billing-api or billing-web · 1 check still running: lint',
    ]);
    expect(root.querySelector('ah-banner a')).toBeNull();
  });

  it('shows nothing for a ready voyage whose last verdict is not a CI wait', async () => {
    events = WAITING.slice(0, 2);
    const root = await render();
    expect(root.querySelector('ah-banner')).toBeNull();
  });
});
