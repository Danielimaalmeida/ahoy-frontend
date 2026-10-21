import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { MeetingStoryDraft, MeetingStoryMode } from '@core/api/types';
import { AccessControl } from '@core/auth/access-control';
import { authorLabel, meetingDay, meetingTime } from '@domain/meetings';
import { storySentence, targetText } from '@domain/story-drafts';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { DialogService, DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import type { MeetingsStore } from './meetings-store';
import { SeriesJiraDialog, type SeriesJiraData } from './series-jira-dialog';
import { storyErrorView, type StoryAction } from './story-errors';
import type { StoryDraftsStore } from './story-drafts-store';
import { StoryGrillDialog, type StoryGrillData } from './story-grill-dialog';

/** What the story review dialog is opened with: both stores of the page and the draft to show. */
export interface StoryReviewData {
  readonly drafts: StoryDraftsStore;
  readonly store: MeetingsStore;
  readonly draftId: string;
}

/**
 * "Check the user story" (board `StoryReview`): the story the agent wrote, rendered as it will be in Jira, and where it
 * goes (the series' project and issue type). Create in Jira is one click; not right means "Write it again" or "Grill
 * me on it" (questions first). The story itself is not edited here: no manual typing. While the agent is still
 * writing, it says so and can be stopped; a grill's questions are answered in their own dialog; a failed draft says
 * why. The draft is read live from the page's store, so it updates as the agent finishes.
 */
@Component({
  selector: 'ah-story-review-dialog',
  imports: [Banner, Button, DialogShell],
  styles: `
    article {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
    }
    ol,
    ul {
      margin: 0;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .two {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .source {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
    }
    .again {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .text {
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <ah-dialog
      icon="check"
      heading="Check the user story"
      [cancelLabel]="draft()?.status === 'created' ? 'Close' : 'Cancel'"
      [confirmLabel]="confirmLabel()"
      busyLabel="Creating…"
      [busy]="busy()"
      [confirmDisabled]="!canCreate() && draft()?.status !== 'created'"
      [error]="error()"
      (confirm)="confirm()"
    >
      @if (draft(); as d) {
        <span ahDialogLead>{{ lead() }}</span>
        @switch (d.status) {
          @case ('drafting') {
            <ah-banner variant="info" [heading]="draftingHeading()"
              >This takes a short while. It shows here as soon as it is ready;
              you can close this meanwhile.</ah-banner
            >
            <div class="again">
              <button
                ahButton
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="discard()"
              >
                Stop and discard
              </button>
            </div>
          }
          @case ('asking') {
            <ah-banner variant="info" heading="First Mate has questions"
              >{{ questionCount() }} about this topic, one at a time. It writes
              the story once you answer.</ah-banner
            >
            <div class="again">
              <button
                ahButton="soft"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="answerQuestions()"
              >
                Answer the questions
              </button>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="discard()"
              >
                Discard
              </button>
            </div>
          }
          @case ('failed') {
            <ah-banner variant="error" heading="No story was written"
              ><span class="text">{{
                d.failure ?? 'The agent did not finish.'
              }}</span></ah-banner
            >
            <div class="again">
              <button
                ahButton
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="rewrite()"
              >
                Try again
              </button>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="discard()"
              >
                Discard
              </button>
            </div>
          }
          @default {
            @if (d.story; as s) {
              <article [attr.aria-label]="'The story: ' + s.title">
                <div class="meta">
                  @if (target(); as t) {
                    <span class="ah-tag">{{ t }}</span>
                  } @else {
                    <span class="ah-tag">No Jira project</span>
                  }
                  @if (d.status === 'created' && d.jiraKey !== null) {
                    <span class="ah-badge ah-badge--done"
                      ><i class="ah-badge__dot"></i>Created as
                      {{ d.jiraKey }}</span
                    >
                  } @else if (canCreate()) {
                    <span class="ah-badge ah-badge--done"
                      ><i class="ah-badge__dot"></i>Ready to create</span
                    >
                  }
                </div>
                <h3 class="text">{{ s.title }}</h3>
                <section>
                  <span class="label">User story</span>
                  <span class="text">{{ sentence(s) }}</span>
                </section>
                <section>
                  <span class="label">Acceptance criteria</span>
                  <ol>
                    @for (criterion of s.acceptanceCriteria; track $index) {
                      <li class="text">{{ criterion }}</li>
                    }
                  </ol>
                </section>
                <div class="two">
                  <section>
                    <span class="label">Out of scope</span>
                    @if (s.outOfScope.length === 0) {
                      <span class="ah-muted">None</span>
                    } @else {
                      <ul>
                        @for (item of s.outOfScope; track $index) {
                          <li class="text">{{ item }}</li>
                        }
                      </ul>
                    }
                  </section>
                  <section>
                    <span class="label">Open questions</span>
                    @if (s.openQuestions.length === 0) {
                      <span class="ah-muted">None</span>
                    } @else {
                      <ul>
                        @for (item of s.openQuestions; track $index) {
                          <li class="text">{{ item }}</li>
                        }
                      </ul>
                    }
                  </section>
                </div>
                @if (givenAnswers().length > 0) {
                  <section>
                    <span class="label">Your answers</span>
                    <ul>
                      @for (a of givenAnswers(); track a.questionId) {
                        <li class="text">
                          {{ a.question }} <strong>{{ a.answer }}</strong>
                        </li>
                      }
                    </ul>
                  </section>
                }
                <div class="source ah-hint">
                  <span>From “{{ d.topicTitle }}”</span>
                  <span>{{ notesUsed() }}</span>
                  @if (d.jiraUrl !== null && d.jiraKey !== null) {
                    <a
                      [href]="d.jiraUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      >Open {{ d.jiraKey }} in Jira</a
                    >
                  }
                </div>
              </article>
              @if (d.status === 'ready') {
                @if (target() === null) {
                  <ah-banner variant="notice" [heading]="noTargetHeading()">{{
                    noTargetText()
                  }}</ah-banner>
                }
                <div class="again">
                  <span class="ah-hint">Not quite right?</span>
                  <button
                    ahButton
                    size="sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="rewrite()"
                  >
                    Write it again
                  </button>
                  <button
                    ahButton
                    size="sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="rewrite('grill')"
                  >
                    Grill me on it
                  </button>
                  @if (series() !== null) {
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [disabled]="busy()"
                      (click)="changeTarget()"
                    >
                      {{
                        target() === null
                          ? 'Set the Jira project'
                          : 'Change project or type'
                      }}
                    </button>
                  }
                </div>
                <span class="ah-hint"
                  >Created with Ahoy's Jira account; the description says it
                  came from this meeting and who created it.</span
                >
              }
            }
          }
        }
      } @else {
        <span ahDialogLead>This draft was discarded.</span>
      }
    </ah-dialog>
  `,
})
export class StoryReviewDialog {
  private readonly data = inject<StoryReviewData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<MeetingStoryDraft>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly access = inject(AccessControl);
  private readonly dialogs = inject(DialogService);

  /** The draft this dialog shows; after "Write it again" the new draft of the same topic. */
  private readonly draftId = signal(this.data.draftId);
  /** The draft as the page's store has it now; null once discarded. */
  readonly draft = computed(
    () => this.data.drafts.drafts().find((d) => d.id === this.draftId()) ?? null
  );
  protected readonly series = this.data.store.openSeries;
  protected readonly busy = this.data.drafts.busy;
  protected readonly target = computed(() => {
    const draft = this.draft();
    return draft === null ? null : targetText(draft.target);
  });
  /** Whether Create in Jira can be clicked: a ready story and a Jira project to put it in. */
  protected readonly canCreate = computed(() => {
    const draft = this.draft();
    return (
      draft !== null &&
      draft.status === 'ready' &&
      draft.story !== null &&
      this.target() !== null
    );
  });
  protected readonly confirmLabel = computed(() =>
    this.draft()?.status === 'created' ? 'Done' : 'Create in Jira'
  );
  protected readonly lead = computed(() => {
    const draft = this.draft();
    if (draft === null) return '';
    const spent =
      draft.run === null ? '' : ` · ${formatCap(draft.spentNanoAiu, 2)} AIU`;
    const by = `Asked for by ${authorLabel(draft.createdBy, this.access.nameOf(draft.createdBy))} on ${meetingDay(draft.createdAt)} at ${meetingTime(draft.createdAt)}`;
    return `Written by First Mate${spent}. ${by}.`;
  });
  /** "First Mate is finding questions" for a grill not yet answered, else "… is writing the story". */
  protected readonly draftingHeading = computed(() => {
    const draft = this.draft();
    return draft?.mode === 'grill' && draft.answers === null
      ? 'First Mate is finding questions to ask you'
      : 'First Mate is writing the story';
  });
  protected readonly questionCount = computed(() => {
    const n = this.draft()?.questions?.length ?? 0;
    return n === 1 ? 'One question' : `${n} questions`;
  });
  /** A grill's answers that say something: those left open are among the story's open questions. */
  protected readonly givenAnswers = computed(() =>
    (this.draft()?.answers ?? []).flatMap((a) =>
      a.answer === null
        ? []
        : [{ questionId: a.questionId, question: a.question, answer: a.answer }]
    )
  );
  protected readonly notesUsed = computed(() => {
    const draft = this.draft();
    if (draft === null) return '';
    const n = draft.noteIds.length;
    return n === 0
      ? 'Drafted from all its notes'
      : `Drafted from ${n === 1 ? '1 chosen note' : `${n} chosen notes`}`;
  });
  protected readonly noTargetHeading = computed(() =>
    this.series() === null
      ? 'A one-off meeting has no Jira project'
      : 'This series has no Jira project yet'
  );
  protected readonly noTargetText = computed(() =>
    this.series() === null
      ? "Only a series' meetings create stories in Jira."
      : 'Set where its stories go, then create this one.'
  );
  private readonly failure = signal<{
    error: ApiError;
    action: StoryAction;
  } | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null
      ? null
      : storyErrorView(failure.error, failure.action);
  });

  protected readonly sentence = storySentence;

  /** Create in Jira, or Done once created. */
  async confirm(): Promise<void> {
    const draft = this.draft();
    if (draft === null || this.busy()) return;
    if (draft.status === 'created') {
      this.ref.close(draft);
      return;
    }
    if (!this.canCreate()) return;
    this.failure.set(null);
    const result = await this.data.drafts.createIssue(draft.id);
    if (!result.ok) {
      this.failure.set({ error: result.error, action: 'create' });
      return;
    }
    this.toasts.show(`Created ${result.value.jiraKey ?? 'the story'} in Jira.`);
    this.ref.close(result.value);
  }

  /**
   * "Write it again" (the same way as before) or "Grill me on it" (`grill`): discards this draft and asks for a new one
   * from the same notes; the dialog follows it.
   */
  async rewrite(mode?: MeetingStoryMode): Promise<void> {
    const draft = this.draft();
    if (draft === null || this.busy()) return;
    this.failure.set(null);
    const result = await this.data.drafts.rewrite(draft, mode ?? draft.mode);
    if (!result.ok) {
      this.failure.set({ error: result.error, action: 'draft' });
      return;
    }
    if (result.value !== null) this.draftId.set(result.value.id);
  }

  /** Discards the draft (a run still writing it stops) and closes. */
  async discard(): Promise<void> {
    const draft = this.draft();
    if (draft === null || this.busy()) return;
    this.failure.set(null);
    const result = await this.data.drafts.discard(draft.id);
    if (!result.ok) {
      this.failure.set({ error: result.error, action: 'discard' });
      return;
    }
    this.toasts.show('Story draft discarded.');
    this.ref.close();
  }

  /** Opens the grill's questions in their own dialog, in place of this one. */
  answerQuestions(): void {
    const draft = this.draft();
    if (draft === null) return;
    this.ref.close();
    this.dialogs.open<MeetingStoryDraft, StoryGrillData>(StoryGrillDialog, {
      data: { drafts: this.data.drafts, draftId: draft.id },
      width: '720px',
    });
  }

  /** Opens the series' Jira target; the draft is read again so its target updates. */
  changeTarget(): void {
    const series = this.series();
    if (series === null) return;
    this.dialogs
      .open<unknown, SeriesJiraData>(SeriesJiraDialog, {
        data: { store: this.data.store, series },
      })
      .closed.subscribe((changed) => {
        if (changed !== undefined) void this.data.drafts.reload();
      });
  }
}
