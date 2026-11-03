import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { StoryPrComments } from '@core/api/types';
import { VoyageContext } from '../context/voyage-context';

/**
 * The pull request comments of the voyage on screen (`getStoryPrComments`, `ahoy-hosted` design §4, "PR comments"):
 * the reconciler's last count of people's comments without a ruling, and the reviewer's rulings so far. Read when the
 * voyage opens and again when its version moves, except while a run is in progress (no ruling changes then); the API
 * counts every 5 minutes, so nothing is polled here. A failed read keeps what was read before.
 */
@Injectable()
export class PrComments {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);

  private readonly read = signal<StoryPrComments | null>(null);
  private readonly stateSignal = signal<'loading' | 'ready' | 'error'>(
    'loading'
  );
  /** Counts the reads, so that an answer a later read replaced is dropped. */
  private sequence = 0;

  /** The voyage on screen as its key and version (none while running); equal while only other fields change. */
  private readonly target = computed(
    () => {
      const story = this.context.story();
      if (story === null) return null;
      const version = story.status === 'running' ? null : story.version;
      return { key: story.key, version };
    },
    { equal: (a, b) => a?.key === b?.key && a?.version === b?.version }
  );

  /** Whether the comments are in hand; `error` with nothing read leaves the panel with Try again. */
  readonly state = this.stateSignal.asReadonly();

  /** What was read for the voyage on screen; null until then, or when it was read for another voyage. */
  readonly comments = computed((): StoryPrComments | null => {
    const read = this.read();
    return read !== null && read.key === this.context.key() ? read : null;
  });

  constructor() {
    effect(() => {
      const target = this.target();
      if (target !== null) untracked(() => void this.load(target.key));
    });
  }

  /** Reads the voyage's comments again. */
  async load(key = this.context.key()): Promise<void> {
    if (key === null) return;
    const mine = ++this.sequence;
    if (this.read()?.key !== key) this.stateSignal.set('loading');
    const result = await this.api.getStoryPrComments(key);
    if (mine !== this.sequence) return;
    if (result.ok) {
      this.read.set(result.value);
      this.stateSignal.set('ready');
    } else if (this.comments() === null) {
      this.stateSignal.set('error');
    }
  }
}
