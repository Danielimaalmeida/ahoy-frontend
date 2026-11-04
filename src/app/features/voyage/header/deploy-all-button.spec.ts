import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ok } from '@core/api/api-error';
import type {
  BranchRelease,
  BranchReleaseAllRequest,
  BranchReleaseBatch,
  Story,
  StoryBranchReleases,
} from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import getStoryBranchReleases from '@testing/fixtures/getStoryBranchReleases.json';
import requestAllBranchReleases from '@testing/fixtures/requestAllBranchReleases.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BranchReleases } from '../context/branch-releases';
import { VoyageContext } from '../context/voyage-context';
import { DeployAllButton } from './deploy-all-button';

/** web and importer have a release workflow, api none; web has two packages on one branch. Fictional data. */
function releasesOf(
  base = getStoryBranchReleases as StoryBranchReleases
): StoryBranchReleases {
  const [web, api] = base.targets as [
    StoryBranchReleases['targets'][number],
    StoryBranchReleases['targets'][number],
  ];
  return {
    ...base,
    targets: [
      web,
      api,
      { ...web, workPackageId: 'WP3' },
      {
        ...web,
        workPackageId: 'WP4',
        repo: 'importer',
        slug: 'github.example.com/example/importer',
        branch: 'feature/PROJ-123-importer',
        prNumber: 9,
        prUrl: 'https://github.example.com/example/importer/pull/9',
      },
    ],
  };
}

describe('DeployAllButton', () => {
  let api: FakeApi;
  let story: Story;
  let read: StoryBranchReleases;
  let sent: BranchReleaseAllRequest[];
  let fixture: ComponentFixture<DeployAllButton>;

  beforeEach(() => {
    api = new FakeApi();
    story = aStory('PROJ-123', {
      phase: 'delivery_gate',
      status: 'awaiting_decision',
    });
    read = releasesOf();
    sent = [];
    const net = new FakeFetch();
    net.stream();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version: story.version, state: {} }))
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
        Promise.resolve(ok({ items: [], lastEventId: null }))
      )
      .on('getStoryBranchReleases', () => Promise.resolve(ok(read)))
      .on('requestAllBranchReleases', (_key, body) => {
        sent.push(body);
        return Promise.resolve(
          ok(requestAllBranchReleases as BranchReleaseBatch)
        );
      });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net }),
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
    TestBed.inject(VoyageContext).open('PROJ-123');
    fixture = TestBed.createComponent(DeployAllButton);
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

  const dialog = (): HTMLElement => {
    const element = document.querySelector<HTMLElement>(
      '.cdk-overlay-container .ah-dialog'
    );
    if (element === null) throw new Error('no dialog open');
    return element;
  };

  const buttonNamed = (
    container: Element,
    label: RegExp
  ): HTMLButtonElement => {
    const found = [...container.querySelectorAll('button')].find((b) =>
      label.test(text(b))
    );
    if (found === undefined) throw new Error(`no button ${String(label)}`);
    return found;
  };

  it('names every repository it would release once, and the ones left out, before sending anything', async () => {
    const root = await render();
    const button = buttonNamed(root, /Release to TEST/);
    expect(button.getAttribute('aria-label')).toBe(
      'Release to TEST: 2 repositories'
    );
    button.click();
    await flush();
    expect(text(dialog())).toContain(
      'Deploy 2 repositories’ branches to TEST?'
    );
    const listed = [
      ...dialog().querySelectorAll('[aria-label="Releases to queue"] li'),
    ].map((li) => text(li));
    expect(listed).toHaveLength(2);
    expect(listed[0]).toContain('web · feature/PROJ-123-web · #42');
    expect(listed[0]).toContain(
      'branch-release.yaml · environment=test · update-ops-tag=true'
    );
    expect(listed[1]).toContain('importer · feature/PROJ-123-importer · #9');
    expect(text(dialog())).toContain(
      'without a release workflow in Team settings › Branch releases: api.'
    );
    expect(sent).toEqual([]);
  });

  it('queues them all in one request with confirm, says what it queued and reads the releases again', async () => {
    const root = await render();
    buttonNamed(root, /Release to TEST/).click();
    await flush();
    const before = api.callsOf('getStoryBranchReleases').length;
    buttonNamed(dialog(), /^Release to TEST$/).click();
    await flush();
    expect(sent).toEqual([{ confirm: true }]);
    expect(api.callsOf('getStoryBranchReleases').length).toBe(before + 1);
    expect(
      document.querySelector('.cdk-overlay-container .ah-dialog')
    ).toBeNull();
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.text)
    ).toContain('Release of web queued; left out: docs (no release workflow).');
  });

  it('shows how many repositories it releases on the button itself', async () => {
    const root = await render();
    expect(text(buttonNamed(root, /Release to TEST/))).toBe(
      'Release to TEST 2'
    );
  });

  it('is not offered without a repository that has a workflow, nor on a cancelled voyage', async () => {
    read = {
      ...releasesOf(),
      targets: releasesOf().targets.map((t) => ({ ...t, workflow: null })),
    };
    let root = await render();
    expect(root.querySelector('button')).toBeNull();

    TestBed.resetTestingModule();
    const net = new FakeFetch();
    net.stream();
    read = releasesOf();
    story = aStory('PROJ-123', {
      phase: 'implementation',
      status: 'cancelled',
    });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net }),
        provideRouter([]),
        VoyageContext,
        BranchReleases,
      ],
    });
    root = await render();
    expect(root.querySelector('button')).toBeNull();
  });

  it('keeps the voyage’s other releases untouched: one per repository, never a second for a shared branch', async () => {
    const root = await render();
    buttonNamed(root, /Release to TEST/).click();
    await flush();
    const repos = [
      ...dialog().querySelectorAll('[aria-label="Releases to queue"] li .repo'),
    ].map((e) => text(e));
    expect(repos).toEqual(['web', 'importer']);
    expect((read.releases as BranchRelease[]).length).toBe(1);
  });
});
