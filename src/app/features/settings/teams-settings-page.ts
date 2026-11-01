import { Component, computed, inject } from '@angular/core';
import type { TeamsSettings } from '@core/api/types';
import { cardResultLabel, crewPageOf } from '@domain/teams-settings';
import { absoluteDay, absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';
import {
  TeamsChannelDialog,
  type TeamsChannelData,
} from './teams-channel-dialog';
import { TeamsSettingsStore } from './teams-settings-store';
import {
  TeamsTestCardDialog,
  type TeamsTestCardData,
} from './teams-test-card-dialog';

/**
 * Team settings › Teams: the crew's channel, where Ahoy posts who is on each sprint. The Workflows webhook is pasted
 * once and shown only as its host; admins change it and send a test card, after a confirmation. 0 AIU.
 */
@Component({
  selector: 'ah-teams-settings-page',
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
  providers: [TeamsSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .cards {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .cards li {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 11px 16px;
        border-top: 1px solid var(--line-soft);
      }
      .cards li:first-child {
        border-top: 0;
      }
      .cards strong {
        font-weight: 600;
      }
      .kinds {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: flex-start;
      }
      .kinds .cards {
        flex: 1 1 280px;
      }
      .preview {
        flex: 0 1 300px;
        margin: 12px 16px;
        padding: 12px 14px;
        border: 1px solid var(--line-soft);
        border-radius: 6px;
        background: var(--surface, #fff);
        box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .preview dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 2px 10px;
        margin: 0;
      }
      .preview dd {
        margin: 0;
      }
      .preview .open {
        align-self: flex-start;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Teams</h2>
      <span class="ah-muted"
        >The crew's channel, where Ahoy posts who is on each sprint.</span
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
        aria-label="Loading the Teams settings"
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
      } @else if (!page.secretsConfigured && !page.teams) {
        <ah-banner variant="notice" heading="A webhook can't be saved yet">
          The API needs AHOY_SECRETS_KEY to store the webhook encrypted. Until
          it is set, the crew's channel cannot be connected.
        </ah-banner>
      }
      @if (page.teams && !page.secretsConfigured) {
        <ah-banner variant="error" heading="No card is posted">
          The webhook is stored encrypted, and the API has no AHOY_SECRETS_KEY
          to open it. The deployment needs the key again; the address the cards
          link to can still change.
        </ah-banner>
      } @else if (page.teams && !page.webhookReadable) {
        <ah-banner variant="error" heading="The stored webhook can't be opened">
          The API's key no longer opens it, so no card is posted until an admin
          pastes the webhook again (Edit the channel).
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          @if (page.teams; as teams) {
            <ah-panel>
              <ah-panel-head
                heading="Channel"
                subtitle="A Teams Workflows webhook. Anyone who has it can post to the channel, so it is stored encrypted like a token and only its host is shown."
              >
                @if (store.canEdit()) {
                  <span ahPanelActions class="row">
                    <button
                      ahButton
                      size="sm"
                      type="button"
                      [disabled]="!page.webhookReadable"
                      (click)="testCard(teams)"
                    >
                      Send a test card
                    </button>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      (click)="channel(teams)"
                    >
                      Edit
                    </button>
                  </span>
                }
              </ah-panel-head>
              @if (teams.lastCard; as last) {
                @if (last.result === 'failed') {
                  <div class="body">
                    <ah-banner
                      variant="error"
                      heading="Teams did not take the last card"
                      [tech]="
                        'POST ' +
                        teams.webhook.host +
                        '/… → ' +
                        (last.detail ?? 'failed')
                      "
                    >
                      Check that the workflow is still on and posts to the
                      channel, or paste a new webhook.
                    </ah-banner>
                  </div>
                }
              }
              <dl class="dl">
                <dt>Webhook</dt>
                <dd>
                  <span class="secret"
                    ><ah-icon name="lock" [size]="12" /><span class="ah-mono"
                      >{{ teams.webhook.host }}/…</span
                    ></span
                  >
                  <span class="ah-hint"
                    >Set by
                    {{ teams.webhook.setByName ?? teams.webhook.setBy }} ·
                    {{ day(teams.webhook.setAt) }}</span
                  >
                </dd>
                <dt>Card links open</dt>
                <dd>
                  @if (teams.uiUrl; as uiUrl) {
                    <span class="ah-mono">{{ uiUrl }}</span>
                    <span class="ah-hint"
                      >The “Open Crew” button goes to
                      {{ crewPage(uiUrl) }}</span
                    >
                  } @else {
                    <span class="ah-hint"
                      >No address: the cards have no “Open Crew” button.</span
                    >
                  }
                </dd>
                <dt>Last card</dt>
                <dd>
                  @if (teams.lastCard; as last) {
                    <span>{{ last.title }}</span>
                    @if (last.result === 'posted') {
                      <span class="ok"
                        ><ah-icon name="check" [size]="12" />{{
                          resultLabel(last.result)
                        }}</span
                      >
                    } @else {
                      <span class="bad"
                        ><ah-icon name="aground" [size]="12" />{{
                          resultLabel(last.result)
                        }}</span
                      >
                    }
                    <span class="ah-hint">{{ moment(last.at) }}</span>
                  } @else {
                    <span class="ah-hint">None since the webhook was set</span>
                  }
                </dd>
              </dl>
            </ah-panel>
          } @else {
            <ah-panel>
              <ah-panel-head heading="Channel" />
              <ah-panel-body>
                <ah-empty-state heading="Teams is off" icon="anchor">
                  No card is posted to the crew's channel until its webhook is
                  added. In Teams, add the workflow “Post to a channel when a
                  webhook request is received” to the channel and copy its
                  address.
                  @if (store.canEdit()) {
                    <button
                      ahButton="primary"
                      size="sm"
                      type="button"
                      [disabled]="!store.canSaveWebhook()"
                      (click)="channel(null)"
                    >
                      Connect the channel
                    </button>
                  }
                </ah-empty-state>
              </ah-panel-body>
            </ah-panel>
          }

          <ah-panel>
            <ah-panel-head
              heading="Cards the channel gets"
              subtitle="Ahoy sends these two; there is nothing to switch on."
            />
            <div class="kinds">
              <ul class="cards">
                <li>
                  <strong>A sprint starts</strong>
                  <span class="ah-hint"
                    >Who is on and who is next. Posted on the sprint's first day
                    from 07:00 UTC, and skipped when Ahoy is more than 3 days
                    late.</span
                  >
                </li>
                <li>
                  <strong>Someone changes who is on</strong>
                  <span class="ah-hint"
                    >Who is on now, who was, why, who changed it, and who is on
                    for the sprints after.</span
                  >
                </li>
              </ul>
              <div class="preview" aria-label="Preview of a sprint-start card">
                <span class="ah-hint"><b>Preview · in the channel</b></span>
                <strong>🚀 Sprint 41 starts today</strong>
                <dl>
                  <dt>🚀 Sprint person</dt>
                  <dd>Who is on · their release day</dd>
                  <dt>🍕 Lunch &amp; retro host</dt>
                  <dd>Who is on · their lunch day</dd>
                </dl>
                <b>Up next</b>
                <dl>
                  <dt>Sprint 42</dt>
                  <dd>🚀 the next pair · 🍕</dd>
                </dl>
                @if (store.teams()?.uiUrl) {
                  <span class="ah-tag ah-tag--outline open">Open Crew</span>
                } @else {
                  <span class="ah-hint"
                    >No Open Crew button: no address is set.</span
                  >
                }
              </div>
            </div>
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Teams"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. A webhook shows only its host."
          />
        </aside>
      </div>
    }
  `,
})
export class TeamsSettingsPage {
  protected readonly store = inject(TeamsSettingsStore);
  private readonly dialogs = inject(DialogService);
  protected readonly crewPage = crewPageOf;
  protected readonly resultLabel = cardResultLabel;
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
  }

  /** The day of a record, such as when the webhook was set. */
  protected day(at: string): string {
    return absoluteDay(at, this.now);
  }

  /** The day and time of a card. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** Opens the channel dialog: connect it, or change its webhook or address, or disconnect it. */
  protected channel(teams: TeamsSettings | null): void {
    this.dialogs.open<boolean, TeamsChannelData>(TeamsChannelDialog, {
      data: {
        store: this.store,
        teams,
        webhookReadable: this.store.page()?.webhookReadable !== false,
        secretsConfigured: this.store.page()?.secretsConfigured === true,
      },
      width: '520px',
    });
  }

  /** Asks once, then sends a test card to the channel. */
  protected testCard(teams: TeamsSettings): void {
    this.dialogs.open<boolean, TeamsTestCardData>(TeamsTestCardDialog, {
      data: {
        store: this.store,
        host: teams.webhook.host,
        withButton: teams.uiUrl !== null,
      },
      width: '460px',
    });
  }
}
