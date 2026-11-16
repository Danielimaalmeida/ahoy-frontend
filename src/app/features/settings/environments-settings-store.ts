import { DestroyRef, Injectable, inject } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  Environment,
  EnvironmentChange,
  EnvironmentRequest,
  EnvironmentsPage,
} from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** How long between two reads while a Test sign-in is queued or running. */
export const TEST_FOLLOW_MS = 5_000;
/** How many such reads follow a test: five minutes, enough for a Job to start, sign in and end. */
export const TEST_FOLLOWS = 60;

/**
 * The state of the Environments section: the environments a defect may be reproduced in, the hosts the deployment
 * allows, and the history. While a Test sign-in is queued or running the page is read again every few seconds, for a
 * few minutes, so its outcome shows without a refresh.
 */
@Injectable()
export class EnvironmentsSettingsStore extends SectionStore<EnvironmentsPage> {
  protected readonly section = 'environments' as const;
  private readonly clock = inject(CLOCK);
  private follow: Timer | null = null;
  /** The reads left while a test stays in progress. */
  private followsLeft = TEST_FOLLOWS;

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => this.follow?.cancel());
  }

  protected read(): Promise<ApiResult<EnvironmentsPage>> {
    return this.api.getEnvironments();
  }

  protected tell(summary: SettingsSummary, page: EnvironmentsPage): void {
    summary.environmentsRead(page);
  }

  override async load(): Promise<void> {
    await super.load();
    this.followTests();
  }

  /** Adds an environment; the page is read again either way. */
  add(body: EnvironmentRequest): Promise<ApiResult<Environment>> {
    return this.reloadAfter(this.api.addEnvironment(body));
  }

  /** Changes an environment, every field sent again. */
  update(id: string, body: EnvironmentChange): Promise<ApiResult<Environment>> {
    return this.reloadAfter(this.api.updateEnvironment(id, body));
  }

  /** Removes an environment defects are not reproduced in. */
  remove(id: string): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteEnvironment(id));
  }

  /** Test sign-in: queues the run; the page then says "Testing…" until its outcome is read. 0 AIU. */
  test(id: string): Promise<ApiResult<Environment>> {
    this.followsLeft = TEST_FOLLOWS;
    return this.reloadAfter(this.api.testEnvironment(id));
  }

  /** Reads again after a while, as long as a test is in progress and reads are left. */
  private followTests(): void {
    this.follow?.cancel();
    this.follow = null;
    const testing = this.page()?.environments.some((e) => e.testing) === true;
    if (!testing || this.followsLeft <= 0) return;
    this.follow = this.clock.schedule(TEST_FOLLOW_MS, () => {
      this.follow = null;
      this.followsLeft--;
      void this.load();
    });
  }
}
