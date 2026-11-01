import { Component, computed, inject } from '@angular/core';
import { initialsOf } from '@core/auth/current-user';
import type { SonarRepository, SonarServer } from '@core/api/types';
import { describeSettingsEvent, tokenLabel } from '@domain/settings';
import { absoluteDay, absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api, Table } from '@ui/table/table';
import { settingsErrorView } from './settings-errors';
import { SettingsStore } from './settings-store';
import {
  SonarRepositoryDialog,
  type SonarRepositoryData,
} from './sonar-repository-dialog';
import { SonarServerDialog, type SonarServerData } from './sonar-server-dialog';

/**
 * Team settings › SonarQube: the servers the CI fixes read, which repository is on which, and who changed what. Admins
 * change them here; everyone else reads them. They are the only place SonarQube is set. Tokens are typed once and
 * shown only as their last four characters. 0 AIU.
 */
@Component({
  selector: 'ah-settings-page',
  imports: [
    Api,
    Banner,
    Button,
    EmptyState,
    Icon,
    Panel,
    PanelBody,
    PanelFoot,
    PanelHead,
    Skeleton,
    Table,
  ],
  providers: [SettingsStore],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .head {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .head h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }
    .layout {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
    }
    .main {
      flex: 999 1 640px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .side {
      flex: 1 1 340px;
      min-width: 0;
    }
    .scroll {
      overflow-x: auto;
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
    }
    .name {
      font-weight: 600;
    }
    .name .ah-tag {
      margin-left: 6px;
    }
    .token {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .history li {
      display: flex;
      gap: 10px;
    }
    .history__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .num {
      text-align: right;
    }
  `,
  template: `
    <div class="head">
      <h2>SonarQube</h2>
      <span class="ah-muted"
        >The servers that CI fixes read, and which repository is on which.</span
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

    @if (store.loading() && !store.sonar()) {
      <div class="ah-panel loading" aria-label="Loading the settings">
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
        <ah-skeleton width="55%" />
      </div>
    } @else if (store.sonar(); as sonar) {
      @if (!sonar.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to add you to
          AHOY_ADMIN_QNUMBERS.
        </ah-banner>
      } @else if (!sonar.secretsConfigured) {
        <ah-banner variant="notice" heading="Tokens can't be saved yet">
          The API needs AHOY_SECRETS_KEY to store a token encrypted. Until it is
          set, no server can be added and a new token cannot be saved.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="SonarQube servers"
              subtitle="The default one is for every repository not listed below."
            >
              @if (store.canEdit()) {
                <button
                  ahButton
                  size="sm"
                  type="button"
                  ahPanelActions
                  [disabled]="!store.canAddServer()"
                  (click)="server(null)"
                >
                  Add server
                </button>
              }
            </ah-panel-head>
            @if (sonar.servers.length === 0) {
              <ah-panel-body>
                <ah-empty-state heading="No SonarQube server yet" icon="lock">
                  Add one so a CI fix can read what SonarQube found.
                </ah-empty-state>
              </ah-panel-body>
            } @else {
              <div class="scroll">
                <table ahTable aria-label="SonarQube servers">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Host</th>
                      <th scope="col">Token</th>
                      <th scope="col" class="num">Repositories</th>
                      <th scope="col">Last change</th>
                      @if (store.canEdit()) {
                        <th scope="col"><span class="ah-sr">Actions</span></th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of sonar.servers; track s.id) {
                      <tr>
                        <th scope="row" class="name">
                          {{ s.name }}
                          @if (s.isDefault) {
                            <span class="ah-tag">Default</span>
                          }
                        </th>
                        <td>
                          <span ahApi>{{ s.hostUrl }}</span>
                        </td>
                        <td>
                          <span class="token"
                            ><ah-icon name="lock" [size]="12" /><span
                              class="ah-mono"
                              >{{ token(s.tokenHint) }}</span
                            ></span
                          >
                          <span class="ah-cell-sub"
                            >Set by {{ s.tokenSetByName ?? s.tokenSetBy }} ·
                            {{ day(s.tokenSetAt) }}</span
                          >
                        </td>
                        <td class="num">{{ s.repositoryCount }}</td>
                        <td>
                          {{ s.updatedByName ?? s.updatedBy }}
                          <span class="ah-cell-sub">{{
                            moment(s.updatedAt)
                          }}</span>
                        </td>
                        @if (store.canEdit()) {
                          <td>
                            <button
                              ahButton="ghost"
                              size="sm"
                              type="button"
                              [attr.aria-label]="'Edit ' + s.name"
                              (click)="server(s)"
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

          <ah-panel>
            <ah-panel-head
              heading="Repositories"
              subtitle="Only those on another server than the default, or whose project key the reconciler can't find."
            >
              @if (store.canEdit()) {
                <button
                  ahButton
                  size="sm"
                  type="button"
                  ahPanelActions
                  [disabled]="sonar.servers.length === 0"
                  (click)="repository(null)"
                >
                  Add repository
                </button>
              }
            </ah-panel-head>
            @if (sonar.repositories.length === 0) {
              <ah-panel-body>
                <ah-empty-state heading="No repository listed" icon="tool">
                  {{
                    sonar.servers.length === 0
                      ? 'Add a server first.'
                      : 'Every repository is on the default server.'
                  }}
                </ah-empty-state>
              </ah-panel-body>
            } @else {
              <div class="scroll">
                <table ahTable aria-label="Repositories">
                  <thead>
                    <tr>
                      <th scope="col">Repository</th>
                      <th scope="col">Server</th>
                      <th scope="col">Project key</th>
                      <th scope="col">Last change</th>
                      @if (store.canEdit()) {
                        <th scope="col"><span class="ah-sr">Actions</span></th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of sonar.repositories; track r.id) {
                      <tr>
                        <th scope="row">
                          <span ahApi>{{ r.repository }}</span>
                        </th>
                        <td>{{ store.serverName(r.serverId) }}</td>
                        <td>
                          @if (r.projectKey) {
                            <span class="ah-mono">{{ r.projectKey }}</span>
                          } @else {
                            <span class="ah-muted"
                              >Found by the reconciler</span
                            >
                          }
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
          <ah-panel>
            <ah-panel-head
              heading="History"
              subtitle="SonarQube, the latest first"
            />
            <ah-panel-body>
              @if (historyFailure(); as problem) {
                <ah-banner
                  [variant]="problem.variant"
                  heading="The history could not be read"
                  [tech]="problem.tech ?? ''"
                >
                  {{ problem.text }}
                </ah-banner>
              } @else if (history().length === 0) {
                <span class="ah-hint">No change yet.</span>
              } @else {
                <ol class="history" aria-label="Changes to SonarQube">
                  @for (e of history(); track e.id) {
                    <li>
                      <span class="ah-avatar" aria-hidden="true">{{
                        e.initials
                      }}</span>
                      <span class="history__text">
                        <span>{{ e.text }}</span>
                        <span class="ah-hint"
                          >{{ e.who }} · {{ moment(e.createdAt) }}</span
                        >
                      </span>
                    </li>
                  }
                </ol>
              }
            </ah-panel-body>
            <ah-panel-foot>
              <span class="ah-hint"
                >Kept for good. A token shows only its last four
                characters.</span
              >
            </ah-panel-foot>
          </ah-panel>
        </aside>
      </div>
    }
  `,
})
export class SettingsPage {
  protected readonly store = inject(SettingsStore);
  private readonly dialogs = inject(DialogService);
  protected readonly token = tokenLabel;
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  protected readonly historyFailure = computed(() => {
    const error = this.store.historyError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  /** The history in words, with who made each change. */
  protected readonly history = computed(() =>
    this.store.history().map((e) => {
      const who = e.actorName ?? e.actor;
      return {
        id: e.id,
        text: describeSettingsEvent(e.type, e.payload),
        who,
        initials: initialsOf(who),
        createdAt: e.createdAt,
      };
    })
  );

  constructor() {
    void this.store.load();
  }

  /** The day of a record, such as when a token was set. */
  protected day(at: string): string {
    return absoluteDay(at, this.now);
  }

  /** The day and time of a change. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** Opens the server dialog: a new server, or one to edit. */
  protected server(server: SonarServer | null): void {
    this.dialogs.open<boolean, SonarServerData>(SonarServerDialog, {
      data: {
        store: this.store,
        server,
        first: (this.store.sonar()?.servers.length ?? 0) === 0,
      },
      width: '520px',
    });
  }

  /** Opens the repository dialog: a new row, or one to edit. */
  protected repository(repository: SonarRepository | null): void {
    this.dialogs.open<boolean, SonarRepositoryData>(SonarRepositoryDialog, {
      data: {
        store: this.store,
        servers: this.store.sonar()?.servers ?? [],
        repository,
      },
      width: '520px',
    });
  }
}
