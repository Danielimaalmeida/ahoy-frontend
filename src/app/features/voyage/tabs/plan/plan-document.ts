import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { isNotFound, type ApiError } from '@core/api/api-error';
import type { Artifact } from '@core/api/types';
import { changedBlocks } from '@domain/text-diff';
import { VoyageContext } from '../../context/voyage-context';
import { findComparison, type Comparison } from './plan-comparison';

/** The plan the Cartographer writes, as `listArtifacts` names it. */
export const PLAN_PATH = 'implementation-plan.md';

/** Where the plan stands: being read, not written yet (`404`), could not be read, or there. */
export type PlanStatus = 'loading' | 'none' | 'error' | 'ready';

/** The plan's artifact entry at the revision being shown. */
type Target = Pick<Artifact, 'revision' | 'sha256' | 'runId' | 'createdAt'>;

/**
 * The plan of the open voyage (`implementation-plan.md`) and the earlier plan its changes are marked against (plan,
 * lane 4B). It follows the voyage's artifact list: when a new revision of the set changes the plan, the plan is read
 * again and the earlier plan is looked for again (at most five revisions back, G9). The plan shows as soon as it is
 * read; the marks follow when the earlier plan is found. Read-only: it never writes.
 */
@Injectable()
export class PlanDocument {
  private readonly context = inject(VoyageContext);
  private readonly api = inject(ApiClient);
  private readonly statusSignal = signal<PlanStatus>('loading');
  private readonly textSignal = signal<string | null>(null);
  private readonly comparisonSignal = signal<Comparison | null>(null);
  private readonly errorSignal = signal<ApiError | null>(null);
  /** Counts reads, so one that was replaced meanwhile never lands. */
  private reads = 0;

  /** The plan's entry in the current artifact set: its revision, run and time. Null while there is none. */
  readonly artifact = computed<Target | null>(
    () =>
      this.context
        .handle()
        ?.artifacts.value()
        ?.items.find((item) => item.path === PLAN_PATH) ?? null,
    { equal: (a, b) => a?.sha256 === b?.sha256 && a?.revision === b?.revision }
  );

  readonly status = this.statusSignal.asReadonly();
  /** The plan's markdown; null until it is read. */
  readonly text = this.textSignal.asReadonly();
  /** The earlier plan the marks are against, once found. */
  readonly comparison = this.comparisonSignal.asReadonly();
  /** Why the plan could not be read. */
  readonly error = this.errorSignal.asReadonly();

  /** Indices of the blocks that changed since the earlier plan (for `ah-markdown`); none without one. */
  readonly changed = computed(() => {
    const text = this.text();
    const comparison = this.comparison();
    return text === null || comparison === null
      ? []
      : changedBlocks(comparison.text, text);
  });

  constructor() {
    effect(() => this.context.handle()?.watch('artifacts'));
    effect(() => {
      const handle = this.context.handle();
      const target = this.artifact();
      const status = handle?.artifacts.status();
      const failed =
        handle?.artifacts.value() === undefined
          ? (handle?.artifacts.error() ?? null)
          : null;
      if (handle === null) return;
      // What follows writes the signals it reads: it must not become a dependency of this effect.
      untracked(() => {
        if (target !== null) {
          void this.read(handle.key, target);
        } else if (status === 'ready') {
          this.settle('none');
        } else if (status === 'error' && failed !== null) {
          this.settle('error', failed);
        }
      });
    });
  }

  /** Reads the artifact list and the plan again, after a failure. */
  retry(): void {
    const handle = this.context.handle();
    if (handle === null) return;
    const target = this.artifact();
    if (target === null) void handle.artifacts.refresh();
    else void this.read(handle.key, target);
  }

  /** Shows no plan: it is not written yet, or could not be read. */
  private settle(
    status: 'none' | 'error',
    error: ApiError | null = null
  ): void {
    this.reads++;
    this.textSignal.set(null);
    this.comparisonSignal.set(null);
    this.errorSignal.set(error);
    this.statusSignal.set(status);
  }

  private async read(key: string, target: Target): Promise<void> {
    const token = ++this.reads;
    const stale = (): boolean => token !== this.reads;
    if (this.textSignal() === null) this.statusSignal.set('loading');
    const result = await this.api.getArtifactContent(key, {
      path: PLAN_PATH,
      revision: target.revision,
    });
    if (stale()) return;
    if (!result.ok) {
      this.settle(
        isNotFound(result.error) ? 'none' : 'error',
        isNotFound(result.error) ? null : result.error
      );
      return;
    }
    if (result.value.kind !== 'content') {
      // Unchanged (never asked for without an ETag): keep what is shown, and never leave the skeleton up.
      this.statusSignal.set(this.textSignal() === null ? 'none' : 'ready');
      return;
    }
    const text = result.value.text;
    if (text !== this.textSignal()) this.comparisonSignal.set(null);
    this.textSignal.set(text);
    this.errorSignal.set(null);
    this.statusSignal.set('ready');
    const comparison = await findComparison(
      text,
      target.revision,
      (revision) =>
        this.api.getArtifactContent(key, { path: PLAN_PATH, revision }),
      stale
    );
    if (!stale()) this.comparisonSignal.set(comparison);
  }
}
