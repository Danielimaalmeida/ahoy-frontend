import { Component, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { ConfluenceSettings } from '@core/api/types';
import { confluenceTestView } from '@domain/confluence-settings';
import { tokenLabel } from '@domain/settings';
import { absoluteDay, absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import {
  ConfluenceConnectionDialog,
  type ConfluenceConnectionData,
} from './confluence-connection-dialog';
import { ConfluenceSettingsStore } from './confluence-settings-store';
import {
  ConfluenceSpaceDialog,
  type ConfluenceSpaceData,
} from './confluence-space-dialog';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/**
 * Team settings › Confluence: the connection a meeting's Create in Confluence uses, and the space its parent page
 * search looks in. Admins change them; everyone else reads them. Pages are created as the token's user. The token is
 * typed once and shown only as its last four characters. Every check here is 0 AIU.
 */
@Component({
  selector: 'ah-confluence-settings-page',
  imports: [
    Api,
    Banner,
    Button,
    EmptyState,
    Icon,
    Panel,
    PanelBody,
    PanelHead,
    SettingsHistory,
    Skeleton,
  ],
  providers: [ConfluenceSettingsStore],
  styles: [SECTION_STYLES],
  template: `
    <div class="head">
      <h2>Confluence</h2>
      <span class="ah-muted"
        >Where a meeting's notes become a page, under a parent page picked from
        a search.</span
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
        aria-label="Loading the Confluence settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
        <ah-skeleton width="55%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to make you one in
          People.
        </ah-banner>
      } @else if (!page.secretsConfigured) {
        <ah-banner variant="notice" heading="Tokens can't be saved yet">
          The API needs AHOY_SECRETS_KEY to store a token encrypted. Until it is
          set, Confluence cannot be connected and a new token cannot be saved.
        </ah-banner>
      }
      @if (page.confluence && !page.tokenReadable) {
        <ah-banner variant="error" heading="The stored token can't be opened">
          The API's key no longer opens it, so Confluence is off until an admin
          types the token again (Edit the connection).
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          @if (page.confluence; as confluence) {
            <ah-panel>
              <ah-panel-head
                heading="Connection"
                subtitle="The API uses it to search for parent pages and create a meeting's page. Every page is created as the token's user."
              >
                @if (store.canEdit()) {
                  <span ahPanelActions class="row">
                    <button
                      ahButton
                      size="sm"
                      type="button"
                      [disabled]="testing()"
                      (click)="test()"
                    >
                      {{ testing() ? 'Testing…' : 'Test connection' }}
                    </button>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      (click)="connection(confluence)"
                    >
                      Edit
                    </button>
                  </span>
                }
              </ah-panel-head>
              @if (testFailure(); as problem) {
                <div class="body">
                  <ah-banner
                    [variant]="problem.variant"
                    [heading]="problem.heading"
                    [tech]="problem.tech ?? ''"
                  >
                    {{ problem.text }}
                  </ah-banner>
                </div>
              } @else if (lastTest(); as last) {
                @if (!last.view.good) {
                  <div class="body">
                    <ah-banner
                      variant="error"
                      [heading]="last.view.heading ?? ''"
                      [tech]="last.view.tech ?? ''"
                    >
                      {{ last.view.text }}
                    </ah-banner>
                  </div>
                }
              }
              <dl class="dl">
                <dt>Base URL</dt>
                <dd>
                  <span ahApi>{{ confluence.connection.baseUrl }}</span>
                </dd>
                <dt>Token</dt>
                <dd>
                  <span class="secret"
                    ><ah-icon name="lock" [size]="12" /><span class="ah-mono">{{
                      token(confluence.connection.tokenHint)
                    }}</span></span
                  >
                  <span class="ah-hint"
                    >Set by
                    {{
                      confluence.connection.tokenSetByName ??
                        confluence.connection.tokenSetBy
                    }}
                    · {{ day(confluence.connection.tokenSetAt) }}</span
                  >
                </dd>
                <dt>Last test</dt>
                <dd>
                  @if (lastTest(); as last) {
                    @if (last.view.good) {
                      <span class="ok"
                        ><ah-icon name="check" [size]="12" />{{
                          last.view.label
                        }}</span
                      >
                    } @else {
                      <span class="bad"
                        ><ah-icon name="aground" [size]="12" />{{
                          last.view.label
                        }}</span
                      >
                    }
                    <span class="ah-hint">{{ moment(last.at) }}</span>
                  } @else {
                    <span class="ah-hint"
                      >Not tested since the connection was set</span
                    >
                  }
                </dd>
              </dl>
            </ah-panel>

            <ah-panel>
              <ah-panel-head
                heading="Parent page search"
                subtitle="Where Create in Confluence looks for the page a meeting's page goes under."
              >
                @if (store.canEdit()) {
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    ahPanelActions
                    (click)="space(confluence)"
                  >
                    Edit
                  </button>
                }
              </ah-panel-head>
              <dl class="dl">
                <dt>Space</dt>
                <dd>
                  @if (confluence.spaceKey; as key) {
                    <span class="ah-mono">{{ key }}</span>
                  } @else {
                    <span>Every space</span>
                    <span class="ah-hint">that the token can see</span>
                  }
                </dd>
              </dl>
            </ah-panel>
          } @else {
            <ah-panel>
              <ah-panel-head heading="Connection" />
              <ah-panel-body>
                <ah-empty-state heading="Confluence is off" icon="anchor">
                  Create in Confluence needs it to turn a meeting into a page.
                  Copy for Confluence works without it.
                  @if (store.canEdit()) {
                    <button
                      ahButton="primary"
                      size="sm"
                      type="button"
                      [disabled]="!store.canSaveToken()"
                      (click)="connection(null)"
                    >
                      Connect Confluence
                    </button>
                  }
                </ah-empty-state>
              </ah-panel-body>
            </ah-panel>
          }
        </div>

        <aside class="side">
          <ah-settings-history
            section="Confluence"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. A token shows only its last four characters."
          />
        </aside>
      </div>
    }
  `,
})
export class ConfluenceSettingsPage {
  protected readonly store = inject(ConfluenceSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly token = tokenLabel;
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  protected readonly testing = signal(false);
  private readonly testError = signal<ApiError | null>(null);
  protected readonly testFailure = computed(() => {
    const error = this.testError();
    return error === null ? null : settingsErrorView(error);
  });
  /** The last connection test, in words. */
  protected readonly lastTest = computed(() => {
    const last = this.store.confluence()?.connection.lastTest ?? null;
    return last === null
      ? null
      : { at: last.at, view: confluenceTestView(last.result, last.detail) };
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
  }

  /** The day of a record, such as when the token was set. */
  protected day(at: string): string {
    return absoluteDay(at, this.now);
  }

  /** The day and time of a test. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** Asks Confluence who the stored token is; the answer shows as the last test. */
  protected async test(): Promise<void> {
    if (this.testing()) return;
    this.testing.set(true);
    this.testError.set(null);
    const result = await this.store.test();
    this.testing.set(false);
    if (!result.ok) {
      this.testError.set(result.error);
      return;
    }
    if (result.value.result === 'ok')
      this.toasts.show(
        confluenceTestView('ok', result.value.detail).label + '.'
      );
  }

  /** Opens the connection dialog: connect Confluence, or change its URL or token, or turn it off. */
  protected connection(confluence: ConfluenceSettings | null): void {
    this.testError.set(null);
    this.dialogs.open<boolean, ConfluenceConnectionData>(
      ConfluenceConnectionDialog,
      {
        data: {
          store: this.store,
          confluence,
          tokenReadable: this.store.page()?.tokenReadable !== false,
        },
        width: '520px',
      }
    );
  }

  /** Opens the space dialog. */
  protected space(confluence: ConfluenceSettings): void {
    this.dialogs.open<boolean, ConfluenceSpaceData>(ConfluenceSpaceDialog, {
      data: { store: this.store, confluence },
      width: '480px',
    });
  }
}
