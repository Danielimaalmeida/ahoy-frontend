import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { isInvalidState, type ApiError } from '@core/api/api-error';
import type { ConfluencePage, Meeting } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import {
  MAX_CONFLUENCE_TITLE_CHARS,
  confluencePagePath,
  confluencePageTitle,
  confluenceTitleProblem,
} from '@domain/meetings';
import { Banner } from '@ui/banner/banner';
import {
  ChoiceCardGroup,
  type ChoiceOption,
} from '@ui/choice-card/choice-card';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { confluencePageErrorView, meetingErrorView } from './meeting-errors';
import { SEARCH_PAUSE_MS, type MeetingsStore } from './meetings-store';

/** What the Create in Confluence dialog is opened with: the page's store, the meeting and its page as wiki markup. */
export interface CreateConfluencePageData {
  readonly store: MeetingsStore;
  readonly meeting: Meeting;
  readonly body: string;
}

/** Refuses a title the API would, with its reason as the message. */
const titleValidator: ValidatorFn = (control) => {
  const problem =
    typeof control.value === 'string'
      ? confluenceTitleProblem(control.value)
      : null;
  return problem === null ? null : { title: problem };
};

/**
 * "Create in Confluence": picks the parent page from a search (the series' last parent first), takes the title (the
 * meeting's title and day by default) and creates the page with the meeting as Copy for Confluence writes it. The page
 * is created as the owner of the token in Team settings. Closes with the meeting, which now has its page.
 */
