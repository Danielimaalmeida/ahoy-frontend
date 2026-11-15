import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApiError } from '@core/api/api-error';
import type { EnvironmentRow } from '@core/api/types';
import { signInLabel, signInTestView } from '@domain/environments';
import { absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import {
  EnvironmentDialog,
  type EnvironmentDialogData,
} from './environment-dialog';
import { EnvironmentsSettingsStore } from './environments-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/**
 * Team settings › Environments (`ahoy-hosted` design §5 "Defect reproduction"): the deployed environments a browser
 * may open to reproduce a defect, the origins it may load in each, how it signs in and whether its account may change
 * data. Every origin must be on the hosts the deployment allows. "Test sign-in" starts a run in the cluster that
 * signs in and stops, at 0 AIU, and the row then says what it found. Which environment defects are reproduced in is
 * chosen in Team settings › Defects. Reading and changing these is 0 AIU.
 */
@Component({
  selector: 'ah-environments-settings-page',
  imports: [
    Banner,
    Button,
    EmptyState,
    Icon,
    Panel,
    PanelBody,
    PanelHead,
    RouterLink,
    SettingsHistory,
    Skeleton,
    Table,
  ],
  providers: [EnvironmentsSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      /* Positioned, so the visually hidden "Actions" heading scrolls with the table instead of widening the page. */
      .scroll {
        position: relative;
        overflow-x: auto;
      }
      td,
      th[scope='row'] {
        vertical-align: top;
      }
      .url {
        min-width: 13rem;
        overflow-wrap: anywhere;
      }
      .said {
        min-width: 6rem;
      }
      .actions {
        white-space: nowrap;
        text-align: right;
      }
      .actions > * + * {
        margin-left: 6px;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Environments</h2>
      <span class="ah-muted"
        >Where Ahoy may open your app with a browser to reproduce a defect
        before starting it, and how the browser signs in. Which one defects are
        reproduced in is chosen in
        <a routerLink="/settings/defects">Defects</a>.</span
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
        aria-label="Loading the environments"
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
      @if (page.allowedHosts.length === 0) {
        <ah-banner
          variant="notice"
          heading="This deployment allows no host for reproductions"
          tech="AHOY_REPRO_ALLOWED_HOSTS is not set"
        >
          No environment can be saved until whoever runs the deployment names
          the hosts a reproduction may reach.
        </ah-banner>
      } @else if (!page.secretsConfigured) {
        <ah-banner
          variant="notice"
          heading="Passwords cannot be saved yet"
          tech="AHOY_SECRETS_KEY is not set"
        >
          An environment that signs in with a form needs the deployment's key to
          keep its password encrypted. One without a sign-in can be added.
        </ah-banner>
      }
      @if (testFailure(); as problem) {
        <ah-banner
          [variant]="problem.variant"
          [heading]="problem.heading"
          [tech]="problem.tech ?? ''"
        >
          {{ problem.text }}
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head heading="Environments" [subtitle]="hostsLine(page)">
              @if (store.canEdit() && page.allowedHosts.length > 0) {
                <button
                  ahButton
                  size="sm"
                  type="button"
                  ahPanelActions
                  (click)="edit(null)"
                >
                  Add environment
                </button>
              }
            </ah-panel-head>
            @if (page.environments.length === 0) {
              <ah-panel-body>
                <ah-empty-state heading="No environment yet" icon="compass">
                  A defect can be reproduced once an environment is listed here
                  and chosen in Team settings › Defects.
                </ah-empty-state>
              </ah-panel-body>
            } @else {
              <div class="scroll">
                <table ahTable aria-label="Environments">
                  <thead>
                    <tr>
                      <th scope="col">Environment</th>
                      <th scope="col">Sign-in</th>
                      <th scope="col">Sign-in test</th>
                      @if (store.canEdit()) {
                        <th scope="col"><span class="ah-sr">Actions</span></th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (e of page.environments; track e.id) {
                      <tr [attr.data-environment]="e.name">
                        <th scope="row" class="url">
                          {{ e.name }}
                          <span class="ah-cell-sub ah-mono">{{
                            e.baseUrl
                          }}</span>
                          @if (e.allowedOrigins.length > 1) {
                            <span class="ah-cell-sub">and {{ others(e) }}</span>
                          }
                          @if (e.inUse) {
                            <span class="ah-cell-sub"
                              >Defects are reproduced here</span
                            >
                          }
                        </th>
                        <td class="said">
                          {{ signIn(e) }}
                          <span class="ah-cell-sub">{{
                            e.writes ? 'May change data' : 'Reads only'
                          }}</span>
                          @if (passwordLost(e)) {
                            <span class="ah-cell-sub bad"
                              ><ah-icon name="aground" [size]="12" />Password
                              needed again</span
                            >
                          }
                        </td>
                        <td class="said">
                          @let outcome = testView(e);
                          @switch (outcome.tone) {
                            @case ('ok') {
                              <span class="ok" role="status"
                                ><ah-icon name="check" [size]="12" />{{
                                  outcome.label
                                }}</span
                              >
                            }
                            @case ('bad') {
                              <span class="bad" role="status"
                                ><ah-icon name="aground" [size]="12" />{{
                                  outcome.label
                                }}</span
                              >
                            }
                            @case ('busy') {
                              <span
                                class="ah-tag ah-tag--outline"
                                role="status"
                                >{{ outcome.label }}</span
                              >
                            }
                            @default {
                              <span class="ah-muted">{{ outcome.label }}</span>
                            }
                          }
                          @if (outcome.detail) {
                            <span class="ah-cell-sub">{{
                              outcome.detail
                            }}</span>
                          }
                          @if (testedLine(e); as line) {
                            <span class="ah-cell-sub">{{ line }}</span>
                          }
                        </td>
                        @if (store.canEdit()) {
                          <td class="actions">
                            <button
                              ahButton="soft"
                              size="sm"
                              type="button"
                              [disabled]="e.testing || testing() !== null"
                              [attr.aria-label]="'Test sign-in of ' + e.name"
                              (click)="test(e)"
                            >
                              {{
                                testing() === e.id
                                  ? 'Starting…'
                                  : 'Test sign-in'
                              }}
                            </button>
                            <button
                              ahButton="ghost"
                              size="sm"
                              type="button"
                              [attr.aria-label]="'Edit ' + e.name"
                              (click)="edit(e)"
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
            section="Environments"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. A password is never recorded, only that one was set."
          />
        </aside>
      </div>
    }
  `,
})
export class EnvironmentsSettingsPage {
  protected readonly store = inject(EnvironmentsSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  /** The id of the environment whose Test sign-in is being asked for, if any: one at a time. */
  protected readonly testing = signal<string | null>(null);
  private readonly testError = signal<ApiError | null>(null);
  protected readonly testFailure = computed(() => {
    const error = this.testError();
    return error === null ? null : settingsErrorView(error);
  });

  constructor() {
    void this.store.load();
  }

  /** "A browser opens only an environment's own origins. This deployment allows: test.example.com." */
  protected hostsLine(page: {
    readonly allowedHosts: readonly string[];
  }): string {
    const own = "A browser opens only an environment's own origins.";
    return page.allowedHosts.length === 0
      ? own
      : `${own} This deployment allows: ${page.allowedHosts.join(', ')}.`;
  }

  /** "No sign-in", or "Form, as ahoy-reader". */
  protected signIn(row: EnvironmentRow): string {
    return signInLabel(row.signIn);
  }

  /** The origins after the base URL's: "https://api.test.example.com". */
  protected others(row: EnvironmentRow): string {
    return row.allowedOrigins.slice(1).join(', ');
  }

  /** Whether the saved password no longer opens with the server's key and must be typed again. */
  protected passwordLost(row: EnvironmentRow): boolean {
    return row.signIn.kind === 'form' && !row.passwordReadable;
  }

  protected testView(row: EnvironmentRow) {
    return signInTestView(row.lastTest, row.testing);
  }

  /** "15 Nov, 14:02 · Alex" under the last test's outcome; null while one runs or before the first. */
  protected testedLine(row: EnvironmentRow): string | null {
    if (row.testing || row.lastTest === null) return null;
    const who = row.lastTest.byName ?? row.lastTest.by;
    const at = this.moment(row.lastTest.at);
    return who === null ? at : `${at} · ${who}`;
  }

  /** The day and time of a change. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** Opens the environment dialog: a new one, or one to edit. */
  protected edit(environment: EnvironmentRow | null): void {
    const page = this.store.page();
    if (page === null) return;
    this.dialogs.open<boolean, EnvironmentDialogData>(EnvironmentDialog, {
      data: {
        store: this.store,
        allowedHosts: page.allowedHosts,
        environment,
      },
      width: '560px',
    });
  }

  /** Test sign-in: starts the run; the row says "Testing…" until its outcome is read. A refusal shows why. */
  protected async test(environment: EnvironmentRow): Promise<void> {
    if (this.testing() !== null) return;
    this.testing.set(environment.id);
    this.testError.set(null);
    const result = await this.store.test(environment.id);
    this.testing.set(null);
    if (!result.ok) {
      this.testError.set(result.error);
      return;
    }
    this.toasts.show(
      `Testing the sign-in of ${environment.name}. It takes a minute or two.`
    );
  }
}
