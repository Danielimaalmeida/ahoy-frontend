import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { isInvalidState, type ApiError } from '@core/api/api-error';
import {
  copilotTestView,
  copilotTokenProblem,
  MAX_COPILOT_TOKEN_CHARS,
} from '@domain/copilot-token';
import { tokenLabel } from '@domain/settings';
import { absoluteDay, absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { CopilotTokenStore } from './copilot-token-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';

/**
 * Team settings › You › My Copilot token (`ahoy-hosted` design D23, §5 "My Copilot token"): each person's own Copilot
 * PAT, which the runs they start in the cluster use. It is pasted once, sealed by the API and never shown again, only
 * its last four characters; nobody else reads or changes it, admins included. Test asks GitHub who it is (0 AIU).
 */
@Component({
  selector: 'ah-copilot-token-page',
  imports: [
    Banner,
    Button,
    Field,
    FieldControl,
    Icon,
    Panel,
    PanelBody,
    PanelFoot,
    PanelHead,
    ReactiveFormsModule,
    Skeleton,
  ],
  providers: [CopilotTokenStore],
  styles: [
    SECTION_STYLES,
    `
      form {
        max-width: 520px;
      }
      .remove p {
        margin: 0;
      }
      .side p {
        margin: 0;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>My Copilot token</h2>
      <span class="ah-muted"
        >Your own token, for the runs you start. Only you see or change it,
        admins included; Ahoy keeps it encrypted and never shows it again.</span
      >
    </div>

    @if (noQnumber()) {
      <ah-banner variant="info" heading="Not for this sign-in">
        A personal Copilot token needs a sign-in with a qnumber.
      </ah-banner>
    } @else if (failure(); as problem) {
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
        aria-label="Loading your Copilot token"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.secretsConfigured) {
        <ah-banner variant="notice" heading="A token can't be saved now">
          The API has no AHOY_SECRETS_KEY to store it encrypted. Ask whoever
          runs Ahoy; until then your runs use the cluster's Secret, if there is
          one.
        </ah-banner>
      } @else if (page.token && !page.tokenReadable) {
        <ah-banner variant="error" heading="Paste the token again">
          The API's key no longer opens the stored token, so your runs use the
          cluster's Secret until you save it again.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head heading="Token" [subtitle]="subtitle()">
              @if (page.token) {
                <span ahPanelActions class="row">
                  <button
                    ahButton
                    size="sm"
                    type="button"
                    [disabled]="busy() || !page.tokenReadable"
                    (click)="test()"
                  >
                    {{ testing() ? 'Testing…' : 'Test' }}
                  </button>
                </span>
              }
            </ah-panel-head>
            @if (page.token; as token) {
              @if (lastTest(); as last) {
                @if (!last.view.good) {
                  <div class="body">
                    <ah-banner
                      variant="error"
                      [heading]="last.view.heading ?? ''"
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
                  <span class="ah-hint">Saved {{ day(token.savedAt) }}</span>
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
            }
            <ah-panel-body>
              <form (submit)="$event.preventDefault(); save()">
                <ah-field
                  [label]="page.token ? 'New token' : 'Personal access token'"
                  hint="A fine-grained token on your Copilot account with only the Copilot Requests permission. Stored encrypted; never shown again."
                  [errorText]="touched() ? (problem() ?? '') : ''"
                >
                  <input
                    ahInput
                    mono
                    type="password"
                    autocomplete="new-password"
                    spellcheck="false"
                    [attr.maxlength]="maxToken"
                    [attr.placeholder]="
                      page.token ? 'Replaces ' + hint(page.token.hint) : null
                    "
                    [formControl]="control"
                  />
                </ah-field>
              </form>
              @if (changeFailure(); as problem) {
                <ah-banner
                  [variant]="problem.variant"
                  [heading]="problem.heading"
                  [tech]="problem.tech ?? ''"
                >
                  {{ problem.text }}
                </ah-banner>
              }
              @if (page.token && confirmingRemove()) {
                <div class="remove">
                  <p>
                    Remove your token {{ hint(page.token.hint) }}? Your runs
                    then use the cluster's Secret, and fail to sign in to
                    Copilot if there is none.
                  </p>
                </div>
              }
            </ah-panel-body>
            <ah-panel-foot>
              <span class="row foot">
                @if (page.token) {
                  @if (confirmingRemove()) {
                    <button
                      ahButton="ghost"
                      type="button"
                      [disabled]="busy()"
                      (click)="confirmingRemove.set(false)"
                    >
                      Keep it
                    </button>
                    <button
                      ahButton="danger-outline"
                      type="button"
                      [disabled]="busy()"
                      (click)="remove()"
                    >
                      Remove the token
                    </button>
                  } @else {
                    <button
                      ahButton="ghost"
                      type="button"
                      [disabled]="busy()"
                      (click)="confirmingRemove.set(true)"
                    >
                      Remove…
                    </button>
                  }
                }
                <button
                  ahButton="primary"
                  type="button"
                  [disabled]="busy() || !page.secretsConfigured"
                  (click)="save()"
                >
                  {{
                    saving() ? 'Saving…' : page.token ? 'Replace' : 'Save token'
                  }}
                </button>
              </span>
            </ah-panel-foot>
          </ah-panel>
        </div>

        <aside class="side">
          <ah-panel>
            <ah-panel-head heading="Where it is used" />
            <ah-panel-body>
              <div class="body">
                <p>
                  Planning, review and the other runs in the cluster use the
                  token of whoever started the story. Each run gets it in a
                  Secret of its own, deleted when the run ends.
                </p>
                <p>
                  Implementation on GitHub Actions still reads your
                  AHOY_COPILOT_{{ upper(page.qnumber) }} secret in the
                  repository.
                </p>
                <p>Test only asks GitHub who the token is: it spends no AIU.</p>
              </div>
            </ah-panel-body>
          </ah-panel>
        </aside>
      </div>
    }
  `,
})
export class CopilotTokenPage {
  protected readonly store = inject(CopilotTokenStore);
  private readonly toasts = inject(ToastService);
  protected readonly hint = tokenLabel;
  protected readonly maxToken = MAX_COPILOT_TOKEN_CHARS;
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  protected readonly control = new FormControl('', { nonNullable: true });
  private readonly typed = toSignal(this.control.valueChanges, {
    initialValue: '',
  });
  protected readonly touched = signal(false);
  protected readonly problem = computed(() =>
    copilotTokenProblem(this.typed())
  );
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly busy = computed(() => this.saving() || this.testing());
  protected readonly confirmingRemove = signal(false);
  private readonly changeError = signal<ApiError | null>(null);
  protected readonly changeFailure = computed(() => {
    const error = this.changeError();
    return error === null ? null : settingsErrorView(error);
  });
  /** The API's answer for a sign-in that is not a qnumber: no personal token. */
  protected readonly noQnumber = computed(() => {
    const error = this.store.loadError();
    return error !== null && isInvalidState(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  /** Which token the person's runs use: this one, or the cluster's Secret. */
  protected readonly subtitle = computed(() => {
    const page = this.store.page();
    if (page === null || page.token !== null)
      return 'Your runs in the cluster use this one.';
    return `Not saved: your runs use the cluster's ahoy-copilot-${page.qnumber} Secret, if there is one.`;
  });
  /** The last test, in words. */
  protected readonly lastTest = computed(() => {
    const last = this.store.page()?.token?.lastTest ?? null;
    return last === null
      ? null
      : { at: last.at, view: copilotTestView(last.result, last.detail) };
  });

  constructor() {
    void this.store.load();
  }

  /** The day the token was saved. */
  protected day(at: string): string {
    return absoluteDay(at, this.now);
  }

  /** The day and time of a test. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** The qnumber as the repository secret's name has it. */
  protected upper(qnumber: string): string {
    return qnumber.toUpperCase();
  }

  /** Saves the pasted token, then clears the field. */
  protected async save(): Promise<void> {
    this.touched.set(true);
    if (this.problem() !== null || this.busy()) return;
    this.saving.set(true);
    this.changeError.set(null);
    const result = await this.store.save(this.typed().trim());
    this.saving.set(false);
    if (!result.ok) {
      this.changeError.set(result.error);
      return;
    }
    this.control.reset('');
    this.touched.set(false);
    this.confirmingRemove.set(false);
    this.toasts.show(
      'Your Copilot token is saved. Test it to see that GitHub takes it.'
    );
  }

  /** Removes the token, after the second press. */
  protected async remove(): Promise<void> {
    if (this.busy()) return;
    this.saving.set(true);
    this.changeError.set(null);
    const result = await this.store.remove();
    this.saving.set(false);
    this.confirmingRemove.set(false);
    if (!result.ok) this.changeError.set(result.error);
    else this.toasts.show('Your Copilot token is removed.');
  }

  /** Asks GitHub who the token is; the answer shows as the last test. */
  protected async test(): Promise<void> {
    if (this.busy()) return;
    this.testing.set(true);
    this.changeError.set(null);
    const result = await this.store.test();
    this.testing.set(false);
    if (!result.ok) {
      this.changeError.set(result.error);
      return;
    }
    if (result.value.result === 'works')
      this.toasts.show(
        copilotTestView('works', result.value.detail).label + '.'
      );
  }
}
