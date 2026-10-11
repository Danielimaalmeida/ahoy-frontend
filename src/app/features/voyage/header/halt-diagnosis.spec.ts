import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ok, type ApiResult } from '@core/api/api-error';
import type { Diagnosis, Story } from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { VoyageContext } from '../context/voyage-context';
import { HaltDiagnosis } from './halt-diagnosis';

/** A diagnosis for specs; fictional data. */
function aDiagnosis(key: string, title = 'The run was refused.'): Diagnosis {
  return {
    key,
    status: 'halted',
    phase: 'planning',
    haltReason: 'preflight_failed',
    findings: [
      {
        kind: 'configuration',
        title,
        evidence: [],
        action: 'Fix the agent profile, then resume.',
        actor: 'agent_maintainer',
        resumable: false,
        runId: null,
      },
    ],
  };
}

describe('HaltDiagnosis', () => {
  let api: FakeApi;
  let story: ReturnType<typeof signal<Story | null>>;

  const halted = (version: number, changes: Partial<Story> = {}): Story =>
    aStory('PROJ-118', {
      status: 'halted',
      haltReason: 'preflight_failed',
      version,
      ...changes,
    });

  beforeEach(() => {
    api = new FakeApi();
    api.on('getStoryDiagnosis', (key) => Promise.resolve(ok(aDiagnosis(key))));
    story = signal<Story | null>(null);
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({
          api,
          clock: new FakeClock('2026-10-06T10:00:00.000Z'),
          net: new FakeFetch(),
        }),
        { provide: VoyageContext, useValue: { story } },
        HaltDiagnosis,
      ],
    });
  });

  /** Lets the effect run and the read it started answer. */
  async function flush(): Promise<void> {
    TestBed.tick();
    await settle();
  }

  const diagnosis = (): HaltDiagnosis => TestBed.inject(HaltDiagnosis);

  it('reads nothing while the voyage is not halted', async () => {
    const reader = diagnosis();
    story.set(aStory('PROJ-118'));
    await flush();
    expect(api.callsOf('getStoryDiagnosis')).toHaveLength(0);
    expect(reader.diagnosis()).toBeNull();
  });

  it('reads the diagnosis when the voyage is halted, and shows it only while it is', async () => {
    const reader = diagnosis();
    story.set(halted(5));
    await flush();
    expect(api.callsOf('getStoryDiagnosis').map((c) => c.args)).toEqual([
      ['PROJ-118'],
    ]);
    expect(reader.diagnosis()?.findings[0]?.title).toBe('The run was refused.');
    story.set(aStory('PROJ-118', { version: 6 }));
    await flush();
    expect(reader.diagnosis()).toBeNull();
  });

  it('does not read again when the story is replaced by one of the same version', async () => {
    diagnosis();
    story.set(halted(5));
    await flush();
    // A refresh that brings the same version, or an unrelated field, is not a new halt.
    story.set(halted(5, { updatedAt: '2026-10-06T09:05:00.000Z' }));
    await flush();
    story.set(halted(5, { spentNanoAiu: 2_000_000_000 }));
    await flush();
    expect(api.callsOf('getStoryDiagnosis')).toHaveLength(1);
  });

  it('reads again when the version moves while the voyage stays halted', async () => {
    const reader = diagnosis();
    story.set(halted(5));
    await flush();
    api.on('getStoryDiagnosis', (key) =>
      Promise.resolve(ok(aDiagnosis(key, 'The run was refused again.')))
    );
    story.set(halted(6));
    await flush();
    expect(api.callsOf('getStoryDiagnosis')).toHaveLength(2);
    expect(reader.diagnosis()?.findings[0]?.title).toBe(
      'The run was refused again.'
    );
  });

  it('drops the answer of a read that a later version replaced', async () => {
    const reader = diagnosis();
    const releases: ((value: ApiResult<Diagnosis>) => void)[] = [];
    api.on(
      'getStoryDiagnosis',
      () => new Promise((resolve) => releases.push(resolve))
    );
    story.set(halted(5));
    TestBed.tick();
    story.set(halted(6));
    TestBed.tick();
    expect(releases).toHaveLength(2);
    releases[1]?.(ok(aDiagnosis('PROJ-118', 'The newer answer.')));
    await settle();
    releases[0]?.(ok(aDiagnosis('PROJ-118', 'The older answer.')));
    await settle();
    expect(reader.diagnosis()?.findings[0]?.title).toBe('The newer answer.');
  });
});
