import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import type { MeetingSettings, MeetingSettingsChange } from '@core/api/types';
import { MEETING_LABEL_MAX, meetingLabelOf } from '@domain/meeting-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { MeetingSettingsStore } from './meeting-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** The form's value: the two names as typed. */
interface FormValue {
  readonly us: string;
  readonly them: string;
}

/** The saved names as the form shows them. */
function formValueOf(settings: MeetingSettings): FormValue {
  return { us: settings.usLabel, them: settings.themLabel };
}

/** Why a name as typed is refused, or null. */
function problemOf(typed: string): string | null {
  const read = meetingLabelOf(typed);
  return 'problem' in read ? read.problem : null;
}

/**
 * Team settings › Meetings (`ahoy-hosted` design D23): the names the meeting pages give the two sides of a meeting,
 * ours and the stakeholders'. They are tags on each topic, in the end-of-meeting summary and in the Confluence page;
 * the topics themselves keep only which side raised them, so a rename shows on every meeting at once.
 */
@Component({
  selector: 'ah-meeting-settings-page',
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
  providers: [MeetingSettingsStore],
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
      <h2>Meetings</h2>
      <span class="ah-muted"
        >The names the meeting pages give the two sides of a meeting: on each
        topic, in the summary and in the Confluence page.</span
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
        aria-label="Loading the meeting settings"
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

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="The two sides"
              [subtitle]="
                page.meetings.version === null
                  ? 'Not saved yet: the meeting pages use the defaults below.'
                  : 'A rename shows on every meeting, past ones too.'
              "
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
                    label="Our side"
                    [hint]="
                      'Your team, as the topics it raises are tagged (1 to ' +
                      max +
                      ' characters).'
                    "
                    [errorText]="usError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      [formControl]="form.controls.us"
                    />
                  </ah-field>
                  <ah-field
                    label="Stakeholders' side"
                    [hint]="
                      'The people you meet, such as the business or the client (1 to ' +
                      max +
                      ' characters).'
                    "
                    [errorText]="themError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      [formControl]="form.controls.them"
                    />
                  </ah-field>
                </div>
              } @else {
                <dl>
                  <dt>Our side</dt>
                  <dd>{{ page.meetings.usLabel }}</dd>
                  <dt>Stakeholders' side</dt>
                  <dd>{{ page.meetings.themLabel }}</dd>
                </dl>
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
                    [disabled]="!dirty() || saving()"
                    (click)="reset()"
                  >
                    Cancel
                  </button>
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="
                      !dirty() ||
                      saving() ||
                      usError() !== null ||
                      themError() !== null
                    "
                    (click)="save(page.meetings)"
                  >
                    {{ saving() ? 'Saving…' : 'Save' }}
                  </button>
                </span>
              </ah-panel-foot>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Meetings"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good."
          />
        </aside>
      </div>
    }
  `,
})
export class MeetingSettingsPage {
  protected readonly store = inject(MeetingSettingsStore);
  private readonly toasts = inject(ToastService);
  protected readonly max = MEETING_LABEL_MAX;

  /** The two names as typed; it follows the saved names until the admin changes one. */
  protected readonly form = new FormGroup({
    us: new FormControl('', { nonNullable: true }),
    them: new FormControl('', { nonNullable: true }),
  });
  /** The form's whole value, disabled controls too, as a signal. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** The saved names, as the API last answered them. */
  private readonly saved = computed(() => this.store.page()?.meetings ?? null);
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const value = this.value();
    return (
      value.us.trim() !== saved.usLabel || value.them.trim() !== saved.themLabel
    );
  });
  protected readonly usError = computed(() => problemOf(this.value().us));
  protected readonly themError = computed(() => problemOf(this.value().them));
  protected readonly saving = signal(false);
  private readonly saveError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() => {
    const error = this.saveError();
    if (error === null) return null;
    return isStale(error)
      ? {
          ...settingsErrorView(error),
          text: 'Another admin saved these names first. The page now shows theirs: make your change again.',
        }
      : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
    // The form follows the saved names until the admin changes one; a save or a change elsewhere moves it on.
    effect(() => {
      const saved = this.saved();
      if (saved !== null && this.form.pristine) this.show(saved);
    });
    effect(() => {
      if (this.saving()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** Puts the saved names back. */
  protected reset(): void {
    const saved = this.saved();
    if (saved !== null) this.show(saved);
    this.saveError.set(null);
  }

  /** Shows the saved names, as yet unchanged. */
  private show(settings: MeetingSettings): void {
    this.form.reset(formValueOf(settings));
  }

  /** Saves the names that changed. */
  protected async save(saved: MeetingSettings): Promise<void> {
    if (this.saving() || !this.dirty()) return;
    const value = this.form.getRawValue();
    const us = meetingLabelOf(value.us);
    const them = meetingLabelOf(value.them);
    if ('problem' in us || 'problem' in them) return;
    const body: MeetingSettingsChange = {
      ...(saved.version !== null ? { version: saved.version } : {}),
      ...(us.value !== saved.usLabel ? { usLabel: us.value } : {}),
      ...(them.value !== saved.themLabel ? { themLabel: them.value } : {}),
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
    this.show(result.value.meetings);
    this.toasts.show('Meeting names saved.');
  }
}
