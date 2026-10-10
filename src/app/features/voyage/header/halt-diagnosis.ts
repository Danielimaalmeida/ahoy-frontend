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
import type {
  Diagnosis,
  DiagnosisActor,
  DiagnosisFinding,
} from '@core/api/types';
import { VoyageContext } from '../context/voyage-context';

/** Who a finding asks to act, in words for the banner. */
export const DIAGNOSIS_ACTOR_LABELS: Readonly<Record<DiagnosisActor, string>> =
  {
    story_owner: "For the voyage's owner",
    operator: 'For the Ahoy operators',
    agent_maintainer: "For whoever maintains the agents' instructions",
  };

/** The findings worth showing: none for a diagnosis that only repeats a person's stop, which the banner already says. */
export function shownFindings(
  diagnosis: Diagnosis | null
): readonly DiagnosisFinding[] {
  const findings = diagnosis?.findings ?? [];
  return findings.every((f) => f.kind === 'stopped_by_user') ? [] : findings;
}

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

  /** The diagnosis of the voyage on screen while it is halted; null before it is read and when it is not halted. */
  readonly diagnosis = computed(() => {
    const story = this.context.story();
    const read = this.read();
    return story?.status === 'halted' && read?.key === story.key ? read : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.disposed = true));
    effect(() => {
      const story = this.context.story();
      if (story?.status !== 'halted') return;
      // Every change of the story (a later halt of the same voyage, its version) reads it again.
      const key = story.key;
      untracked(() => void this.load(key));
    });
  }

  private async load(key: string): Promise<void> {
    const generation = ++this.generation;
    const result = await this.api.getStoryDiagnosis(key);
    if (this.disposed || generation !== this.generation || !result.ok) return;
    this.read.set(result.value);
  }
}
