import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type {
  AhoyEvent,
  BranchRelease,
  BranchReleaseRequest,
  StoryBranchReleases,
  Run,
  Story,
  WorkPackageDecisionRequest,
} from '@core/api/types';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import getStoryBranchReleases from '@testing/fixtures/getStoryBranchReleases.json';
import listStoryRuns from '@testing/fixtures/listStoryRuns.json';
import requestBranchRelease from '@testing/fixtures/requestBranchRelease.json';
import { BranchReleases } from '../../context/branch-releases';
import { VoyageContext } from '../../context/voyage-context';
import { PackagesTab } from './packages-tab';

/** A run for specs, from the fixture's first run; fictional data. */
function aRun(id: string, changes: Partial<Run> = {}): Run {
  return {
    ...(listStoryRuns.items[0] as Run),
    id,
    storyKey: 'PROJ-131',
    phase: 'implementation',
    agent: 'implementer',
    status: 'succeeded',
    ...changes,
  };
}

/** WP1 delivered a fix, WP2 ran the same workflow, found it done and only verified it, WP3 is blocked. */
const STATE = {
  work_packages: [
    {
      id: 'WP1',
      repo: 'billing-api',
      agent: 'implementer',
      open_pr: true,
      status: 'done',
    },
    {
      id: 'WP2',
      repo: 'billing-api',
      agent: 'implementer',
      open_pr: false,
      status: 'done',
      depends_on: ['WP1'],
    },
    {
      id: 'WP3',
      repo: 'billing-web',
      agent: 'implementer',
      open_pr: true,
      status: 'blocked',
      depends_on: ['WP1'],
    },
  ],
};

const EVENTS: readonly AhoyEvent[] = [
  anEvent(1, 'run.queued', {
    runId: 'r-04',
    phase: 'implementation',
    agent: 'implementer',
    workPackage: 'WP1',
  }),
  anEvent(2, 'implementation.reported', {
    runId: 'r-04',
    workPackage: 'WP1',
    status: 'ready',
    report: { delivery_kind: 'changed' },
  }),
  anEvent(3, 'run.queued', {
    runId: 'r-05',
    phase: 'implementation',
    agent: 'implementer',
    workPackage: 'WP2',
  }),
  anEvent(4, 'implementation.reported', {
    runId: 'r-05',
    workPackage: 'WP2',
    status: 'ready',
    report: { delivery_kind: 'verified_existing' },
  }),
  anEvent(5, 'run.queued', {
    runId: 'r-06',
    phase: 'implementation',
    agent: 'implementer',
    workPackage: 'WP3',
  }),
  anEvent(6, 'implementation.reported', {
    runId: 'r-06',
    workPackage: 'WP3',
    status: 'blocked',
    notes: ['implementer is blocked on work package WP3'],
    report: { blocker_question: 'Which currency do totals use?' },
  }),
].map((event) => ({ ...event, storyKey: 'PROJ-131' }));

const RUNS = [aRun('r-04'), aRun('r-05'), aRun('r-06')];

const AIU = 1_000_000_000;

