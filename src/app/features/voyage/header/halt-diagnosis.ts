import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { Diagnosis } from '@core/api/types';
import { VoyageContext } from '../context/voyage-context';

/**
 * The diagnosis of a halted voyage (`getStoryDiagnosis`, design §5 of `ahoy-hosted`), for the Anchored banner. It is
 * read when the voyage is halted and again when its version moves while halted; nothing is read otherwise. A failed
 * read shows nothing: the banner still says what the halt reason means.
 */
@Injectable()
export class HaltDiagnosis {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);
  private readonly read = signal<Diagnosis | null>(null);
  private disposed = false;
  /** Counts reads, so that the answer to a read that was replaced meanwhile is dropped. */
  private generation = 0;

  /** The halted voyage on screen as its key and version; equal while only other fields of the story change. */
  private readonly halt = computed(
    () => {
      const story = this.context.story();
      return story?.status === 'halted'
        ? { key: story.key, version: story.version }
        : null;
    },
    { equal: (a, b) => a?.key === b?.key && a?.version === b?.version }
  );

  /** The diagnosis of the voyage on screen while it is halted; null before it is read and when it is not halted. */
  readonly diagnosis = computed(() => {
    const story = this.context.story();
    const read = this.read();
    return story?.status === 'halted' && read?.key === story.key ? read : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.disposed = true));
    effect(() => {
      const halt = this.halt();
      if (halt === null) return;
      // A later halt of the same voyage moves its version; the same version again reads nothing.
      untracked(() => void this.load(halt.key));
    });
  }

  private async load(key: string): Promise<void> {
    const generation = ++this.generation;
    const result = await this.api.getStoryDiagnosis(key);
    if (this.disposed || generation !== this.generation || !result.ok) return;
    this.read.set(result.value);
  }
}
