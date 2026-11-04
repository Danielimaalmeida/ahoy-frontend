import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import type {
  DefectSettings,
  DefectSettingsChange,
  JiraBacklogPreview,
} from '@core/api/types';
import {
  componentsOf,
  componentsText,
  prioritiesOf,
  prioritiesText,
} from '@domain/defect-settings';
import { MAX_BACKLOG_JQL_CHARS } from '@domain/jira-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { DefectSettingsStore } from './defect-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** The form's value: the watch as 'on' or 'off', and the query, the priorities and the component map as typed. */
interface FormValue {
  readonly watch: 'on' | 'off';
  readonly jql: string;
  readonly priorities: string;
  readonly components: string;
}

/** The saved settings as the form shows them. */
function formValueOf(settings: DefectSettings): FormValue {
  return {
    watch: settings.watchOn ? 'on' : 'off',
    jql: settings.defectsJql ?? '',
    priorities: prioritiesText(settings.priorities),
    components: componentsText(settings.components),
  };
}

/** What the query's Preview found, or why it could not. */
type PreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | {
      readonly kind: 'done';
      readonly jql: string;
      readonly answer: JiraBacklogPreview;
    }
  | { readonly kind: 'failed'; readonly jql: string; readonly error: ApiError };

/**
 * Team settings › Defects (`ahoy-hosted` design §5 "Defect watch"): whether the reconciler reads the team's defects
 * query, the priorities it tries and which repository fixes each Jira component. The watch only reads Jira and judges
 * each defect by fixed rules, at 0 AIU: it starts no voyage, so turning it on asks for no confirmation.
 */
