import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import type { ProductSettings, ProductSettingsChange } from '@core/api/types';
import {
  confluenceSpacesOf,
  jiraProjectOf,
  PRODUCT_REPOSITORIES_MAX,
  repositoriesOf,
} from '@domain/product-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { ProductSettingsStore } from './product-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** The form's value: the defaults as typed. */
interface FormValue {
  readonly jiraProject: string;
  readonly spaces: string;
  readonly repositories: string;
}

/** The saved defaults as the form shows them. */
function formValueOf(settings: ProductSettings): FormValue {
  return {
    jiraProject: settings.jiraProject ?? '',
    spaces: settings.confluenceSpaces.join(', '),
    repositories: settings.repositories.join(', '),
  };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Team settings › Product (`ahoy-hosted` design D24): what every Product conversation starts with, so nobody pins the
 * same things each time. The Jira project is where the agent searches first and proposes new epics, and a bare `#120`
 * in a question is one of its issues; the Confluence spaces narrow its searches; the repositories are pinned. A
 * conversation already started keeps what it has. The model is the Product conversations phase's, set in Phases.
 */
@Component({
  selector: 'ah-product-settings-page',
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
    RouterLink,
    SettingsHistory,
    Skeleton,
  ],
  providers: [ProductSettingsStore],
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
      .model {
        margin: 14px 0 0;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Product</h2>
      <span class="ah-muted"
        >What every conversation on the Product page starts with, so nobody pins
        the same things each time.</span
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
        aria-label="Loading the Product settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to make you one in
          People.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Conversation defaults"
              [subtitle]="
                page.product.version === null
                  ? 'Not saved yet: conversations start with nothing.'
                  : 'Conversations started from now on begin with these; one already started keeps what it has.'
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
                    label="Jira project"
                    hint="Where the agent searches first and proposes new epics. #120 in a question means an issue of this project."
                    [errorText]="projectError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      placeholder="PROJ"
                      [formControl]="form.controls.jiraProject"
                    />
                  </ah-field>
                  <ah-field
                    label="Confluence spaces"
                    hint="The space keys it searches, separated by commas. Empty: every space the token can see."
                    [errorText]="spacesError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      placeholder="BILL, PROD"
                      [formControl]="form.controls.spaces"
                    />
                  </ah-field>
                  <ah-field
                    label="Repositories"
                    [hint]="
                      'Pinned in every new conversation, at most ' +
                      repositoriesMax +
                      ': the names the content repository maps, separated by commas.'
                    "
                    [errorText]="repositoriesError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      placeholder="web, api"
                      [formControl]="form.controls.repositories"
                    />
                  </ah-field>
                </div>
              } @else {
                <dl>
                  <dt>Jira project</dt>
                  <dd>{{ page.product.jiraProject ?? 'None' }}</dd>
                  <dt>Confluence spaces</dt>
                  <dd>
                    {{
                      page.product.confluenceSpaces.join(', ') || 'Every space'
                    }}
                  </dd>
                  <dt>Repositories</dt>
                  <dd>{{ page.product.repositories.join(', ') || 'None' }}</dd>
                </dl>
              }
              <p class="ah-hint model">
                Model: {{ page.model.model ?? "the agent profile's"
                }}{{
                  page.model.reasoningEffort
                    ? ', effort ' + page.model.reasoningEffort
                    : ''
                }}. A person can pick another for one conversation.
                <a routerLink="/settings/phases">Change it in Phases</a>
              </p>
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
                      projectError() !== null ||
                      spacesError() !== null ||
                      repositoriesError() !== null
                    "
                    (click)="save(page.product)"
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
            section="Product"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good."
          />
        </aside>
      </div>
    }
  `,
})
export class ProductSettingsPage {
  protected readonly store = inject(ProductSettingsStore);
  private readonly toasts = inject(ToastService);
  protected readonly repositoriesMax = PRODUCT_REPOSITORIES_MAX;

  /** The defaults as typed; it follows the saved ones until the admin changes one. */
  protected readonly form = new FormGroup({
    jiraProject: new FormControl('', { nonNullable: true }),
    spaces: new FormControl('', { nonNullable: true }),
    repositories: new FormControl('', { nonNullable: true }),
  });
  /** The form's whole value, disabled controls too, as a signal. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** The saved defaults, as the API last answered them. */
  private readonly saved = computed(() => this.store.page()?.product ?? null);
  /** What the form would save, field by field, or null for a field that does not read. */
  private readonly typed = computed(() => {
    const value = this.value();
    const project = jiraProjectOf(value.jiraProject);
    const spaces = confluenceSpacesOf(value.spaces);
    const repositories = repositoriesOf(value.repositories);
    return {
      jiraProject: 'value' in project ? project.value : undefined,
      spaces: 'value' in spaces ? spaces.value : undefined,
      repositories: 'value' in repositories ? repositories.value : undefined,
    };
  });
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const typed = this.typed();
    return (
      typed.jiraProject !== saved.jiraProject ||
      typed.spaces === undefined ||
      !sameList(typed.spaces, saved.confluenceSpaces) ||
      typed.repositories === undefined ||
      !sameList(typed.repositories, saved.repositories)
    );
  });
  protected readonly projectError = computed(() => {
    const read = jiraProjectOf(this.value().jiraProject);
    return 'problem' in read ? read.problem : null;
  });
  protected readonly spacesError = computed(() => {
    const read = confluenceSpacesOf(this.value().spaces);
    return 'problem' in read ? read.problem : null;
  });
  protected readonly repositoriesError = computed(() => {
    const read = repositoriesOf(this.value().repositories);
    return 'problem' in read ? read.problem : null;
  });
  protected readonly saving = signal(false);
  private readonly saveError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() => {
    const error = this.saveError();
    if (error === null) return null;
    return isStale(error)
      ? {
          ...settingsErrorView(error),
          text: 'Another admin saved these defaults first. The page now shows theirs: make your change again.',
        }
      : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
    // The form follows the saved defaults until the admin changes one; a save or a change elsewhere moves it on.
    effect(() => {
      const saved = this.saved();
      if (saved !== null && this.form.pristine) this.show(saved);
    });
    effect(() => {
      if (this.saving()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** Puts the saved defaults back. */
  protected reset(): void {
    const saved = this.saved();
    if (saved !== null) this.show(saved);
    this.saveError.set(null);
  }

  /** Shows the saved defaults, as yet unchanged. */
  private show(settings: ProductSettings): void {
    this.form.reset(formValueOf(settings));
  }

  /** Saves the defaults that changed. */
  protected async save(saved: ProductSettings): Promise<void> {
    if (this.saving() || !this.dirty()) return;
    const typed = this.typed();
    if (
      typed.jiraProject === undefined ||
      typed.spaces === undefined ||
      typed.repositories === undefined
    )
      return;
    const body: ProductSettingsChange = {
      ...(saved.version !== null ? { version: saved.version } : {}),
      ...(typed.jiraProject !== saved.jiraProject
        ? { jiraProject: typed.jiraProject }
        : {}),
      ...(!sameList(typed.spaces, saved.confluenceSpaces)
        ? { confluenceSpaces: [...typed.spaces] }
        : {}),
      ...(!sameList(typed.repositories, saved.repositories)
        ? { repositories: [...typed.repositories] }
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
    this.show(result.value.product);
    this.toasts.show('Product defaults saved.');
  }
}
