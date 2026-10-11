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
import { isInvalidState, type ApiResult } from '@core/api/api-error';
import type { Refinement } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import { isActiveRefinement } from '@domain/refinement';
import { VoyageContext } from '../context/voyage-context';

/** How often a diagnosis in progress is read again: it sends no events. */
export const AGENT_DIAGNOSIS_POLL_MS = 5_000;

/**
 * The agent diagnoses of the halted voyage on screen (`listAgentDiagnoses`, design §5 of `ahoy-hosted`), provided by the
 * Anchored banner. They are read when the voyage is halted and again when its version moves while halted; while the
 * newest is queued or running the list is read again every {@link AGENT_DIAGNOSIS_POLL_MS}, and nothing is polled
 * otherwise. A request or a cancel shows its answer at once, and a read that began before it and answers after it does
 * not take that answer away. A failed read keeps what was read before.
 */
@Injectable()
export class AgentDiagnoses {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);
  private readonly clock = inject(CLOCK);

  private readonly read = signal<{
    readonly key: string;
    readonly items: readonly Refinement[];
  } | null>(null);
  private readonly stateSignal = signal<'loading' | 'ready' | 'error'>(
    'loading'
  );
  private timer: Timer | null = null;
  private disposed = false;
  /** Counts the reads and the answers to a request or a cancel, so that an answer a later one replaced is dropped. */
  private sequence = 0;

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

  /** Whether the diagnoses are in hand; `error` leaves the banner without them, still offering to ask. */
  readonly state = this.stateSignal.asReadonly();

  /** The newest agent diagnosis of the voyage on screen while it is halted, with its Markdown once it succeeded. */
  readonly newest = computed((): Refinement | null => {
    const story = this.context.story();
    const read = this.read();
    return story?.status === 'halted' && read?.key === story.key
      ? (read.items[0] ?? null)
      : null;
  });

  /** Whether the newest is still in progress: queued for a run slot, or running. */
  readonly active = computed(() => {
    const newest = this.newest();
    return newest !== null && isActiveRefinement(newest.status);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
    effect(() => {
      const halt = this.halt();
      if (halt === null) {
        untracked(() => this.stopPolling());
        return;
      }
      // A later halt of the same voyage moves its version; the same version again reads nothing.
      untracked(() => void this.load(halt.key));
    });
  }

  /**
   * Asks an agent to diagnose the voyage (`confirmSpend: true`); on success the banner shows it queued at once. Empty
   * notes and a missing limit are left out of the request. A `409 invalid_state` (one is already in progress, or the
   * voyage is not halted any more) reads the voyage's diagnoses again.
   */
  async request(
    notes: string,
    budgetNanoAiu: number | null
  ): Promise<ApiResult<Refinement>> {
    const key = this.context.story()?.key ?? '';
    const result = await this.api.requestAgentDiagnosis(key, {
      confirmSpend: true,
      ...(notes !== '' ? { notes } : {}),
      ...(budgetNanoAiu !== null ? { budgetNanoAiu } : {}),
    });
    if (this.disposed) return result;
    if (result.ok) this.accept(key, result.value);
    else if (isInvalidState(result.error)) void this.load(key);
    return result;
  }

  /** Stops the voyage's diagnosis in progress; on success the banner shows it cancelled, or being cancelled. */
  async cancel(reason: string): Promise<ApiResult<Refinement>> {
    const key = this.context.story()?.key ?? '';
    const result = await this.api.cancelAgentDiagnosis(key, { reason });
    if (this.disposed) return result;
    if (result.ok) this.accept(key, result.value);
    else if (isInvalidState(result.error)) void this.load(key);
    return result;
  }

  /** Reads the voyage's diagnoses, newest first; an answer a later read or an accepted answer replaced is dropped. */
  private async load(key: string): Promise<void> {
    const sequence = ++this.sequence;
    const result = await this.api.listAgentDiagnoses(key);
    if (this.disposed || sequence !== this.sequence) return;
    if (result.ok) {
      this.read.set({ key, items: result.value.items });
      this.stateSignal.set('ready');
    } else if (this.read()?.key !== key) {
      this.stateSignal.set('error');
    }
    this.schedule(key);
  }

  /** Takes a diagnosis the API answered as the newest of its voyage. */
  private accept(key: string, diagnosis: Refinement): void {
    this.sequence += 1;
    const items = this.read()?.key === key ? (this.read()?.items ?? []) : [];
    this.read.set({
      key,
      items: [diagnosis, ...items.filter((d) => d.id !== diagnosis.id)],
    });
    this.stateSignal.set('ready');
    this.schedule(key);
  }

  /** Reads again in {@link AGENT_DIAGNOSIS_POLL_MS} while the newest is in progress, never twice at once. */
  private schedule(key: string): void {
    if (this.disposed) return;
    if (!this.active()) {
      this.stopPolling();
      return;
    }
    if (this.timer !== null) return;
    this.timer = this.clock.schedule(AGENT_DIAGNOSIS_POLL_MS, () => {
      this.timer = null;
      void this.load(key);
    });
  }

  private stopPolling(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  private dispose(): void {
    this.disposed = true;
    this.stopPolling();
  }
}
