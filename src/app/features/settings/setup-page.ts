import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApiError } from '@core/api/api-error';
import type { SetupStep } from '@core/api/types';
import { SetupStore } from '@core/stores/setup-store';
import {
  nextSetupStep,
  setupPercent,
  setupProgressLabel,
  setupRemainderLabel,
} from '@domain/setup';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { DateTimePipe } from '@ui/pipes/date-time.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';

/** The mark each state shows, and its words for a screen reader. */
const MARKS: Readonly<
  Record<SetupStep['state'], { readonly mark: string; readonly label: string }>
> = {
  done: { mark: '✓', label: 'Done' },
  missing: { mark: '✕', label: 'Missing' },
  attention: { mark: '!', label: 'Needs a look' },
  optional: { mark: '○', label: 'Not set' },
};

/** What the button on a team step (an admin's) or on the reader's own step says, by its state. */
function actionLabel(step: SetupStep): string {
  if (step.state === 'done') return 'Open';
  if (step.state === 'optional') return 'Set';
  if (step.key === 'phases') return 'Review';
  if (step.group === 'you') return 'Fix';
  return `Fix in ${step.title}`;
}

/**
 * Team settings › Setup (`ahoy-hosted` design D23, §5 "Setup"): what the installation and the team still need before
 * stories can run, in the order an admin sets them, then the reader's own Copilot token. The installation's steps are read-only here (the chart fixes them);
 * each of the team's leads to the section that fixes it, and an admin may keep the phases' defaults from here. It saves
 * nothing else and spends nothing: every tick comes from the settings and from the checks the API already runs. 0 AIU.
 */
