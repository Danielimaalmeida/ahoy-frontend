import { Component, computed, inject } from '@angular/core';
import type { SonarRepository, SonarServer } from '@core/api/types';
import {
  describeSettingsEvent,
  projectKeyLabel,
  tokenLabel,
} from '@domain/settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { DateTimePipe } from '@ui/pipes/date-time.pipe';
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
 * Team settings: the SonarQube servers the CI fixes read, which repository is on which, and who changed what. Admins
 * change them here; everyone else reads them. When the deployment sets SonarQube (`SONAR_*`), the page only shows
 * that. Tokens are typed once and shown only as their last four characters. 0 AIU.
 */
@Component({
  selector: 'ah-settings-page',
  imports: [
    Api,
    Banner,
    Button,
    DateTimePipe,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    Skeleton,
    Table,
  ],
  providers: [SettingsStore],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .head {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .head h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .head p {
      margin: 0;
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
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .history li {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .num {
      text-align: right;
    }
  `,
  template: `
    <div class="head">
      <h1>Team settings</h1>
      <p class="ah-muted">
        The SonarQube servers that CI fixes read, and which repository is on
        which. Every change is recorded with who made it.
      </p>
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
      @if (sonar.managedBy === 'deployment') {
        <ah-banner variant="info" heading="Set by the deployment">
          The API's SONAR_* settings decide SonarQube, so nothing here can
          change. Hosts: {{ sonar.deploymentHosts.join(', ') || 'none' }}.
          Remove them from the deployment to manage SonarQube here.
        </ah-banner>
      } @else if (!sonar.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin (AHOY_ADMIN_QNUMBERS) to
          change them.
        </ah-banner>
      } @else if (!sonar.secretsConfigured) {
        <ah-banner variant="notice" heading="Tokens can't be saved yet">
          The API needs AHOY_SECRETS_KEY to store a token encrypted. Until it is
          set, no server can be added and a new token cannot be saved.
        </ah-banner>
      }

      <ah-panel>
        <ah-panel-head
          heading="SonarQube servers"
          subtitle="The default one is for every repository not listed below"
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
              {{
                sonar.managedBy === 'deployment'
                  ? 'The deployment names the servers.'
                  : 'Add one so a CI fix can read what SonarQube found.'
              }}
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
                  <th scope="col">Changed</th>
                  @if (store.canEdit()) {
                    <th scope="col"><span class="ah-sr">Actions</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (s of sonar.servers; track s.id) {
                  <tr>
                    <th scope="row">
                      {{ s.name }}
                      @if (s.isDefault) {
                        <span class="ah-tag">Default</span>
                      }
                    </th>
                    <td>
                      <span ahApi>{{ s.hostUrl }}</span>
                    </td>
                    <td>
                      <span ahApi>{{ token(s.tokenHint) }}</span>
                      <span class="ah-hint">
                        by {{ s.tokenSetByName ?? s.tokenSetBy }},
                        {{ s.tokenSetAt | ahDateTime }}</span
                      >
                    </td>
                    <td class="num">{{ s.repositoryCount }}</td>
                    <td>
                      {{ s.updatedByName ?? s.updatedBy }}
                      <span class="ah-hint">{{
                        s.updatedAt | ahDateTime
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
          subtitle="Only those not on the default server, or whose project key the reconciler can't find"
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
                  <th scope="col">Changed</th>
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
                        <span ahApi>{{ r.projectKey }}</span>
                      } @else {
                        <span class="ah-hint">{{ key(null) }}</span>
                      }
                    </td>
                    <td>
                      {{ r.updatedByName ?? r.updatedBy }}
                      <span class="ah-hint">{{
                        r.updatedAt | ahDateTime
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

      <ah-panel>
        <ah-panel-head heading="History" subtitle="The latest changes first" />
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
            <ul class="history" aria-label="Changes to team settings">
              @for (e of history(); track e.id) {
                <li>
                  <span>{{ e.text }}</span>
                  <span class="ah-hint"
                    >{{ e.who }} · {{ e.createdAt | ahDateTime }}</span
                  >
                </li>
              }
            </ul>
          }
        </ah-panel-body>
      </ah-panel>
    }
  `,
})
export class SettingsPage {
  protected readonly store = inject(SettingsStore);
  private readonly dialogs = inject(DialogService);
  protected readonly token = tokenLabel;
  protected readonly key = projectKeyLabel;
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error);
  });
  protected readonly historyFailure = computed(() => {
    const error = this.store.historyError();
    return error === null ? null : settingsErrorView(error);
  });
  /** The history in words, with who made each change. */
  protected readonly history = computed(() =>
    this.store.history().map((e) => ({
      id: e.id,
      text: describeSettingsEvent(e.type, e.payload),
      who: e.actorName ?? e.actor,
      createdAt: e.createdAt,
    }))
  );

  constructor() {
    void this.store.load();
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