describe('PackagesTab', () => {
  let api: FakeApi;
  let story: Story;
  let state: Record<string, unknown>;
  let events: readonly AhoyEvent[];
  /** What `decideWorkPackage` answers next; the default takes the decision. */
  let answers: (() => Promise<ApiResult<Story>>)[];
  let fixture: ComponentFixture<PackagesTab>;
  let stream: ReturnType<FakeFetch['stream']>;
  let clock: FakeClock;

  const halted = (version = 14): Story =>
    aStory('PROJ-131', {
      phase: 'implementation',
      status: 'halted',
      haltReason: 'package_stuck',
      version,
      budgetNanoAiu: 40 * AIU,
      spentNanoAiu: 12 * AIU,
    });

  beforeEach(() => {
    api = new FakeApi();
    story = halted();
    state = STATE;
    events = EVENTS;
    answers = [];
    const net = new FakeFetch();
    stream = net.stream();
    clock = new FakeClock();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version: story.version, state }))
      )
      .on('listStoryRuns', () => Promise.resolve(ok(RUNS)))
      .on('listQuestions', () => Promise.resolve(ok([])))
      .on('listGateRecords', () => Promise.resolve(ok([])))
      .on('getStoryModels', (key) =>
        Promise.resolve(
          ok({ storyKey: key, version: story.version, slots: [] })
        )
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: events, lastEventId: null }))
      )
      .on('decideWorkPackage', () => {
        const next = answers.shift();
        if (next !== undefined) return next();
        story = {
          ...story,
          status: 'ready',
          haltReason: null,
          version: story.version + 1,
        };
        return Promise.resolve(ok(story));
      });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock, net }),
        provideRouter([]),
        VoyageContext,
        BranchReleases,
      ],
    });
  });

  afterEach(() => {
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  async function render(): Promise<HTMLElement> {
    TestBed.inject(VoyageContext).open('PROJ-131');
    fixture = TestBed.createComponent(PackagesTab);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      await fixture.whenStable();
    }
  }

  const text = (element: Element | null | undefined): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** The label and value of each fact of a card. */
  const facts = (element: Element): string[][] =>
    [...element.querySelectorAll('.packages__facts > div')].map((pair) => [
      text(pair.querySelector('dt')),
      text(pair.querySelector('dd')),
    ]);

  const cards = (root: HTMLElement): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>('.packages__card'),
  ];

  const card = (root: HTMLElement, id: string): HTMLElement => {
    const found = cards(root).find((c) => text(c.querySelector('h3')) === id);
    if (found === undefined) throw new Error(`no card ${id}`);
    return found;
  };

  const dialog = (): HTMLElement => {
    const element = document.querySelector<HTMLElement>(
      '.cdk-overlay-container .ah-dialog'
    );
    if (element === null) throw new Error('no dialog open');
    return element;
  };

  const hasDialog = (): boolean =>
    document.querySelector('.cdk-overlay-container .ah-dialog') !== null;

  const button = (container: Element, label: RegExp): HTMLButtonElement => {
    const found = [...container.querySelectorAll('button')].find((b) =>
      label.test(text(b))
    );
    if (found === undefined) throw new Error(`no button ${String(label)}`);
    return found;
  };

  function typeReason(value: string): void {
    const field = dialog().querySelector('textarea');
    if (field === null) throw new Error('no reason field');
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function tick(): void {
    const box = dialog().querySelector<HTMLInputElement>(
      'input[type=checkbox]'
    );
    if (box === null) throw new Error('no confirmation');
    box.click();
  }

  const decisions = (): readonly unknown[] =>
    api.callsOf('decideWorkPackage').map((c) => c.args);

  it('shows every package with its repository, agent, dependencies and status, and the runs its run.queued names', async () => {
    const root = await render();
    expect(cards(root).map((c) => text(c.querySelector('h3')))).toEqual([
      'WP1',
      'WP2',
      'WP3',
    ]);
    const wp2 = card(root, 'WP2');
    expect(facts(wp2)).toEqual(
      expect.arrayContaining([
        ['Repository', 'billing-api'],
        ['Agent', 'implementer'],
        ['Depends on', 'WP1'],
      ])
    );
    expect(text(wp2.querySelector('.packages__status'))).toBe('Done');
    expect(text(wp2.querySelector('.packages__run'))).toContain(
      'WP2 — implementation · r-05'
    );
    expect(text(wp2.querySelector('.packages__run'))).toContain(
      'found done, only verified'
    );
    expect(wp2.querySelector('.packages__run a')?.getAttribute('href')).toBe(
      '/voyages/PROJ-131/runs/r-05'
    );
    expect(text(card(root, 'WP1').querySelector('.packages__run'))).toContain(
      'WP1 — implementation · r-04'
    );
  });

  it('says where the goal of a package is, without making one up', async () => {
    const root = await render();
    expect(text(root.querySelector('.packages__goal-note'))).toBe(
      "Ahoy's state names no goal for a package. What each one is for is in the plan."
    );
    expect(
      root.querySelector('.packages__goal-note a')?.getAttribute('href')
    ).toBe('/voyages/PROJ-131/plan');
  });

  it('quotes why a blocked package is stuck, and offers Retry and Accept only for it', async () => {
    const root = await render();
    const wp3 = card(root, 'WP3');
    const reason = wp3.querySelector('.packages__reason');
    expect(text(reason?.querySelector('.packages__label'))).toBe('Blocked on');
    expect(text(reason?.querySelector('.packages__text'))).toBe(
      'Which currency do totals use?'
    );
    expect(text(wp3.querySelector('.packages__actions'))).toBe(
      'Retry… Accept…'
    );
    expect(card(root, 'WP1').querySelector('.packages__actions')).toBeNull();
    expect(card(root, 'WP2').querySelector('.packages__actions')).toBeNull();
  });

  it('offers no decision while the voyage is not halted in implementation', async () => {
    story = { ...halted(), status: 'ready', haltReason: null };
    const root = await render();
    expect(root.querySelector('.packages__actions')).toBeNull();
  });

  it('shows the packages before implementation, and says when the plan has none yet', async () => {
    story = aStory('PROJ-131', {
      phase: 'plan_review',
      status: 'awaiting_decision',
    });
    events = [];
    let root = await render();
    expect(cards(root)).toHaveLength(3);
    expect(text(card(root, 'WP1').querySelector('.packages__runs'))).toContain(
      'No run has worked on it yet.'
    );

    TestBed.resetTestingModule();
    state = {};
    // The events still name runs, but without packages in the state there is nothing to show.
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net: new FakeFetch() }),
        provideRouter([]),
        VoyageContext,
        BranchReleases,
      ],
    });
    root = await render();
    expect(text(root.querySelector('ah-empty-state'))).toContain(
      'No work packages yet'
    );
  });

  it('requires a reason and a ticked confirmation before a retry, and says it may spend AIU', async () => {
    const root = await render();
    button(card(root, 'WP3'), /^Retry/).click();
    await flush();
    expect(text(dialog().querySelector('.ah-dialog__title'))).toBe(
      'Retry WP3?'
    );
    expect(text(dialog())).toContain('with your reason as its rework note');
    expect(text(dialog())).toContain('This may spend up to 28.0 AIU');
    const confirm = button(dialog(), /^Retry WP3 · up to 28.0 AIU/);
    expect(confirm.disabled).toBe(true);

    tick();
    await flush();
    expect(confirm.disabled).toBe(false);
    typeReason('   ');
    confirm.click();
    await flush();
    expect(text(dialog().querySelector('.ah-field__error'))).toBe(
      'A reason is required.'
    );
    expect(decisions()).toHaveLength(0);
  });

  it('retries with the reason and the version seen, then reads the story, the packages and the events again', async () => {
    const root = await render();
    button(card(root, 'WP3'), /^Retry/).click();
    await flush();
    typeReason('  Totals use EUR; see the Jira comment.  ');
    tick();
    await flush();
    const readsBefore = api.callsOf('getStoryState').length;
    button(dialog(), /^Retry WP3/).click();
    await flush();
    expect(decisions()).toEqual([
      [
        'PROJ-131',
        'WP3',
        {
          decision: 'retry',
          reason: 'Totals use EUR; see the Jira comment.',
          expectedVersion: 14,
        } satisfies WorkPackageDecisionRequest,
      ],
    ]);
    expect(hasDialog()).toBe(false);
    expect(api.callsOf('getStoryState').length).toBeGreaterThan(readsBefore);
    expect(api.callsOf('listStoryEvents').length).toBeGreaterThan(1);
  });

  it('accepts without promising more than it does: the pull request gates and review still apply, no AIU', async () => {
    const root = await render();
    button(card(root, 'WP3'), /^Accept/).click();
    await flush();
    expect(text(dialog().querySelector('.ah-dialog__title'))).toBe(
      'Accept WP3 as it stands?'
    );
    expect(text(dialog())).toContain('does not approve the voyage');
    expect(text(dialog())).toContain('checked by its gates (CI included)');
    expect(text(dialog())).toContain('Spends no AIU');
    typeReason('Verified by hand on staging.');
    tick();
    await flush();
    button(dialog(), /^Accept WP3$/).click();
    await flush();
    expect(decisions()).toEqual([
      [
        'PROJ-131',
        'WP3',
        {
          decision: 'accept',
          reason: 'Verified by hand on staging.',
          expectedVersion: 14,
        },
      ],
    ]);
  });

  it('sends one request for a double click', async () => {
    let release: (value: ApiResult<Story>) => void = () => undefined;
    answers = [
      () =>
        new Promise<ApiResult<Story>>((resolve) => {
          release = resolve;
        }),
    ];
    const root = await render();
    button(card(root, 'WP3'), /^Retry/).click();
    await flush();
    typeReason('Try again.');
    tick();
    await flush();
    const confirm = button(dialog(), /^Retry WP3/);
    confirm.click();
    confirm.click();
    await flush();
    expect(text(dialog())).toContain('Retrying…');
    confirm.click();
    release(ok({ ...story, status: 'ready', version: 15 }));
    await flush();
    expect(decisions()).toHaveLength(1);
    expect(hasDialog()).toBe(false);
  });

  it('on a version conflict reads the voyage again, keeps the reason and asks to confirm again, never resending on its own', async () => {
    answers = [
      () => {
        // Someone else changed the voyage meanwhile.
        story = { ...story, version: 15 };
        return Promise.resolve(
          fail({
            kind: 'problem',
            status: 409,
            code: 'stale_version',
            title: 'Stale version',
            currentVersion: 15,
          })
        );
      },
    ];
    const root = await render();
    button(card(root, 'WP3'), /^Retry/).click();
    await flush();
    typeReason('Try again.');
    tick();
    await flush();
    button(dialog(), /^Retry WP3/).click();
    await flush();

    expect(decisions()).toHaveLength(1);
    expect(hasDialog()).toBe(true);
    expect(text(dialog().querySelector('.ah-banner'))).toContain(
      'This voyage changed since you opened it'
    );
    expect(dialog().querySelector('textarea')?.value).toBe('Try again.');
    expect(
      dialog().querySelector<HTMLInputElement>('input[type=checkbox]')?.checked
    ).toBe(false);
    expect(button(dialog(), /^Retry WP3/).disabled).toBe(true);

    tick();
    await flush();
    button(dialog(), /^Retry WP3/).click();
    await flush();
    expect(decisions()).toHaveLength(2);
    expect(
      (
        decisions()[1] as readonly [string, string, WorkPackageDecisionRequest]
      )[2].expectedVersion
    ).toBe(15);
    expect(hasDialog()).toBe(false);
  });

  it('after a conflict, says the package can no longer be decided when it moved on, and cannot be confirmed', async () => {
    answers = [
      () => {
        story = { ...story, version: 15 };
        state = {
          work_packages: STATE.work_packages.map((p) =>
            p.id === 'WP3' ? { ...p, status: 'pending' } : p
          ),
        };
        return Promise.resolve(
          fail({
            kind: 'problem',
            status: 409,
            code: 'stale_version',
            title: 'Stale version',
          })
        );
      },
    ];
    const root = await render();
    button(card(root, 'WP3'), /^Accept/).click();
    await flush();
    typeReason('Fine as is.');
    tick();
    await flush();
    button(dialog(), /^Accept WP3$/).click();
    await flush();
    expect(text(dialog())).toContain('WP3 can no longer be decided here');
    tick();
    await flush();
    expect(button(dialog(), /^Accept WP3$/).disabled).toBe(true);
    expect(decisions()).toHaveLength(1);
  });

  it('shows an error the API gives, keeps the dialog and the reason, and the field message of a 400', async () => {
    answers = [
      () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 400,
            code: 'validation_failed',
            title: 'Validation failed',
            errors: [{ path: '/reason', message: 'must not be empty' }],
          })
        ),
      () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 409,
            code: 'invalid_state',
            title: 'Invalid state',
            detail: 'WP3 is pending; only stuck packages need a decision',
          })
        ),
      () => Promise.resolve(fail({ kind: 'network' })),
    ];
    const root = await render();
    button(card(root, 'WP3'), /^Retry/).click();
    await flush();
    typeReason('Try again.');
    tick();
    await flush();

    button(dialog(), /^Retry WP3/).click();
    await flush();
    expect(text(dialog().querySelector('.ah-field__error'))).toBe(
      'must not be empty'
    );

    button(dialog(), /^Retry WP3/).click();
    await flush();
    expect(text(dialog().querySelector('.ah-banner'))).toContain(
      'WP3 is pending; only stuck packages need a decision'
    );

    button(dialog(), /^Retry WP3/).click();
    await flush();
    expect(text(dialog().querySelector('.ah-banner'))).toContain(
      "Can't reach Ahoy"
    );
    expect(dialog().querySelector('textarea')?.value).toBe('Try again.');
    expect(decisions()).toHaveLength(3);
  });
  describe('Deploy to TEST', () => {
    /** WP1's repository has a release workflow and was released before; WP3's has an open pull request and none. */
    const releases = (
      latest: Partial<BranchRelease> = {}
    ): StoryBranchReleases => {
      const base = getStoryBranchReleases as StoryBranchReleases;
      return {
        ...base,
        key: 'PROJ-131',
        targets: [
          { ...base.targets[0]!, workPackageId: 'WP1', repo: 'billing-api' },
          { ...base.targets[1]!, workPackageId: 'WP3', repo: 'billing-web' },
        ],
        releases: [{ ...base.releases[0]!, repo: 'billing-api', ...latest }],
      };
    };
    let read: StoryBranchReleases;
    let sent: BranchReleaseRequest[];

    beforeEach(() => {
      read = releases();
      sent = [];
      api
        .on('getStoryBranchReleases', () => Promise.resolve(ok(read)))
        .on('requestBranchRelease', (_key, body) => {
          sent.push(body);
          read = releases({ id: 'next', status: 'dispatched' });
          return Promise.resolve(ok(requestBranchRelease as BranchRelease));
        });
    });

    it('offers it only on a package whose repository has a workflow, with its newest release, and says why not elsewhere', async () => {
      const root = await render();
      const wp1 = card(root, 'WP1');
      expect(button(wp1, /^Deploy to TEST/).disabled).toBe(false);
      expect(text(wp1.querySelector('.packages__release'))).toContain(
        'Started on GitHub · feature/PROJ-123-web, asked by Alex Example'
      );
      expect(
        wp1.querySelector<HTMLAnchorElement>('.packages__release a')?.href
      ).toContain('/actions/workflows/branch-release.yaml');
      const wp3 = card(root, 'WP3');
      expect(() => button(wp3, /^Deploy to TEST/)).toThrow();
      expect(text(wp3.querySelector('.packages__release'))).toContain(
        'billing-web has no release workflow'
      );
      expect(card(root, 'WP2').querySelector('.packages__release')).toBeNull();
    });

    it('asks first, shows the branch, workflow and inputs, then queues the release with confirm and reads again', async () => {
      const root = await render();
      button(card(root, 'WP1'), /^Deploy to TEST/).click();
      await flush();
      expect(text(dialog())).toContain('Deploy WP1’s branch to TEST?');
      expect(text(dialog())).toContain(
        'environment=test · update-ops-tag=true'
      );
      expect(sent).toEqual([]);
      const before = api.callsOf('getStoryBranchReleases').length;
      button(dialog(), /^Deploy to TEST$/).click();
      await flush();
      expect(sent).toEqual([{ workPackageId: 'WP1', confirm: true }]);
      expect(hasDialog()).toBe(false);
      expect(api.callsOf('getStoryBranchReleases').length).toBe(before + 1);
    });

    it('reads the releases again when the reconciler starts one, though the version does not move', async () => {
      read = releases({ status: 'queued', dispatchedAt: null });
      const root = await render();
      expect(
        text(card(root, 'WP1').querySelector('.packages__release'))
      ).toContain('Queued');
      read = releases({ status: 'dispatched' });
      stream.sendEvent(
        anEvent(
          901,
          'branch_release.dispatched',
          { releaseId: 'r' },
          'PROJ-131'
        )
      );
      await settle();
      await clock.advance(300);
      await flush();
      expect(
        text(card(root, 'WP1').querySelector('.packages__release'))
      ).toContain('Started on GitHub');
    });

    it('reads the releases again when the release is refused, to show the one already queued', async () => {
      api.on('requestBranchRelease', () => {
        read = releases({ id: 'theirs', status: 'queued', dispatchedAt: null });
        return Promise.resolve(
          fail({
            kind: 'problem',
            status: 409,
            code: 'invalid_state',
            title: 'Invalid state',
            detail:
              'A release of feature/PROJ-9-api (PROJ-9) on billing-api is already queued (theirs)',
          })
        );
      });
      const root = await render();
      button(card(root, 'WP1'), /^Deploy to TEST/).click();
      await flush();
      button(dialog(), /^Deploy to TEST$/).click();
      await flush();
      expect(
        text(card(root, 'WP1').querySelector('.packages__release'))
      ).toContain('Queued');
    });

    it("shows GitHub's reason for a release it refused", async () => {
      read = releases({
        status: 'failed',
        error: 'gh workflow run failed: HTTP 422: Unexpected inputs provided',
      });
      const root = await render();
      const release = text(
        card(root, 'WP1').querySelector('.packages__release')
      );
      expect(release).toContain('Refused by GitHub');
      expect(release).toContain('Unexpected inputs provided');
    });
  });
});
