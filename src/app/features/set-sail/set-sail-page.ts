import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, merge } from 'rxjs';
import { ApiClient } from '@core/api/api-client';
import type { ModelCatalog } from '@core/api/types';
import { StoriesStore } from '@core/stores/stories-store';
import { CurrentUser } from '@core/auth/current-user';
import { MODEL_SLOTS } from '@domain/models';
import { PHASES } from '@domain/phases';
import type { ModelSlot } from '@domain/types';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Icon } from '@ui/icon/icon';
import type {
  EffortChoice,
  ModelChoiceControls,
} from '@ui/model-choice/model-choice';
import { ModelChoiceTable } from '@ui/model-choice/model-choice';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { ToastService } from '@ui/toast/toast';
import {
  MODEL_MESSAGES,
  budgetValidator,
  keyValidator,
  modelValidator,
  titleValidator,
} from './set-sail-validators';
import type { FeedbackField } from './start-errors';
import { NO_FEEDBACK, startFeedback, withoutField } from './start-errors';
import {
  budgetNanoAiu,
  buildStartRequest,
  chosenModel,
  describeAiu,
  modelProblem,
  normalizeKey,
} from './start-request';

/** A model slot's two controls: the model id as text and the reasoning effort. */
function modelGroup(): FormGroup<ModelChoiceControls> {
  return new FormGroup({
    model: new FormControl('', {
      nonNullable: true,
      validators: [modelValidator],
    }),
    effort: new FormControl<EffortChoice>('', { nonNullable: true }),
  });
}

/** The text of a query-string value, or `null` when it is missing or not a single string (it comes from outside). */
function singleText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Set sail (`/voyages/new?key=&title=`): a typed Reactive Form for the key, title, budget and per-slot models, sent as
 * `startStory`. The budget is read as integer nano-AIU (never a float) and only the slots the user filled in are sent.
 */
