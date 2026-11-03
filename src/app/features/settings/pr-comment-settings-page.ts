import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import type {
  PrCommentSettings,
  PrCommentSettingsChange,
} from '@core/api/types';
import { commentsLabel, commentsPerRoundOf } from '@domain/pr-comment-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { PrCommentSettingsStore } from './pr-comment-settings-store';
import { PrRepliesDialog } from './pr-replies-dialog';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** The form's value: replies as 'on' or 'off', and the comments per round as typed. */
interface FormValue {
  readonly replies: 'on' | 'off';
  readonly perRound: string;
}

/** The saved settings as the form shows them. */
function formValueOf(settings: PrCommentSettings): FormValue {
  return {
    replies: settings.repliesOn ? 'on' : 'off',
    perRound: String(settings.commentsPerRound),
  };
}

/**
 * Team settings › Pull request comments (`ahoy-hosted` design §4 "PR comments"): whether Ahoy posts its replies to the
 * comments the reviewer ruled on, and how many comments one review round is given. Turning replies on posts on
 * colleagues' pull requests, so saving that asks the admin to confirm first. Where the deployment's reconciler cannot
 * post (it does not dispatch with Docker or Kubernetes), the page says the replies wait whatever is chosen.
 */
@Component({
  selector: 'ah-pr-comment-settings-page',
  imports: [
    Banner,
    Button,
    Field,
    FieldControl,
    Panel,
    PanelBody,
    PanelFoot,
    PanelHead,
    ReactiveFormsModule,
    SettingsHistory,
    Skeleton,
  ],
  providers: [PrCommentSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .fields {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .fields > * {
        max-width: 420px;
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 6px 16px;
      }
      dt {
        font-weight: 600;
      }
      dd {
        margin: 0;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Pull request comments</h2>
      <span class="ah-muted"
        >How Ahoy answers the comments on a voyage's pull requests: Copilot's in
        every review round, people's when someone clicks Assess comments.</span
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
        aria-label="Loading the pull request comment settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to add you to
          AHOY_ADMIN_QNUMBERS.
        </ah-banner>
      }
      @if (!page.repliesPostable) {
        <ah-banner
          variant="notice"
          heading="This deployment cannot post replies"
        >
          Its reconciler does not run agents with Docker or Kubernetes, so it
          reads no real GitHub: the replies wait in Ahoy whatever is chosen
          here.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Replies and review rounds"
              subtitle="Ahoy writes every reply itself, from the reviewer's ruling; no agent posts on GitHub."
            >
              @if (dirty()) {
                <span ahPanelActions class="ah-tag ah-tag--outline"
                  >Unsaved changes</span
                >
              }
            </ah-panel-head>
            <ah-panel-body>
              @if (store.canEdit()) {
                <div class="fields">
                  <ah-field
                    label="Replies on GitHub"
                    hint="On: the reconciler posts each reply once the review has ruled, and resolves a fixed thread. Off: the replies wait, shown on the voyage."
                  >
                    <select ahInput [formControl]="form.controls.replies">
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </ah-field>
                  <ah-field
                    label="Comments per round"
                    [hint]="
                      'The most comments one review round is given, oldest first (1 to ' +
                      page.maxCommentsPerRound +
                      '); the rest wait for the next round.'
                    "
                    [errorText]="perRoundError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      inputmode="numeric"
                      autocomplete="off"
                      maxlength="3"
                      [formControl]="form.controls.perRound"
                    />
                  </ah-field>
                </div>
              } @else {
                <dl>
                  <dt>Replies on GitHub</dt>
                  <dd>{{ page.prComments.repliesOn ? 'On' : 'Off' }}</dd>
                  <dt>Comments per round</dt>
                  <dd>{{ perRoundLabel(page.prComments.commentsPerRound) }}</dd>
                </dl>
              }
              @if (turningOn()) {
                <ah-banner
                  variant="notice"
                  heading="Turning replies on posts on your colleagues' pull requests"
                >
                  The replies waiting now are posted too. Saving asks you to
                  confirm.
                </ah-banner>
              }
              @if (saveFailure(); as problem) {
                <ah-banner
                  [variant]="problem.variant"
                  [heading]="problem.heading"
                  [tech]="problem.tech ?? ''"
                >
                  {{ problem.text }}
                </ah-banner>
              }
            </ah-panel-body>
            @if (store.canEdit()) {
              <ah-panel-foot>
                <span class="row foot">
                  <button
                    ahButton="ghost"
                    type="button"
                    [disabled]="!dirty() || busy()"
                    (click)="reset()"
                  >
                    Cancel
                  </button>
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="!dirty() || busy() || perRoundError() !== null"
                    (click)="save(page.prComments, page.maxCommentsPerRound)"
                  >
                    {{ saving() ? 'Saving…' : turningOn() ? 'Save…' : 'Save' }}
                  </button>
                </span>
              </ah-panel-foot>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Pull request comments"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. The GitHub login the replies are posted with is set in the deployment."
          />
        </aside>
      </div>
    }
  `,
})
export class PrCommentSettingsPage {
  protected readonly store = inject(PrCommentSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);

  /** Replies and the comments per round as chosen; it follows the saved settings until the admin changes one. */
  protected readonly form = new FormGroup({
    replies: new FormControl<'on' | 'off'>('off', { nonNullable: true }),
    perRound: new FormControl('', { nonNullable: true }),
  });
  /** The form's whole value, disabled controls too, as a signal. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** The saved settings, as the API last answered them. */
  private readonly saved = computed(
    () => this.store.page()?.prComments ?? null
  );
  private readonly max = computed(
    () => this.store.page()?.maxCommentsPerRound ?? 1
  );
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const was = formValueOf(saved);
    const value = this.value();
    return (
      value.replies !== was.replies || value.perRound.trim() !== was.perRound
    );
  });
  /** Whether the form turns replies on: saving it asks for a confirmation. */
  protected readonly turningOn = computed(
    () => this.saved()?.repliesOn === false && this.value().replies === 'on'
  );
  protected readonly perRoundError = computed(() => {
    const read = commentsPerRoundOf(this.value().perRound, this.max());
    return 'problem' in read ? read.problem : null;
  });
  /** Waiting for the admin to confirm turning replies on. */
  private readonly confirming = signal(false);
  protected readonly saving = signal(false);
  /** Saving, or asking first: nothing else can be pressed. */
  protected readonly busy = computed(() => this.saving() || this.confirming());
  private readonly saveError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() => {
    const error = this.saveError();
    if (error === null) return null;
    return isStale(error)
      ? {
          ...settingsErrorView(error),
          text: 'Another admin saved these settings first. The page now shows theirs: make your change again.',
        }
      : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
    // The form follows the saved settings until the admin changes one; a save or a change elsewhere moves it on.
    effect(() => {
      const saved = this.saved();
      if (saved !== null && this.form.pristine) this.show(saved);
    });
    effect(() => {
      if (this.busy()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** "10 comments". */
  protected perRoundLabel(n: number): string {
    return commentsLabel(n);
  }

  /** Puts the saved settings back. */
  protected reset(): void {
    const saved = this.saved();
    if (saved !== null) this.show(saved);
    this.saveError.set(null);
  }

  /** Shows the saved settings, as yet unchanged. */
  private show(settings: PrCommentSettings): void {
    this.form.reset(formValueOf(settings));
  }

  /** Saves what changed; turning replies on asks first and is sent with `confirmReplies`. */
  protected async save(saved: PrCommentSettings, max: number): Promise<void> {
    if (this.busy() || !this.dirty()) return;
    const value = this.form.getRawValue();
    const perRound = commentsPerRoundOf(value.perRound, max);
    if ('problem' in perRound) return;
    const turningOn = this.turningOn();
    if (turningOn) {
      this.confirming.set(true);
      const ref = this.dialogs.open<boolean>(PrRepliesDialog, {
        width: '480px',
      });
      const confirmed = (await firstValueFrom(ref.closed)) === true;
      this.confirming.set(false);
      if (!confirmed) return;
    }
    const repliesOn = value.replies === 'on';
    const body: PrCommentSettingsChange = {
      ...(saved.version !== null ? { version: saved.version } : {}),
      ...(repliesOn !== saved.repliesOn ? { repliesOn } : {}),
      ...(perRound.value !== saved.commentsPerRound
        ? { commentsPerRound: perRound.value }
        : {}),
      ...(turningOn ? { confirmReplies: true } : {}),
    };
    this.saving.set(true);
    this.saveError.set(null);
    const result = await this.store.change(body);
    this.saving.set(false);
    if (!result.ok) {
      this.saveError.set(result.error);
      // Someone else saved first: show theirs rather than send this change over it with their version.
      const now = this.saved();
      if (isStale(result.error) && now !== null) this.show(now);
      return;
    }
    this.show(result.value.prComments);
    this.toasts.show(
      turningOn
        ? 'Replies on. Pull request comment settings saved.'
        : 'Pull request comment settings saved.'
    );
  }
}
