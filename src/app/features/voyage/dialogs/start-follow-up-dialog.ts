import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type {
  FollowUpIssueType,
  FollowUpPreview,
  FollowUpRoute,
  StartFollowUpRequest,
  Story,
} from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { formatAiu, parseAiu } from '@domain/aiu';
import { appendDecisions } from '@domain/follow-up-grill';
import {
  MAX_FOLLOW_UP_IMAGES,
  acceptFollowUpImages,
} from '@domain/follow-up-images';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import {
  ChoiceCardGroup,
  type ChoiceOption,
} from '@ui/choice-card/choice-card';
import { DialogService, DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { exactAiu } from './budget-dialog';
import { CommandState, type VoyageDialogData } from './dialog-support';
import {
  checkFollowUp,
  parseCriteria,
  type FollowUpInput,
  type FollowUpOrigin,
} from './follow-up-input';
import { FollowUpGrillPanel } from './follow-up-grill';
import { RaiseRevisionCeilingDialog } from './raise-revision-ceiling-dialog';

const SOURCES: readonly ChoiceOption<FollowUpOrigin>[] = [
  {
    value: 'jira',
    title: 'Link a Jira issue',
    description:
      'QA or someone already opened an issue for it. Ahoy reads it and adds your brief.',
  },
  {
    value: 'create',
    title: 'Create in Jira for me',
    description:
      'Ahoy opens the issue from your brief, links it to the first one and starts from it.',
  },
  {
    value: 'ahoy',
    title: 'Not in Jira',
    description:
      'Ahoy only: the follow-up gets its own key and the brief is its whole source.',
  },
];

/**
 * "Start a follow-up of PROJ-097?": continues a done voyage whose pull requests are merged, after QA found a problem. The
 * crew gets what the first voyage did (its delivery record and plan) and the person says what is new or missing; the
 * follow-up is a voyage of its own, linked to the first, and uses one of its revision rounds. It goes through planning
 * again, or straight to implementation when the change is small and in one repository of the earlier plan: Ahoy
 * suggests the route from the brief and the person has the last word.
 */
@Component({
  selector: 'ah-start-follow-up-dialog',
  imports: [
    Banner,
    Button,
    ChoiceCardGroup,
    DialogShell,
    Field,
    FieldControl,
    FollowUpGrillPanel,
    ReactiveFormsModule,
  ],
  styles: `
    .follow-up__shots {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
    }
    .follow-up__shot-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .follow-up__shots .ah-hint {
      margin: 0;
    }
  `,
  template: `
    <ah-dialog
      icon="reset"
      kind="sendback"
      [heading]="'Start a follow-up of ' + key() + '?'"
      [confirmLabel]="'Start follow-up · up to ' + budgetLabel() + ' AIU'"
      busyLabel="Starting…"
      [busy]="busy()"
      [confirmDisabled]="blocked()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >The follow-up is a new voyage linked to {{ key() }}, which stays done.
        The crew starts from what {{ key() }} delivered; you say what is new or
        missing.</span
      >
      @if (preview(); as p) {
        @if (!p.canStart) {
          <ah-banner
            ahDialogCost
            variant="error"
            heading="A follow-up cannot start now"
            announce="status"
          >
            {{ p.blockedReason ?? '' }}
            @if (ceilingReached()) {
              <button ahButton type="button" (click)="raiseCeiling()">
                Raise the revision ceiling
              </button>
            }
          </ah-banner>
        } @else {
          <ah-banner
            ahDialogCost
            variant="cost"
            [heading]="'This may spend up to ' + budgetLabel() + ' AIU'"
            >It uses revision round {{ p.revisions.used + 1 }} of
            {{ p.revisions.ceiling }} of {{ p.rootKey }}'s lineage and is billed
            to {{ actor() }}'s Copilot account.</ah-banner
          >
        }
      }
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ah-choice-card-group
          label="Where does the follow-up come from?"
          [options]="sources()"
          formControlName="source"
        />
        @if (isCreating()) {
          <ah-field
            label="Issue type"
            required
            hint="The type of the issue Ahoy creates in Jira."
          >
            <select ahInput formControlName="issueType">
              @for (type of issueTypes(); track type) {
                <option [value]="type">{{ type }}</option>
              }
            </select>
          </ah-field>
          <ah-field
            label="Title"
            required
            hint="The summary of the new Jira issue."
            [errorText]="problem('title') || serverError('title')"
          >
            <input ahInput formControlName="title" autocomplete="off" />
          </ah-field>
        } @else if (isAhoyOnly()) {
          <ah-field
            label="Key"
            hint="Given by Ahoy; the follow-up has no Jira issue."
          >
            <input ahInput [value]="preview()?.nextKey ?? ''" readonly />
          </ah-field>
          <ah-field label="Title" optional [errorText]="problem('title')">
            <input ahInput formControlName="title" autocomplete="off" />
          </ah-field>
        } @else {
          @if (defects().length > 0) {
            <ah-field
              label="Open defects linked to {{ preview()?.rootKey }}"
              optional
              hint="Linked in Jira and without a voyage yet. Picking one fills in the issue."
            >
              <select ahInput formControlName="defect">
                <option value="">Pick one, or enter a key below</option>
                @for (defect of defects(); track defect.key) {
                  <option [value]="defect.key">
                    {{ defect.key }} · {{ defect.summary }} ({{
                      defect.issueType
                    }}{{ defect.priority ? ', ' + defect.priority : '' }})
                  </option>
                }
              </select>
            </ah-field>
          }
          <ah-field
            label="Jira issue"
            required
            hint="The issue QA opened, or any issue that describes the work."
            [errorText]="problem('jiraKey') || serverError('source')"
          >
            <input
              ahInput
              mono
              formControlName="jiraKey"
              placeholder="PROJ-123"
              autocomplete="off"
            />
          </ah-field>
        }
        <ah-field
          label="What is new or missing"
          [required]="needsBrief()"
          [optional]="!needsBrief()"
          hint="In your words. Screenshots can be pasted here or added below."
          [errorText]="problem('text')"
        >
          <textarea
            ahInput
            rows="4"
            formControlName="text"
            (blur)="loadPreview()"
            (paste)="paste($event)"
          ></textarea>
        </ah-field>
        <div class="follow-up__shots">
          <input
            #picker
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            (change)="choose($event)"
          />
          <button
            ahButton="ghost"
            size="sm"
            type="button"
            [disabled]="shotBusy() || busy() || shots().length >= maxShots"
            (click)="picker.click()"
          >
            Add screenshot
          </button>
          <span class="ah-hint"
            >PNG, JPEG, WebP or GIF, up to 2 MB each and {{ maxShots }} in all.
            The crew looks at them while it plans.</span
          >
          @if (shots().length > 0) {
            <ul class="follow-up__shot-list" aria-label="Screenshots added">
              @for (shot of shots(); track shot.id) {
                <li class="ah-tag">
                  {{ shot.name }}
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    [attr.aria-label]="'Remove ' + shot.name"
                    [disabled]="shotBusy() || busy()"
                    (click)="removeShot(shot.id)"
                  >
                    ×
                  </button>
                </li>
              }
            </ul>
          }
          @if (shotHint(); as hint) {
            <p class="ah-hint" role="status">{{ hint }}</p>
          }
        </div>
        <ah-follow-up-grill
          [context]="context"
          [brief]="values().text ?? ''"
          [criteria]="briefCriteria()"
          (answered)="addDecisions($event)"
        />
        <ah-field
          label="Acceptance criteria"
          [required]="needsBrief()"
          [optional]="!needsBrief()"
          hint="One per line. They add to the criteria of the first voyage."
          [errorText]="problem('criteria') || serverError('brief')"
        >
          <textarea
            ahInput
            rows="3"
            formControlName="criteria"
            (blur)="loadPreview()"
          ></textarea>
        </ah-field>
        <ah-choice-card-group
          label="How should it start?"
          [options]="routes()"
          formControlName="route"
        />
        @if (fastPathHint(); as hint) {
          <p class="ah-hint follow-up__fast-path-hint">{{ hint }}</p>
        }
        @if (suggestion(); as s) {
          <p class="ah-hint">
            Ahoy suggests
            {{
              s.route === 'fast_path'
                ? 'going straight to implementation'
                : 'planning'
            }}:
            {{ s.reasons.join(' ') }}
          </p>
        }
        @if (isFastPath()) {
          <ah-field
            label="Repository"
            required
            [hint]="repositoryHint()"
            [errorText]="problem('repo') || serverError('repos')"
          >
            <select ahInput formControlName="repo">
              <option value="">Pick a repository</option>
              @for (repo of planRepos(); track repo.alias) {
                <option [value]="repo.alias">{{ repo.alias }}</option>
              }
            </select>
          </ah-field>
        }
        <ah-field
          label="Budget"
          required
          unit="AIU"
          hint="The most all the follow-up's runs may spend together."
          [errorText]="problem('budget') || serverError('budgetNanoAiu')"
        >
          <input
            ahInput
            formControlName="budget"
            inputmode="decimal"
            autocomplete="off"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class StartFollowUpDialog {
  protected readonly context = inject<VoyageDialogData>(DIALOG_DATA).context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);
  private readonly command = new CommandState<Story>();
  private readonly submitted = signal(false);
  private started = false;
  private destroyed = false;

  protected readonly maxShots = MAX_FOLLOW_UP_IMAGES;
  /** The screenshots staged so far, by the id `startFollowUp` claims them with. */
  protected readonly shots = signal<
    readonly { readonly id: string; readonly name: string }[]
  >([]);
  protected readonly shotHint = signal('');
  protected readonly shotBusy = signal(false);

  protected readonly actor = inject(CurrentUser).id;
  /** Creating the issue is offered only when Ahoy can write to Jira. */
  protected readonly sources = computed(() =>
    SOURCES.filter(
      (s) => s.value !== 'create' || this.preview()?.canCreateInJira === true
    )
  );
  protected readonly form = new FormGroup({
    source: new FormControl<FollowUpOrigin>('jira', { nonNullable: true }),
    issueType: new FormControl<FollowUpIssueType>('Bug', {
      nonNullable: true,
    }),
    defect: new FormControl('', { nonNullable: true }),
    jiraKey: new FormControl('', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true }),
    text: new FormControl('', { nonNullable: true }),
    criteria: new FormControl('', { nonNullable: true }),
    route: new FormControl<FollowUpRoute>('planning', { nonNullable: true }),
    repo: new FormControl('', { nonNullable: true }),
    budget: new FormControl(
      exactAiu(this.context.story()?.budgetNanoAiu ?? 0),
      { nonNullable: true }
    ),
  });
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly preview = signal<FollowUpPreview | null>(null);
  protected readonly briefCriteria = computed(() =>
    parseCriteria(this.values().criteria ?? '')
  );

  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly isAhoyOnly = computed(
    () => this.values().source === 'ahoy'
  );
  protected readonly isCreating = computed(
    () => this.values().source === 'create'
  );
  /** The brief is the whole source of the follow-up when no existing Jira issue holds it. */
  protected readonly needsBrief = computed(
    () => this.values().source !== 'jira'
  );
  protected readonly defects = computed(
    () => this.preview()?.linkedDefects ?? []
  );
  protected readonly issueTypes = computed(
    () => this.preview()?.issueTypes ?? []
  );
  protected readonly isFastPath = computed(
    () => this.values().route === 'fast_path'
  );
  protected readonly planRepos = computed(() =>
    (this.preview()?.repos ?? []).filter((repo) => repo.inEarlierPlan)
  );
  /** Why the fast path offers what it does: only the repositories the earlier plan worked in. */
  protected readonly fastPathHint = computed(() => {
    if (this.preview() === null) return '';
    const aliases = this.planRepos().map((repo) => repo.alias);
    return aliases.length === 0
      ? 'Straight to implementation is not available: the earlier plan has no repository to reuse. Plan again to include one.'
      : `Straight to implementation only offers the repositories the earlier plan worked in (${aliases.join(', ')}). To change another repository, plan again.`;
  });
  protected readonly repositoryHint = computed(
    () =>
      `One repository, from those the earlier plan worked in: ${this.planRepos()
        .map((repo) => repo.alias)
        .join(', ')}.`
  );
  protected readonly suggestion = computed(
    () => this.preview()?.suggestion ?? null
  );
  protected readonly routes = computed<readonly ChoiceOption<FollowUpRoute>[]>(
    () => [
      {
        value: 'planning',
        title: 'Plan again',
        description:
          'The crew plans only what is new, from what the first voyage delivered, and you review the plan.',
      },
      {
        value: 'fast_path',
        title: 'Straight to implementation',
        description:
          'For a small change in one repository: the earlier plan stands and no new plan is reviewed.',
        disabled: this.planRepos().length === 0,
      },
    ]
  );
  protected readonly blocked = computed(
    () => this.preview()?.canStart === false
  );
  protected readonly ceilingReached = computed(() => {
    const revisions = this.preview()?.revisions;
    return revisions !== undefined && revisions.used >= revisions.ceiling;
  });
  protected readonly budgetLabel = computed(() => {
    const nano = parseAiu(this.values().budget ?? '');
    return nano === null ? '…' : formatAiu(nano);
  });
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  private readonly problems = computed(() =>
    this.submitted() ? checkFollowUp(this.input()) : {}
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.started) return;
      for (const shot of this.shots())
        void this.context.removeFollowUpImage(shot.id);
    });
    this.form.controls.defect.valueChanges.subscribe((key) => {
      if (key !== '') this.form.controls.jiraKey.setValue(key);
    });
    void this.loadPreview();
  }

  protected problem(
    field: 'jiraKey' | 'title' | 'text' | 'criteria' | 'repo' | 'budget'
  ): string {
    return this.problems()[field] ?? '';
  }

  protected serverError(field: string): string {
    return this.command.fieldError(field);
  }

  /** Asks Ahoy what the brief looks like, for the suggested route; the route follows it until the person picks one. */
  protected async loadPreview(): Promise<void> {
    const value = this.form.getRawValue();
    const result = await this.context.previewFollowUp({
      criteria: parseCriteria(value.criteria).length,
      briefChars: value.text.trim().length,
    });
    if (!result.ok) return;
    const preview = result.value;
    this.preview.set(preview);
    const route = this.form.controls.route;
    if (!route.dirty && preview.suggestion.route !== route.value) {
      const fits =
        preview.suggestion.route !== 'fast_path' ||
        preview.repos.some((repo) => repo.inEarlierPlan);
      if (fits) route.setValue(preview.suggestion.route);
    }
    const repo = this.form.controls.repo;
    const candidates = preview.repos.filter((r) => r.inEarlierPlan);
    const [only] = candidates;
    if (repo.value === '' && candidates.length === 1 && only !== undefined)
      repo.setValue(only.alias);
  }

  /** Puts the decisions the person took from Grill me at the end of the brief. */
  protected addDecisions(block: string): void {
    const text = this.form.controls.text;
    text.setValue(appendDecisions(text.value, block));
    text.markAsDirty();
    void this.loadPreview();
  }

  /** Takes the screenshots pasted into the brief; pasted text goes in as usual. */
  protected paste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void this.take(files);
  }

  /** Takes the screenshots chosen with Add screenshot; the input is cleared so the same file can be chosen again. */
  protected choose(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.take(files);
  }

  /** Stages each screenshot at once, so it is on the API before the follow-up starts. */
  private async take(files: readonly File[]): Promise<void> {
    if (this.shotBusy() || this.busy()) {
      this.shotHint.set('Wait for the current screenshot or start to finish.');
      return;
    }
    const { images, refusal } = acceptFollowUpImages(
      files,
      MAX_FOLLOW_UP_IMAGES - this.shots().length
    );
    this.shotHint.set(refusal ?? '');
    this.shotBusy.set(true);
    try {
      for (const image of images) {
        const result = await this.context.attachFollowUpImage(image);
        if (this.destroyed) {
          if (result.ok) void this.context.removeFollowUpImage(result.value.id);
          return;
        }
        if (!result.ok) {
          this.shotHint.set(
            result.error.kind === 'problem' && result.error.detail
              ? result.error.detail
              : 'The screenshot could not be added. Try again.'
          );
          return;
        }
        this.shots.update((shots) => [
          ...shots,
          { id: result.value.id, name: image.name || 'Pasted screenshot' },
        ]);
      }
    } finally {
      this.shotBusy.set(false);
    }
  }

  /** Takes a staged screenshot out of the brief. */
  protected async removeShot(id: string): Promise<void> {
    if (this.shotBusy() || this.busy()) return;
    this.shotBusy.set(true);
    try {
      const result = await this.context.removeFollowUpImage(id);
      if (result.ok) this.shots.update((s) => s.filter((x) => x.id !== id));
      else this.shotHint.set('The screenshot could not be removed.');
    } finally {
      this.shotBusy.set(false);
    }
  }

  protected raiseCeiling(): void {
    this.dialogs
      .open<Story, VoyageDialogData, RaiseRevisionCeilingDialog>(
        RaiseRevisionCeilingDialog,
        { data: { context: this.context } }
      )
      .closed.subscribe((story) => {
        if (story !== undefined) void this.loadPreview();
      });
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    const input = this.input();
    if (
      Object.keys(checkFollowUp(input)).length > 0 ||
      this.blocked() ||
      this.shotBusy()
    )
      return;
    const text = input.text.trim();
    const request: Omit<
      StartFollowUpRequest,
      'expectedVersion' | 'confirmSpend'
    > = {
      source:
        input.source === 'jira'
          ? { jiraKey: input.jiraKey.trim() }
          : input.source === 'create'
            ? { createInJira: { issueType: input.issueType } }
            : { ahoyOnly: true },
      ...(input.source !== 'jira' && input.title.trim() !== ''
        ? { title: input.title.trim() }
        : {}),
      brief: { text, criteria: [...parseCriteria(input.criteria)] },
      ...(this.shots().length > 0
        ? { imageIds: this.shots().map((shot) => shot.id) }
        : {}),
      route: input.route,
      ...(input.route === 'fast_path' ? { repos: [input.repo] } : {}),
      budgetNanoAiu: parseAiu(input.budget) ?? 0,
    };
    const story = this.command.settle(
      await this.context.startFollowUp(request)
    );
    if (story === null) return;
    this.started = true;
    this.toasts.show(
      input.source === 'create'
        ? `Created ${story.key} in Jira and started its follow-up.`
        : `Follow-up ${story.key} started.`
    );
    this.ref.close(story);
    void this.router.navigate(['/voyages', story.key]);
  }

  private input(): FollowUpInput {
    return this.values() as FollowUpInput;
  }
}