@Component({
  selector: 'ah-create-confluence-page-dialog',
  imports: [
    Banner,
    ChoiceCardGroup,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
    RouterLink,
  ],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .pages {
      max-height: 280px;
      overflow-y: auto;
    }
  `,
  template: `
    <ah-dialog
      icon="document"
      heading="Create in Confluence"
      [subtitle]="data.meeting.title"
      confirmLabel="Create page"
      busyLabel="Creating…"
      [busy]="busy()"
      [confirmDisabled]="form.invalid"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >The page holds the meeting as Copy for Confluence writes it, and is
        created as the owner of Confluence's token in Team settings.</span
      >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field
          label="Find the parent page"
          optional
          hint="Words its title starts with. Empty shows the latest changed."
        >
          <input
            ahInput
            type="search"
            [formControl]="query"
            autocomplete="off"
            (keydown.enter)="$event.preventDefault()"
          />
        </ah-field>
        <p class="ah-hint" role="status">{{ searchStatus() }}</p>
        @if (searchProblem(); as problem) {
          @if (notConnected()) {
            <ah-banner variant="notice" heading="Confluence isn't connected"
              >An admin connects it in
              <a routerLink="/settings/confluence" (click)="ref.close()"
                >Team settings › Confluence</a
              >.</ah-banner
            >
          } @else {
            <ah-banner
              [variant]="problem.variant"
              [heading]="problem.heading"
              [tech]="problem.tech ?? ''"
              >{{ problem.text ?? '' }}</ah-banner
            >
          }
        }
        @if (options().length > 0) {
          <div class="pages">
            <ah-choice-card-group
              label="Parent page"
              [options]="options()"
              formControlName="parentId"
            />
          </div>
        }
        <ah-field label="Title" required>
          <input
            ahInput
            formControlName="title"
            autocomplete="off"
            [attr.maxlength]="max"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class CreateConfluencePageDialog {
  protected readonly data = inject<CreateConfluencePageData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<Meeting>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly clock = inject(CLOCK);

  protected readonly max = MAX_CONFLUENCE_TITLE_CHARS;
  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly form = new FormGroup({
    parentId: new FormControl<string | null>(
      this.data.meeting.confluenceParent?.id ?? null,
      { validators: [Validators.required] }
    ),
    title: new FormControl(confluencePageTitle(this.data.meeting), {
      nonNullable: true,
      validators: [titleValidator],
    }),
  });

  /** The pages found for the last query, and that query; null until the first answer. */
  private readonly found = signal<{
    readonly q: string;
    readonly pages: readonly ConfluencePage[];
  } | null>(null);
  private readonly searching = signal(false);
  private readonly searchError = signal<ApiError | null>(null);
  private readonly picked = toSignal(this.form.controls.parentId.valueChanges, {
    initialValue: this.form.controls.parentId.value,
  });
  /** The picked page as last shown, kept on top when a new search no longer finds it. */
  private readonly pickedOption = signal<ChoiceOption<string> | null>(
    this.data.meeting.confluenceParent === null
      ? null
      : {
          value: this.data.meeting.confluenceParent.id,
          title: this.data.meeting.confluenceParent.title,
          description: 'Where the last page of this series went',
        }
  );
  private timer: Timer | null = null;
  private generation = 0;

  protected readonly busy = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : confluencePageErrorView(failure);
  });

  /** The pages to pick from: the picked one first when the search did not find it, then the pages found. */
  protected readonly options = computed<readonly ChoiceOption<string>[]>(() => {
    const pages = (this.found()?.pages ?? []).map((page) => ({
      value: page.id,
      title: page.title,
      description: confluencePagePath(page),
    }));
    const picked = this.pickedOption();
    return picked !== null &&
      picked.value === this.picked() &&
      !pages.some((p) => p.value === picked.value)
      ? [picked, ...pages]
      : pages;
  });

  protected readonly notConnected = computed(() => {
    const error = this.searchError();
    return error !== null && isInvalidState(error);
  });
  protected readonly searchProblem = computed(() => {
    const error = this.searchError();
    return error === null ? null : meetingErrorView(error);
  });
  /** Said politely as the results change: searching, how many pages, or none. */
  protected readonly searchStatus = computed(() => {
    if (this.searching()) return 'Looking for pages…';
    const found = this.found();
    if (found === null) return '';
    const n = found.pages.length;
    if (found.q === '')
      return n === 0
        ? 'No pages to show.'
        : n === 1
          ? '1 page changed lately.'
          : `${n} pages changed lately.`;
    return n === 0
      ? `No pages match “${found.q}”.`
      : n === 1
        ? '1 page matches.'
        : `${n} pages match.`;
  });

  constructor() {
    this.query.valueChanges.subscribe((q) => this.search(q));
    this.form.controls.parentId.valueChanges.subscribe((id) => {
      const option = this.options().find((o) => o.value === id);
      if (option !== undefined) this.pickedOption.set(option);
    });
    inject(DestroyRef).onDestroy(() => this.timer?.cancel());
    void this.runSearch('', ++this.generation);
  }

  /** Searches after a short pause, so typing asks once; an answer to an older text is dropped. */
  private search(q: string): void {
    const text = q.trim().slice(0, 100);
    const generation = ++this.generation;
    this.timer?.cancel();
    this.searching.set(true);
    this.timer = this.clock.schedule(SEARCH_PAUSE_MS, () => {
      this.timer = null;
      void this.runSearch(text, generation);
    });
  }

  private async runSearch(q: string, generation: number): Promise<void> {
    this.searching.set(true);
    const result = await this.data.store.searchConfluencePages(q);
    if (generation !== this.generation) return;
    this.searching.set(false);
    if (!result.ok) {
      this.searchError.set(result.error);
      return;
    }
    this.searchError.set(null);
    this.found.set({ q, pages: result.value.items });
  }

  /** Creates the page and closes with the meeting; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const parentId = this.form.controls.parentId.value;
    if (this.form.invalid || parentId === null || this.busy()) return;
    const title = this.form.controls.title.value.trim();
    this.busy.set(true);
    this.failure.set(null);
    const result = await this.data.store.createConfluencePage(
      this.data.meeting.id,
      { parentId, title, body: this.data.body }
    );
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(`Page “${title}” created in Confluence.`);
    this.ref.close(result.value);
  }
}