@Component({
  selector: 'ah-setup-page',
  imports: [
    Banner,
    Button,
    DateTimePipe,
    Panel,
    PanelBody,
    PanelHead,
    RouterLink,
    Skeleton,
  ],
  styles: [
    SECTION_STYLES,
    `
      .summary {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px 24px;
        padding: 16px;
      }
      .count {
        display: flex;
        flex-direction: column;
      }
      .count b {
        font-size: 30px;
        line-height: 1.1;
        color: var(--accent-text);
      }
      .progress {
        flex: 1 1 240px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bar {
        height: 8px;
        border-radius: 4px;
        background: var(--line-soft);
        overflow: hidden;
      }
      .bar span {
        display: block;
        height: 100%;
        background: var(--accent);
      }
      .checked {
        flex-basis: 100%;
        margin: 0;
        font-size: 12.5px;
      }
      .steps {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .step {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 12px 16px;
        border-top: 1px solid var(--line-soft);
      }
      .step:first-child {
        border-top: 0;
      }
      .mark {
        flex: 0 0 auto;
        display: inline-grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        font-size: 12px;
        font-weight: 700;
        background: var(--line-soft);
        color: var(--ink-muted);
      }
      .mark--done {
        background: var(--status-done-bg);
        color: var(--status-done-fg);
      }
      .mark--missing {
        background: var(--status-halted-bg);
        color: var(--status-halted-fg);
      }
      .mark--attention {
        background: var(--status-input-bg);
        color: var(--status-input-fg);
      }
      .what {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .title {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        font-weight: 600;
      }
      .detail {
        overflow-wrap: anywhere;
      }
      .actions {
        flex: 0 0 auto;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .side p {
        margin: 0;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Setup</h2>
      <span class="ah-muted"
        >What this Ahoy needs before the team can start voyages. Each tick comes
        from the settings and from the checks Ahoy already runs; the only thing
        saved here is keeping the phases' defaults.</span
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

    @if (!store.setup() && store.loading()) {
      <div class="ah-panel loading" role="status" aria-label="Loading setup">
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.setup(); as setup) {
      @if (!setup.canEdit) {
        <ah-banner variant="info" heading="Admins finish the setup">
          The steps are shown so you know where things are.
          <a routerLink="/settings/people">See who the admins are</a>.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <section class="ah-panel summary" aria-label="Progress">
            <div class="count">
              <b>{{ progress() }}</b>
              <span class="ah-muted">required steps done</span>
            </div>
            <div class="progress">
              <div
                class="bar"
                role="progressbar"
                aria-label="Required setup steps done"
                [attr.aria-valuenow]="percent()"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span [style.width.%]="percent()"></span>
              </div>
              <span class="ah-muted">{{ remainder() }}</span>
            </div>
            <button
              ahButton
              type="button"
              [disabled]="store.loading()"
              (click)="store.load()"
            >
              Check again
            </button>
            <p class="checked ah-muted">
              Checked at {{ setup.checkedAt | ahDateTime }}.
              @if (next(); as step) {
                Next: {{ step.title }}.
              }
            </p>
          </section>

          @if (keepError(); as problem) {
            <ah-banner
              [variant]="problem.variant"
              [heading]="problem.heading"
              [tech]="problem.tech ?? ''"
              >{{ problem.text }}</ah-banner
            >
          }

          <ah-panel>
            <ah-panel-head
              heading="Installation"
              subtitle="Read only here: change these in your values file or the Secrets, then upgrade the release."
            />
            <ah-panel-body>
              <ul class="steps">
                @for (step of installation(); track step.key) {
                  <li class="step" [attr.data-step]="step.key">
                    <span
                      [class]="'mark mark--' + step.state"
                      role="img"
                      [attr.aria-label]="marks[step.state].label"
                      >{{ marks[step.state].mark }}</span
                    >
                    <div class="what">
                      <span class="title"
                        >{{ step.title }}
                        @if (step.required) {
                          <span class="ah-tag ah-tag--outline">Required</span>
                        }
                      </span>
                      <span class="detail ah-muted">{{ step.detail }}</span>
                    </div>
                  </li>
                }
              </ul>
            </ah-panel-body>
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="Team"
              subtitle="Set in Team settings, the required ones first."
            />
            <ah-panel-body>
              <ul class="steps">
                @for (step of team(); track step.key) {
                  <li class="step" [attr.data-step]="step.key">
                    <span
                      [class]="'mark mark--' + step.state"
                      role="img"
                      [attr.aria-label]="marks[step.state].label"
                      >{{ marks[step.state].mark }}</span
                    >
                    <div class="what">
                      <span class="title"
                        >{{ step.title }}
                        @if (step.required) {
                          <span class="ah-tag ah-tag--outline">Required</span>
                        }
                      </span>
                      <span class="detail ah-muted">{{ step.detail }}</span>
                    </div>
                    @if (step.section !== null) {
                      <div class="actions">
                        @if (setup.canEdit) {
                          <a
                            [ahButton]="
                              step.required && step.state !== 'done'
                                ? 'primary'
                                : step.state === 'done'
                                  ? 'ghost'
                                  : 'default'
                            "
                            size="sm"
                            [routerLink]="'/settings/' + step.section"
                            >{{ action(step) }}</a
                          >
                          @if (step.key === 'phases' && step.state !== 'done') {
                            <button
                              ahButton="ghost"
                              size="sm"
                              type="button"
                              [disabled]="keeping()"
                              (click)="keepDefaults()"
                            >
                              Keep defaults
                            </button>
                          }
                        } @else {
                          <a
                            ahButton="ghost"
                            size="sm"
                            [routerLink]="'/settings/' + step.section"
                            >Open</a
                          >
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            </ah-panel-body>
          </ah-panel>

          @if (you().length > 0) {
            <ah-panel>
              <ah-panel-head
                heading="You"
                subtitle="Your own, never required: only you set them."
              />
              <ah-panel-body>
                <ul class="steps">
                  @for (step of you(); track step.key) {
                    <li class="step" [attr.data-step]="step.key">
                      <span
                        [class]="'mark mark--' + step.state"
                        role="img"
                        [attr.aria-label]="marks[step.state].label"
                        >{{ marks[step.state].mark }}</span
                      >
                      <div class="what">
                        <span class="title">{{ step.title }}</span>
                        <span class="detail ah-muted">{{ step.detail }}</span>
                      </div>
                      @if (step.section !== null) {
                        <div class="actions">
                          <a
                            [ahButton]="
                              step.state === 'done' ? 'ghost' : 'default'
                            "
                            size="sm"
                            [routerLink]="'/settings/' + step.section"
                            >{{ action(step) }}</a
                          >
                        </div>
                      }
                    </li>
                  }
                </ul>
              </ah-panel-body>
            </ah-panel>
          }
        </div>
        <aside class="side">
          <ah-panel>
            <ah-panel-head heading="What “required” means" />
            <ah-panel-body>
              <div class="body">
                <p>
                  Until every required step is done, everyone sees a banner
                  saying Ahoy is not ready, and voyages may fail where a step is
                  missing.
                </p>
                <p>
                  Optional steps turn features on. Leave them for later; the
                  page keeps listing them.
                </p>
                <p>
                  After an upgrade, open this page again: a new version may add
                  a step.
                </p>
              </div>
            </ah-panel-body>
          </ah-panel>
        </aside>
      </div>
    }
  `,
})
export class SetupPage {
  protected readonly store = inject(SetupStore);
  private readonly toasts = inject(ToastService);
  protected readonly marks = MARKS;
  protected readonly action = actionLabel;

  protected readonly installation = computed(
    () =>
      this.store.setup()?.steps.filter((s) => s.group === 'installation') ?? []
  );
  protected readonly team = computed(
    () => this.store.setup()?.steps.filter((s) => s.group === 'team') ?? []
  );
  protected readonly you = computed(
    () => this.store.setup()?.steps.filter((s) => s.group === 'you') ?? []
  );
  protected readonly progress = computed(() => {
    const setup = this.store.setup();
    return setup === null ? '' : setupProgressLabel(setup);
  });
  protected readonly percent = computed(() => {
    const setup = this.store.setup();
    return setup === null ? 0 : setupPercent(setup);
  });
  protected readonly remainder = computed(() => {
    const setup = this.store.setup();
    return setup === null ? '' : setupRemainderLabel(setup);
  });
  protected readonly next = computed(() => {
    const setup = this.store.setup();
    return setup === null ? null : nextSetupStep(setup);
  });
  protected readonly failure = computed(() => {
    const error = this.store.error();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  protected readonly keeping = signal(false);
  private readonly keepProblem = signal<ApiError | null>(null);
  protected readonly keepError = computed(() => {
    const error = this.keepProblem();
    return error === null ? null : settingsErrorView(error);
  });

  constructor() {
    void this.store.load();
  }

  /** Says the phases run on the defaults, so their step is done. */
  protected async keepDefaults(): Promise<void> {
    this.keeping.set(true);
    this.keepProblem.set(null);
    const error = await this.store.keepPhaseDefaults();
    this.keeping.set(false);
    if (error !== null) this.keepProblem.set(error);
    else this.toasts.show('The phases keep their defaults');
  }
}