@Component({
  selector: 'ah-defect-settings-page',
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
    SettingsHistory,
    Skeleton,
  ],
  providers: [DefectSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .fields {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .fields > * {
        max-width: 560px;
      }
      .preview {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .ok,
      .bad {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-weight: 600;
      }
      .ok {
        color: var(--status-done-fg);
      }
      .bad {
        color: var(--danger-text);
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
        overflow-wrap: anywhere;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Defects</h2>
      <span class="ah-muted"
        >Which Jira defects Ahoy watches, and which it could try to fix. The
        watch reads Jira every 15 minutes and lists them in the Backlog; it
        starts no voyage and spends no AIU.</span
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
        aria-label="Loading the defect settings"
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
              heading="Defect watch"
              subtitle="Read with the Jira connection of Team settings › Jira. A defect Ahoy could try says how to reproduce it, maps to one repository and has a priority tried here."
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
                    label="Watch"
                    hint="On: the reconciler reads the query every 15 minutes. Off: the list keeps what it last read."
                  >
                    <select ahInput [formControl]="form.controls.watch">
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </ah-field>
                  <ah-field
                    label="Defects query (JQL)"
                    hint="The open defects of your product, for example: project = PROJ AND issuetype = Defect AND statusCategory != Done"
                    [errorText]="jqlError() ?? ''"
                  >
                    <textarea
                      ahInput
                      mono
                      rows="3"
                      spellcheck="false"
                      [attr.maxlength]="maxJql"
                      [formControl]="form.controls.jql"
                    ></textarea>
                  </ah-field>
                  <div class="preview">
                    <button
                      ahButton="soft"
                      size="sm"
                      type="button"
                      [disabled]="
                        value().jql.trim() === '' || preview().kind === 'busy'
                      "
                      (click)="runPreview()"
                    >
                      {{
                        preview().kind === 'busy' ? 'Asking Jira…' : 'Preview'
                      }}
                    </button>
                    @if (previewAnswer(); as answer) {
                      <span class="ok" role="status"
                        ><ah-icon name="check" [size]="12" />{{
                          matchLabel(answer.total)
                        }}</span
                      >
                      @if (answer.first; as first) {
                        <span class="ah-hint"
                          >The first is
                          <span class="ah-key">{{ first.key }}</span>
                          {{ first.summary }}</span
                        >
                      }
                    }
                    @if (previewProblem(); as problem) {
                      <span class="bad" role="status"
                        ><ah-icon name="aground" [size]="12" />{{
                          problem.heading
                        }}</span
                      >
                      <span class="ah-hint">{{ problem.text }}</span>
                    }
                  </div>
                  <ah-field
                    label="Priorities tried"
                    optional
                    hint="As Jira names them, separated by commas. Empty: any priority."
                    [errorText]="prioritiesError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      [formControl]="form.controls.priorities"
                    />
                  </ah-field>
                  <ah-field
                    label="Components and repositories"
                    hint="One a line, as component = repository. A defect whose components map to no repository, or to several, stays out."
                    [errorText]="componentsError() ?? ''"
                  >
                    <textarea
                      ahInput
                      mono
                      rows="5"
                      spellcheck="false"
                      [formControl]="form.controls.components"
                    ></textarea>
                  </ah-field>
                </div>
              } @else {
                <dl>
                  <dt>Watch</dt>
                  <dd>{{ page.defects.watchOn ? 'On' : 'Off' }}</dd>
                  <dt>Defects query</dt>
                  <dd>
                    @if (page.defects.defectsJql; as jql) {
                      <code>{{ jql }}</code>
                    } @else {
                      <span class="ah-muted">Not set</span>
                    }
                  </dd>
                  <dt>Priorities tried</dt>
                  <dd>
                    {{
                      page.defects.priorities.length === 0
                        ? 'Any'
                        : page.defects.priorities.join(', ')
                    }}
                  </dd>
                  <dt>Components</dt>
                  <dd>
                    @if (page.defects.components.length === 0) {
                      <span class="ah-muted">None mapped</span>
                    } @else {
                      <ul>
                        @for (
                          pair of page.defects.components;
                          track pair.component
                        ) {
                          <li>{{ pair.component }} → {{ pair.repository }}</li>
                        }
                      </ul>
                    }
                  </dd>
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
                    [disabled]="!dirty() || saving() || invalid()"
                    (click)="save(page.defects)"
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
            section="Defects"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. Jira is read with the connection of Team settings › Jira."
          />
        </aside>
      </div>
    }
  `,
})
export class DefectSettingsPage {
  protected readonly store = inject(DefectSettingsStore);
  private readonly toasts = inject(ToastService);
  protected readonly maxJql = MAX_BACKLOG_JQL_CHARS;

  /** The settings as typed; they follow the saved settings until the admin changes one. */
  protected readonly form = new FormGroup({
    watch: new FormControl<'on' | 'off'>('off', { nonNullable: true }),
    jql: new FormControl('', { nonNullable: true }),
    priorities: new FormControl('', { nonNullable: true }),
    components: new FormControl('', { nonNullable: true }),
  });
  /** The form's whole value, disabled controls too, as a signal. */
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** The saved settings, as the API last answered them. */
  private readonly saved = computed(() => this.store.page()?.defects ?? null);
  /** What the form would save, or null while a field is refused. */
  private readonly typed = computed(() => {
    const value = this.value();
    const priorities = prioritiesOf(value.priorities);
    const components = componentsOf(value.components);
    if ('problem' in priorities || 'problem' in components) return null;
    const jql = value.jql.trim();
    return {
      watchOn: value.watch === 'on',
      defectsJql: jql === '' ? null : jql,
      priorities: priorities.value,
      components: components.value,
    };
  });
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const was = formValueOf(saved);
    const value = this.value();
    return (
      value.watch !== was.watch ||
      value.jql.trim() !== was.jql ||
      value.priorities.trim() !== was.priorities ||
      value.components.trim() !== was.components
    );
  });
  protected readonly jqlError = computed(() =>
    this.value().watch === 'on' && this.value().jql.trim() === ''
      ? 'The watch needs a defects query.'
      : null
  );
  protected readonly prioritiesError = computed(() => {
    const read = prioritiesOf(this.value().priorities);
    return 'problem' in read ? read.problem : null;
  });
  protected readonly componentsError = computed(() => {
    const read = componentsOf(this.value().components);
    return 'problem' in read ? read.problem : null;
  });
  protected readonly invalid = computed(
    () => this.typed() === null || this.jqlError() !== null
  );
  protected readonly saving = signal(false);
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
  protected readonly preview = signal<PreviewState>({ kind: 'idle' });
  protected readonly previewAnswer = computed(() => {
    const p = this.preview();
    return p.kind === 'done' && p.jql === this.value().jql.trim()
      ? p.answer
      : null;
  });
  protected readonly previewProblem = computed(() => {
    const p = this.preview();
    if (p.kind !== 'failed' || p.jql !== this.value().jql.trim()) return null;
    return settingsErrorView(p.error);
  });

  constructor() {
    void this.store.load();
    // The form follows the saved settings until the admin changes one; a save or a change elsewhere moves it on.
    effect(() => {
      const saved = this.saved();
      if (saved !== null && this.form.pristine) this.show(saved);
    });
    effect(() => {
      if (this.saving()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** "12 issues match". */
  protected matchLabel(total: number): string {
    if (total === 0) return 'No issue matches';
    return total === 1 ? '1 issue matches' : `${total} issues match`;
  }

  /** Puts the saved settings back. */
  protected reset(): void {
    const saved = this.saved();
    if (saved !== null) this.show(saved);
    this.saveError.set(null);
  }

  /** Shows the saved settings, as yet unchanged. */
  private show(settings: DefectSettings): void {
    this.form.reset(formValueOf(settings));
  }

  /** Asks Jira how many issues the typed query matches. Nothing is saved. */
  protected async runPreview(): Promise<void> {
    const jql = this.value().jql.trim();
    if (jql === '' || this.preview().kind === 'busy') return;
    this.preview.set({ kind: 'busy' });
    const result = await this.store.preview(jql);
    this.preview.set(
      result.ok
        ? { kind: 'done', jql, answer: result.value }
        : { kind: 'failed', jql, error: result.error }
    );
  }

  /** Saves what changed, with the version the page read. */
  protected async save(saved: DefectSettings): Promise<void> {
    const typed = this.typed();
    if (this.saving() || !this.dirty() || typed === null || this.invalid())
      return;
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    const body: DefectSettingsChange = {
      ...(saved.version !== null ? { version: saved.version } : {}),
      ...(typed.watchOn !== saved.watchOn ? { watchOn: typed.watchOn } : {}),
      ...(typed.defectsJql !== saved.defectsJql
        ? { defectsJql: typed.defectsJql }
        : {}),
      ...(!same(typed.priorities, saved.priorities)
        ? { priorities: [...typed.priorities] }
        : {}),
      ...(!same(typed.components, saved.components)
        ? { components: [...typed.components] }
        : {}),
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
    this.show(result.value.defects);
    this.toasts.show(
      typed.watchOn && !saved.watchOn
        ? 'Watch on. Defect settings saved.'
        : 'Defect settings saved.'
    );
  }
}
