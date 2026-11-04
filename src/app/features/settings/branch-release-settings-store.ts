import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  BranchReleaseRepository,
  BranchReleaseRepositoryChange,
  BranchReleaseRepositoryRequest,
  BranchReleaseSettingsPage,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Branch releases section: each repository's release workflow and inputs, and the history. */
@Injectable()
export class BranchReleaseSettingsStore extends SectionStore<BranchReleaseSettingsPage> {
  protected readonly section = 'branch_releases' as const;

  protected read(): Promise<ApiResult<BranchReleaseSettingsPage>> {
    return this.api.getBranchReleaseSettings();
  }

  protected tell(
    summary: SettingsSummary,
    page: BranchReleaseSettingsPage
  ): void {
    summary.branchReleasesRead(page);
  }

  /** Gives a repository its release workflow; the page is read again either way. */
  addRepository(
    body: BranchReleaseRepositoryRequest
  ): Promise<ApiResult<BranchReleaseRepository>> {
    return this.reloadAfter(this.api.addBranchReleaseRepository(body));
  }

  /** Changes a repository's workflow or replaces its inputs. */
  updateRepository(
    id: string,
    body: BranchReleaseRepositoryChange
  ): Promise<ApiResult<BranchReleaseRepository>> {
    return this.reloadAfter(this.api.updateBranchReleaseRepository(id, body));
  }

  /** Takes a repository's release workflow away. */
  removeRepository(id: string): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteBranchReleaseRepository(id));
  }
}
