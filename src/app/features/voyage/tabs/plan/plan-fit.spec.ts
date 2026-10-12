import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ok } from '@core/api/api-error';
import type { PlanFit, Story, StoryPlanFit } from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { VoyageContext } from '../../context/voyage-context';
import { PlanFitPanel } from './plan-fit';

/** A plan fit for specs; fictional data. */
function aFit(changes: Partial<PlanFit> = {}): PlanFit {
  return {
    verdict: 'attention',
    reasons: [
      {
        code: 'cross_repo_dependency',
        message: 'Work waits across repositories: WP2 (web) on WP1 (api).',
      },
    ],
    repositories: 2,
    packages: 2,
    criteria: 2,
    longestChain: 2,
    ...changes,
  };
}

describe('PlanFitPanel', () => {
  let api: FakeApi;
  let story: ReturnType<typeof signal<Story | null>>;
  let answer: (key: string) => StoryPlanFit;

  const inReview = (version: number): Story =>
    aStory('PROJ-123', { phase: 'plan_review', version });

  beforeEach(() => {
    api = new FakeApi();
    answer = (key) => ({ key, phase: 'plan_review', fit: aFit() });
    api.on('getStoryPlanFit', (key) => Promise.resolve(ok(answer(key))));
    story = signal<Story | null>(null);
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({
          api,
          clock: new FakeClock('2026-10-06T10:00:00.000Z'),
          net: new FakeFetch(),
        }),
        { provide: VoyageContext, useValue: { story } },
      ],
    });
  });

  async function mount(): Promise<ComponentFixture<PlanFitPanel>> {
    const f = TestBed.createComponent(PlanFitPanel);
    await refresh(f);
    return f;
  }

  async function refresh(f: ComponentFixture<PlanFitPanel>): Promise<void> {
    TestBed.tick();
    await settle();
    f.detectChanges();
  }

  const text = (f: ComponentFixture<PlanFitPanel>): string =>
    (f.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ??
    '';

  it('reads and shows nothing outside plan review', async () => {
    story.set(aStory('PROJ-123', { phase: 'planning' }));
    const f = await mount();
    expect(api.callsOf('getStoryPlanFit')).toHaveLength(0);
    expect(text(f)).toBe('');
  });

  it('shows the verdict, its reasons and the numbers in plan review', async () => {
    story.set(inReview(4));
    const f = await mount();
    expect(api.callsOf('getStoryPlanFit').map((c) => c.args)).toEqual([
      ['PROJ-123'],
    ]);
    expect(text(f)).toContain('Harness fit');
    expect(text(f)).toContain('Weigh before accepting');
    expect(text(f)).toContain(
      'Work waits across repositories: WP2 (web) on WP1 (api).'
    );
    expect(text(f)).toContain('2 repositories · 2 work packages');
    expect(
      (f.nativeElement as HTMLElement).querySelector('.fit__verdict--warn')
    ).not.toBeNull();
  });

  it('says so when nothing works against the harness, and reads again when the version moves', async () => {
    story.set(inReview(4));
    const f = await mount();
    answer = (key) => ({
      key,
      phase: 'plan_review',
      fit: aFit({ verdict: 'fits', reasons: [], repositories: 1 }),
    });
    story.set(inReview(5));
    await refresh(f);
    expect(api.callsOf('getStoryPlanFit')).toHaveLength(2);
    expect(text(f)).toContain('Fits the harness');
    expect(text(f)).toContain('Nothing in the plan works against the harness.');
    expect(text(f)).toContain('1 repository ·');
  });

  it('shows nothing before there is a plan, or when the read fails', async () => {
    answer = (key) => ({ key, phase: 'plan_review', fit: null });
    story.set(inReview(4));
    const f = await mount();
    expect(text(f)).toBe('');
    api.on('getStoryPlanFit', () =>
      Promise.resolve({ ok: false, error: { kind: 'network' } })
    );
    story.set(inReview(5));
    await refresh(f);
    expect(text(f)).toBe('');
  });
});
