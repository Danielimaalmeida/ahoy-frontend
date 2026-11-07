import { Component, computed, inject } from '@angular/core';
import type { BranchReleaseRepository } from '@core/api/types';
import { inputsSummary } from '@domain/branch-releases';
import { absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api, Table } from '@ui/table/table';
import {
  BranchReleaseRepositoryDialog,
  type BranchReleaseRepositoryData,
} from './branch-release-repository-dialog';
import { BranchReleaseSettingsStore } from './branch-release-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/**
 * Team settings › Branch releases (`ahoy-hosted` design §4 "Branch releases"): which `workflow_dispatch` workflow of
 * each child repository releases a pull request branch to TEST, and with which inputs. A work package whose repository
 * is listed offers "Deploy to TEST" on the voyage page while its pull request is open. Where the deployment's
 * reconciler cannot start workflows (it does not dispatch with Docker or Kubernetes), the page says releases wait.
 * 0 AIU.
 */
@Component({
  selector: 'ah-branch-release-settings-page',
  imports: [
    Api,
    Banner,
    Button,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    SettingsHistory,
    Skeleton,
    Table,
  ],
  providers: [BranchReleaseSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .scroll {
        overflow-x: auto;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Branch releases</h2>
      <span class="ah-muted"
        >The workflow that builds a pull request branch's test image and deploys
        it to TEST, per repository, started from a work package on the voyage
        page.</span
      >
    </div>

    @if (failure(); as problem) {
      <ah-banner
        [variant]="problem.variant"
        [heading]="problem.heading"
        [tech]="problem.tech ?? ''"
      >
        {{ problem.text }}
        <button ahButton size="sm" type="button" (click)="store.load()">
          Try again
        </button>
      </ah-banner>
    }

    @if (store.loading() && !store.page()) {
      <div
        class="ah-panel loading"
        role="status"
        aria-label="Loading the branch release settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to make you one in
          People.
        </ah-banner>
      }
      @if (!page.dispatchable) {
        <ah-banner
          variant="notice"
          heading="This deployment cannot start workflows"
        >
          Its reconciler does not run agents with Docker or Kubernetes, so it
          reads no real GitHub: a release asked for on a voyage stays queued.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Repositories"
              subtitle="The reconciler starts the workflow with its own GitHub login, on the pull request's branch."
            >
              @if (store.canEdit()) {
                <button
                  ahButton
                  size="sm"
                  type="button"
                  ahPanelActions
                  (click)="repository(null)"
                >
                  Add repository
                </button>
              }
            </ah-panel-head>
            @if (page.repositories.length === 0) {
              <ah-panel-body>
                <ah-empty-state heading="No repository listed" icon="tool">
                  No work package offers a release until its repository has a
                  workflow here.
                </ah-empty-state>
              </ah-panel-body>
            } @else {
              <div class="scroll">
                <table ahTable aria-label="Repositories">
                  <thead>
                    <tr>
                      <th scope="col">Repository</th>
                      <th scope="col">Workflow</th>
                      <th scope="col">Inputs</th>
                      <th scope="col">Last change</th>
                      @if (store.canEdit()) {
                        <th scope="col"><span class="ah-sr">Actions</span></th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of page.repositories; track r.id) {
                      <tr>
                        <th scope="row">
                          <span ahApi>{{ r.repository }}</span>
                        </th>
                        <td>
                          <span class="ah-mono">{{ r.workflow }}</span>
                        </td>
                        <td>
                          <span class="ah-mono">{{ inputs(r) }}</span>
                        </td>
                        <td>
                          {{ r.updatedByName ?? r.updatedBy }}
                          <span class="ah-cell-sub">{{
                            moment(r.updatedAt)
                          }}</span>
                        </td>
                        @if (store.canEdit()) {
                          <td>
                            <button
                              ahButton="ghost"
                              size="sm"
                              type="button"
                              [attr.aria-label]="'Edit ' + r.repository"
                              (click)="repository(r)"
                            >
                              Edit
                            </button>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Branch releases"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. What a workflow deploys, and where, is the repository's own."
          />
        </aside>
      </div>
    }
  `,
})
export class BranchReleaseSettingsPage {
  protected readonly store = inject(BranchReleaseSettingsStore);
  private readonly dialogs = inject(DialogService);
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
  }

  /** "environment=test · update-ops-tag=true". */
  protected inputs(row: BranchReleaseRepository): string {
    return inputsSummary(row.inputs);
  }

  /** The day and time of a change. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** Opens the repository dialog: a new row, or one to edit. */
  protected repository(repository: BranchReleaseRepository | null): void {
    this.dialogs.open<boolean, BranchReleaseRepositoryData>(
      BranchReleaseRepositoryDialog,
      { data: { store: this.store, repository }, width: '520px' }
    );
  }
}