@Component({
  selector: 'ah-set-sail',
  imports: [
    Banner,
    Button,
    Field,
    FieldControl,
    Icon,
    ModelChoiceTable,
    Panel,
    PanelBody,
    PanelHead,
    ReactiveFormsModule,
    RouterLink,
  ],
  styles: `
    :host {
      display: block;
    }
    .set-sail {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .set-sail__title {
      margin: 6px 0 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .set-sail__layout {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      align-items: flex-start;
    }
    .set-sail__main {
      /* A fieldset, so the fields lock while the request is out; reset what browsers give a fieldset. */
      border: 0;
      margin: 0;
      padding: 0;
      flex: 999 1 620px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .set-sail__aside {
      flex: 1 1 320px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .set-sail__back {
      font-size: 12px;
      text-decoration: none;
    }
    .set-sail__facts {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 6px 14px;
      margin: 0;
    }
    .set-sail__facts dt {
      color: var(--ink-muted);
    }
    .set-sail__facts dd {
      margin: 0;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .set-sail__check {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      color: var(--ink);
    }
    .set-sail__tick {
      display: inline-flex;
      flex: none;
      margin-top: 2px;
      color: var(--accent);
    }
    .set-sail__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .set-sail__retry {
      margin-top: var(--space-1\\.5);
    }
    .set-sail__submit {
      flex: 1;
    }
    .set-sail__how {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
    }
    .set-sail__row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .set-sail__cell {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }
    @media (max-width: 600px) {
      .set-sail__row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <div class="set-sail">
      <header>
        @if (fromDocks()) {
          <a routerLink="/docks" class="set-sail__back">← Back to Backlog</a>
        }
        <h1 class="set-sail__title">Start a new voyage</h1>
        <div class="ah-muted">
          Start a Jira story in Ahoy. You become its owner, and its runs bill
          your personal Copilot account.
        </div>
      </header>

      <form
        class="set-sail__layout"
        [formGroup]="form"
        (ngSubmit)="submit()"
        novalidate
      >
        <fieldset class="set-sail__main" [disabled]="submitting()">
          <ah-panel>
            <ah-panel-head heading="The story">
              @if (fromDocks()) {
                <span class="ah-tag ah-tag--accent"
                  >Filled in from Backlog</span
                >
              }
            </ah-panel-head>
            <ah-panel-body>
              <div class="set-sail__row">
                <div class="set-sail__cell">
                  <ah-field
                    label="Jira key"
                    required
                    hint="Like PROJ-123. One voyage per key."
                    [errorText]="feedback().key ?? ''"
                  >
                    <input
                      ahInput
                      mono
                      formControlName="key"
                      (input)="onKeyInput($event)"
                      autocomplete="off"
                      spellcheck="false"
                    />
                  </ah-field>
                  @if (feedback().existingKey; as existing) {
                    <a [routerLink]="['/voyages', existing]"
                      >Open {{ existing }}</a
                    >
                  }
                </div>
                <div class="set-sail__cell">
                  <ah-field
                    label="Total budget"
                    required
                    unit="AIU"
                    [errorText]="feedback().budget ?? ''"
                    hint="A hard cap for every run of this voyage together. You can raise it later."
                  >
                    <input
                      ahInput
                      formControlName="budget"
                      inputmode="decimal"
                      autocomplete="off"
                    />
                  </ah-field>
                </div>
              </div>
              <div class="set-sail__cell">
                <ah-field
                  label="Title"
                  optional
                  hint="Shown next to the key in lists."
                  [errorText]="feedback().title ?? ''"
                >
                  <input ahInput formControlName="title" autocomplete="off" />
                </ah-field>
              </div>
            </ah-panel-body>
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="Agents and models"
              subtitle="Optional. Leave a field blank and the server decides."
            />
            <ah-panel-body>
              <ah-model-choice-table
                [rows]="modelRows()"
                [controls]="modelControls"
                [models]="catalog()?.models ?? []"
              />
              @if (catalogLoading()) {
                <span class="ah-hint" role="status"
                  >Loading model catalogue…</span
                >
              } @else if (catalogError()) {
                <ah-banner tone="warn">
                  {{ catalogError() }}
                  <button
                    type="button"
                    ahButton="soft"
                    size="sm"
                    (click)="loadCatalog()"
                  >
                    Try again
                  </button>
                </ah-banner>
              }
              <span class="ah-hint"
                >Choose a model from the server's catalogue, or select Other
                model id. This list does not guarantee access from your Copilot
                account; the worker checks the model and effort before the first
                prompt (0 AIU) and anchors the voyage if they're refused.</span
              >
              <span class="ah-hint"
                >A model chosen without an effort runs at that model's own
                default.</span
              >
            </ah-panel-body>
          </ah-panel>
        </fieldset>

        <aside class="set-sail__aside">
          <ah-panel>
            <ah-panel-head heading="Before you sail" />
            <ah-panel-body>
              <dl class="set-sail__facts">
                <dt>Voyage</dt>
                <dd class="ah-mono">{{ voyageKey() || '—' }}</dd>
                <dt>Owner</dt>
                <dd>{{ user.id() }} (you)</dd>
                <dt>Budget cap</dt>
                <dd>{{ cap() === null ? '—' : cap() + ' AIU' }}</dd>
                <dt>First crew</dt>
                <dd>Navigator reads the Jira issue</dd>
              </dl>
              <div class="set-sail__check">
                <span class="set-sail__tick"><ah-icon name="check" /></span>
                <span
                  >Runs bill <b>your</b> Copilot account,
                  {{
                    cap() === null
                      ? 'up to the cap you set'
                      : 'up to ' + cap() + ' AIU'
                  }}. Nothing beyond the cap is spent.</span
                >
              </div>
              <div class="set-sail__check">
                <span class="set-sail__tick"><ah-icon name="check" /></span>
                <span
                  >The crew stops for questions and at every human gate. Nothing
                  is approved automatically.</span
                >
              </div>
              <div class="set-sail__check">
                <span class="set-sail__tick"><ah-icon name="check" /></span>
                <span>Anyone on the crew can stop the voyage at any time.</span>
              </div>
              @if (feedback().banner; as banner) {
                <ah-banner
                  variant="error"
                  announce="alert"
                  [heading]="banner.heading"
                  [tech]="banner.tech"
                >
                  {{ banner.text }}
                  @if (banner.retry) {
                    <div class="set-sail__retry">
                      <button
                        type="button"
                        ahButton="soft"
                        size="sm"
                        (click)="submit()"
                      >
                        Try again
                      </button>
                    </div>
                  }
                </ah-banner>
              }
              <div class="set-sail__actions">
                <button
                  type="submit"
                  ahButton="primary"
                  size="lg"
                  class="set-sail__submit"
                  [disabled]="submitting()"
                  [attr.aria-busy]="submitting() ? 'true' : null"
                >
                  <ah-icon name="sail" />
                  {{ submitLabel() }}
                </button>
                <a ahButton size="lg" [routerLink]="cancelLink()">Cancel</a>
              </div>
            </ah-panel-body>
          </ah-panel>
          <ah-panel>
            <ah-panel-body>
              <h2 class="set-sail__how">How a voyage goes</h2>
              <div class="ah-hint">{{ phases }}</div>
            </ah-panel-body>
          </ah-panel>
        </aside>
      </form>
    </div>
  `,
})
export class SetSailPage {
  protected readonly catalog = signal<ModelCatalog | null>(null);
  protected readonly catalogLoading = signal(false);
  protected readonly catalogError = signal('');
  /** `?key=` from The Docks (route input binding). Untrusted: only a single string is used. */
  readonly key = input<unknown>();
  /** `?title=` from The Docks (route input binding). Untrusted: only a single string is used. */
  readonly title = input<unknown>();

