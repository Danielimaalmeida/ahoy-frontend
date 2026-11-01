import { Component, computed, input } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { SettingsEvent } from '@core/api/types';
import { initialsOf } from '@core/auth/current-user';
import { describeSettingsEvent } from '@domain/settings';
import { absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { settingsErrorView } from './settings-errors';

/** One section's history of changes, the latest first, with who made each one. */
@Component({
  selector: 'ah-settings-history',
  imports: [Banner, Panel, PanelBody, PanelFoot, PanelHead],
  styles: `
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
  `,
  template: `
    <ah-panel>
      <ah-panel-head
        heading="History"
        [subtitle]="section() + ', the latest first'"
      />
      <ah-panel-body>
        @if (failure(); as problem) {
          <ah-banner
            [variant]="problem.variant"
            heading="The history could not be read"
            [tech]="problem.tech ?? ''"
          >
            {{ problem.text }}
          </ah-banner>
        } @else if (entries().length === 0) {
          <span class="ah-hint">No change yet.</span>
        } @else {
          <ol class="history" [attr.aria-label]="'Changes to ' + section()">
            @for (e of entries(); track e.id) {
              <li>
                <span class="ah-avatar" aria-hidden="true">{{
                  e.initials
                }}</span>
                <span class="history__text">
                  <span>{{ e.text }}</span>
                  <span class="ah-hint">{{ e.who }} · {{ e.at }}</span>
                </span>
              </li>
            }
          </ol>
        }
      </ah-panel-body>
      <ah-panel-foot>
        <span class="ah-hint">{{ footnote() }}</span>
      </ah-panel-foot>
    </ah-panel>
  `,
})
export class SettingsHistory {
  /** The section's name, as the heading and the list say it ("Teams"). */
  readonly section = input.required<string>();
  /** The section's changes, newest first. */
  readonly events = input.required<readonly SettingsEvent[]>();
  /** Why the history could not be read. */
  readonly error = input<ApiError | null>(null);
  /** The line under the list. */
  readonly footnote = input('Kept for good.');

  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();
  protected readonly failure = computed(() => {
    const error = this.error();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  protected readonly entries = computed(() =>
    this.events().map((e) => {
      const who = e.actorName ?? e.actor;
      return {
        id: e.id,
        text: describeSettingsEvent(e.type, e.payload),
        who,
        initials: initialsOf(who),
        at: absoluteDayTime(e.createdAt, this.now),
      };
    })
  );
}
