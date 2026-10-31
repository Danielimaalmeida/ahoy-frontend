import { Component, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { FigmaSettings } from '@core/api/types';
import { figmaTestView } from '@domain/figma-settings';
import { tokenLabel } from '@domain/settings';
import { absoluteDay, absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { FigmaDesignDialog, type FigmaDesignData } from './figma-design-dialog';
import { FigmaSettingsStore } from './figma-settings-store';
import { FigmaTokenDialog, type FigmaTokenData } from './figma-token-dialog';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/**
 * Team settings › Figma: the token the design phase reads Figma with, and how a story's design reaches the agents that
 * build its UI. Admins change them; everyone else reads them. The token is pasted once and shown only as its last four
 * characters. Every check here is 0 AIU.
 */
@Component({
  selector: 'ah-figma-settings-page',
  imports: [
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
  providers: [FigmaSettingsStore],
  styles: [SECTION_STYLES],
  template: `
    <div class="head">
      <h2>Figma</h2>
      <span class="ah-muted"
        >The token the design phase reads Figma with, and the agents that get a
        story's design.</span
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
        aria-label="Loading the Figma settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
        <ah-skeleton width="55%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to add you to
          AHOY_ADMIN_QNUMBERS.
        </ah-banner>
      } @else if (!page.secretsConfigured && !page.figma.token) {
        <ah-banner variant="notice" heading="Tokens can't be saved yet">
          The API needs AHOY_SECRETS_KEY to store a token encrypted. Until it is
          set, Figma stays off.
        </ah-banner>
      }
      @if (page.figma.token && !page.secretsConfigured) {
        <ah-banner variant="error" heading="Figma is off">
          The token is stored encrypted, and the API has no AHOY_SECRETS_KEY to
          open it. The deployment needs the key again; the token can still be
          removed.
        </ah-banner>
      } @else if (page.figma.token && !page.tokenReadable) {
        <ah-banner variant="error" heading="The stored token can't be opened">
          The API's key no longer opens it, so Figma is off until an admin saves
          the token again (Replace).
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Token"
              subtitle="Read by the design phase only, and sent only to api.figma.com."
            >
              @if (store.canEdit() && page.figma.token) {
                <span ahPanelActions class="row">
                  <button
                    ahButton
                    size="sm"
                    type="button"
                    [disabled]="testing() || !page.tokenReadable"
                    (click)="test()"
                  >
                    {{ testing() ? 'Testing…' : 'Test token' }}
                  </button>
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    (click)="token(page.figma, page.tokenReadable)"
                  >
                    Replace
                  </button>
                </span>
              }
            </ah-panel-head>
            @if (page.figma.token; as token) {
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
                <dt>Token</dt>
                <dd>
                  <span class="secret"
                    ><ah-icon name="lock" [size]="12" /><span class="ah-mono">{{
                      hint(token.hint)
                    }}</span></span
                  >
                  <span class="ah-hint"
                    >Set by {{ token.setByName ?? token.setBy }} ·
                    {{ day(token.setAt) }}</span
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
                      >Not tested since the token was saved</span
                    >
                  }
                </dd>
              </dl>
            } @else {
              <ah-panel-body>
                <ah-empty-state heading="Figma is off" icon="anchor">
                  A story that links a Figma design halts with “Figma is not set
                  up” until a token is saved here. Stories without a design go
                  on.
                  @if (store.canEdit()) {
                    <button
                      ahButton="primary"
                      size="sm"
                      type="button"
                      [disabled]="!store.canSaveToken()"
                      (click)="token(page.figma, true)"
                    >
                      Save a token
                    </button>
                  }
                </ah-empty-state>
              </ah-panel-body>
            }
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="Design phase"
              subtitle="How a story's design reaches the agents that build its UI."
            >
              @if (store.canEdit()) {
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  ahPanelActions
                  (click)="design(page.figma)"
                >
                  Edit
                </button>
              }
            </ah-panel-head>
            <dl class="dl">
              <dt>UI builders</dt>
              <dd>
                @for (agent of page.figma.uiAgents; track agent) {
                  <span class="ah-mono">{{ agent }}</span>
                }
                <span class="ah-hint"
                  >The implementer agents that get the design. Profiles from the
                  content repository.</span
                >
              </dd>
              <dt>Design kit prefix</dt>
              <dd>
                <span class="ah-mono">{{ page.figma.selectorPrefix }}</span>
                <span class="ah-hint"
                  >Components whose selector starts with it are the kit's; the
                  agent asks before building its own.</span
                >
              </dd>
            </dl>
            @if (page.figma.version === null) {
              <ah-panel-body>
                <span class="ah-hint"
                  >These are the defaults: no admin has changed them yet.</span
                >
              </ah-panel-body>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Figma"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. A token shows only its last four characters."
          />
        </aside>
      </div>
    }
  `,
})
export class FigmaSettingsPage {
  protected readonly store = inject(FigmaSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly hint = tokenLabel;
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  protected readonly testing = signal(false);
  private readonly testError = signal<ApiError | null>(null);
  protected readonly testFailure = computed(() => {
    const error = this.testError();
    return error === null ? null : settingsErrorView(error);
  });
  /** The last token test, in words. */
  protected readonly lastTest = computed(() => {
    const last = this.store.figma()?.token?.lastTest ?? null;
    return last === null
      ? null
      : { at: last.at, view: figmaTestView(last.result, last.detail) };
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

  /** Asks Figma who the stored token is; the answer shows as the last test. */
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
      this.toasts.show(figmaTestView('ok', result.value.detail).label + '.');
  }

  /** Opens the token dialog: save one, replace it, or remove it. */
  protected token(figma: FigmaSettings, tokenReadable: boolean): void {
    this.testError.set(null);
    this.dialogs.open<boolean, FigmaTokenData>(FigmaTokenDialog, {
      data: {
        store: this.store,
        figma,
        tokenReadable,
        secretsConfigured: this.store.page()?.secretsConfigured === true,
      },
      width: '520px',
    });
  }

  /** Opens the design phase dialog. */
  protected design(figma: FigmaSettings): void {
    this.dialogs.open<boolean, FigmaDesignData>(FigmaDesignDialog, {
      data: { store: this.store, figma },
      width: '480px',
    });
  }
}