  protected readonly user = inject(CurrentUser);
  /** The seven phases of a voyage, as the "How a voyage goes" card lists them. */
  protected readonly phases = PHASES.join(' → ');

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly stories = inject(StoriesStore);
  private readonly toasts = inject(ToastService);

  protected readonly form = new FormGroup({
    key: new FormControl('', { nonNullable: true, validators: [keyValidator] }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [titleValidator],
    }),
    budget: new FormControl('', {
      nonNullable: true,
      validators: [budgetValidator],
    }),
    models: new FormGroup({
      intake: modelGroup(),
      planning: modelGroup(),
      implementation: modelGroup(),
      review: modelGroup(),
    }),
  });

  /** The controls of each slot, as the Models table wants them. */
  protected readonly modelControls: Readonly<
    Record<ModelSlot, ModelChoiceControls>
  > = {
    intake: this.form.controls.models.controls.intake.controls,
    planning: this.form.controls.models.controls.planning.controls,
    implementation: this.form.controls.models.controls.implementation.controls,
    review: this.form.controls.models.controls.review.controls,
  };

  /** What the form holds, kept current as the user types. */
  private readonly values = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    }
  );

  /** The key as it will be sent, or "" while blank. */
  protected readonly voyageKey = computed(() =>
    normalizeKey(this.values().key)
  );

  /** The budget as an AIU amount ("25", "25.5"), or `null` while the text is not a usable amount. */
  protected readonly cap = computed(() => {
    const nano = budgetNanoAiu(this.values().budget);
    return nano === null ? null : describeAiu(nano);
  });

  protected readonly submitLabel = computed(() =>
    this.submitting()
      ? 'Starting voyage…'
      : this.cap() === null
        ? 'Start voyage'
        : `Start voyage · up to ${this.cap()} AIU`
  );

  /** The page was opened from Backlog, which passes the key. */
  protected readonly fromDocks = computed(
    () => (singleText(this.key())?.trim() ?? '') !== ''
  );

  /** Cancel goes back where the user came from: The Docks, or the list of voyages. */
  protected readonly cancelLink = computed(() =>
    this.fromDocks() ? '/docks' : '/voyages'
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  /** False once the user has left the page: a late answer still counts, but must not move them or touch the view. */
  private alive = true;
  private readonly injector = inject(Injector);

  /**
   * The Models table's rows: a slot the user filled in says "Your choice" (and can be reset); a blank one says nothing,
   * because the server decides (G5). A model id the API would refuse is flagged on its row.
   */
  protected readonly modelRows = computed(() =>
    MODEL_SLOTS.map((slot) => {
      const values = this.values().models[slot];
      const fallback = this.catalog()?.defaults.find(
        (entry) => entry.slot === slot
      );
      const problem = modelProblem(values.model);
      const error =
        problem !== null
          ? MODEL_MESSAGES[problem]
          : this.feedback().models[slot];
      return {
        slot,
        ...(fallback?.model != null ? { defaultModel: fallback.model } : {}),
        ...(values.model === '' && fallback?.reasoningEffort != null
          ? { defaultEffort: fallback.reasoningEffort }
          : {}),
        ...(chosenModel(values) !== null
          ? { source: 'Your choice', chosen: true }
          : {}),
        ...(error !== undefined ? { error } : {}),
      };
    })
  );

  protected readonly submitting = signal(false);

  /** What the API said was wrong with the last attempt. Typed text is never replaced by it. */
  protected readonly feedback = signal(NO_FEEDBACK);

  constructor() {
    // The API's word on a field is out of date once the user edits that field.
    const forget = (field: FeedbackField): void =>
      this.feedback.update((feedback) => withoutField(feedback, field));
    const { controls } = this.form;
    controls.key.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => forget('key'));
    controls.title.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => forget('title'));
    controls.budget.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => forget('budget'));
    for (const slot of MODEL_SLOTS) {
      const { model, effort } = this.modelControls[slot];
      merge(model.valueChanges, effort.valueChanges)
        .pipe(takeUntilDestroyed())
        .subscribe(() => forget(slot));
    }
    // The query string describes the prefill: when it changes (history, a link to another key) the form follows it, and
    // a title or key it no longer has goes blank. Typing does not run this, it only reads the two inputs.
    effect(() => {
      const key = singleText(this.key());
      const title = singleText(this.title());
      untracked(() => {
        this.form.controls.key.setValue(normalizeKey(key ?? ''));
        this.form.controls.title.setValue(title ?? '');
      });
    });
    this.destroyRef.onDestroy(() => (this.alive = false));
    void this.loadCatalog();
  }

  protected async loadCatalog(): Promise<void> {
    if (this.catalogLoading()) return;
    this.catalogLoading.set(true);
    this.catalogError.set('');
    try {
      const result = await this.api.listModels();
      if (!this.alive) return;
      if (result.ok) this.catalog.set(result.value);
      else
        this.catalogError.set(
          'Could not load the model catalogue. Try again, or use Other model id.'
        );
    } finally {
      if (this.alive) this.catalogLoading.set(false);
    }
  }

  /** Writes the key in capitals as it is typed, keeping the caret where it was. */
  protected onKeyInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const upper = input.value.toUpperCase();
    if (upper === input.value) return;
    const { selectionStart, selectionEnd } = input;
    input.value = upper;
    input.setSelectionRange(selectionStart, selectionEnd);
    this.form.controls.key.setValue(upper);
  }

  /**
   * Once the errors are on screen: moves the focus to the first field that shows one, or, when only a banner explains the
   * refusal, scrolls it into view (it sits above the button, which can be below the fold on a phone).
   */
  private focusFirstProblem(): void {
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
        if (field !== null) field.focus();
        else
          root
            .querySelector('.ah-banner')
            ?.scrollIntoView({ block: 'nearest' });
      },
      { injector: this.injector }
    );
  }

  /**
   * Sends `startStory`; on success shows a toast and opens the voyage. A second submit while the request is out (a double
   * click, Enter after a click) does nothing, and the button stays held until the voyage is open or the request failed.
   */
  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    this.feedback.set(NO_FEEDBACK);
    this.form.markAllAsTouched();
    const request = this.form.invalid
      ? null
      : buildStartRequest(this.form.getRawValue());
    if (request === null) {
      this.focusFirstProblem();
      return;
    }
    this.submitting.set(true);
    try {
      const result = await this.api.startStory(request);
      if (!result.ok) {
        // After the user left, the view is gone: `afterNextRender` on it throws NG0911.
        if (this.alive) {
          this.feedback.set(startFeedback(result.error, request.key));
          this.focusFirstProblem();
        }
        return;
      }
      this.stories.upsert(result.value);
      this.toasts.show(`Voyage ${result.value.key} set sail.`);
      if (this.alive)
        await this.router.navigate(['/voyages', result.value.key]);
    } finally {
      this.submitting.set(false);
    }
  }
}
