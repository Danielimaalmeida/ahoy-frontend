import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { MeetingStoryDraft, MeetingTopic } from '@core/api/types';
import {
  authorLabel,
  meetingDay,
  meetingTime,
  raisedByLabel,
  topicWhen,
} from '@domain/meetings';
import { draftChip } from '@domain/story-drafts';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { MeetingsStore } from './meetings-store';
import { StoryDraftDialog, type StoryDraftData } from './story-draft-dialog';
import { StoryDraftsStore } from './story-drafts-store';
import { StoryGrillDialog, type StoryGrillData } from './story-grill-dialog';
import { StoryReviewDialog, type StoryReviewData } from './story-review-dialog';

/** The longest note the API takes (`maxLength: 4000`). */
export const NOTE_MAX = 4000;

/**
 * One topic of a meeting (board `Meetings`): its title, who raised it and when, its notes oldest first, and a line to
 * add a note. While it can change, it can also go up or down, move to the series' next meeting, or be removed with its
 * notes (after a second click). A moved topic is read-only and links to where it went. Notes are plain text. A topic
 * that was not moved can be turned into a user story (also after the meeting ended); its draft's state shows on a line
 * of its own, with the way to check it, and the Jira issue once created.
 */
@Component({
  selector: 'ah-topic-card',
  imports: [Button, ReactiveFormsModule, RouterLink],
  styles: `
    :host {
      display: block;
    }
    article {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    article.moved {
      background: var(--surface-raised);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
      padding: 11px 16px;
    }
    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
    }
    .moved h3 {
      color: var(--ink-soft);
    }
    .them {
      background: var(--status-sendback-bg);
      color: var(--status-sendback-fg);
    }
    .actions {
      margin-left: auto;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    ul {
      margin: 0;
      padding: 0 16px 8px 34px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    li {
      padding: 2px 0;
    }
    .note {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    .text {
      flex: 1;
      min-width: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .by {
      white-space: nowrap;
    }
    .remove-note {
      opacity: 0;
    }
    li:hover .remove-note,
    li:focus-within .remove-note {
      opacity: 1;
    }
    form {
      display: flex;
      gap: 8px;
      padding: 0 16px 12px;
    }
    form input {
      height: 32px;
      background: var(--surface-raised);
      border-color: var(--line);
    }
    .story {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      align-items: center;
      padding: 0 16px 12px;
    }
  `,
  template: `
    @let t = topic();
    <article [class.moved]="moved()" [attr.aria-labelledby]="'topic-' + t.id">
      <div class="head">
        <h3 [id]="'topic-' + t.id">{{ t.title }}</h3>
        <span
          class="ah-tag"
          [class.ah-tag--accent]="t.raisedBy === 'us'"
          [class.them]="t.raisedBy === 'them'"
          >{{ raisedBy() }}</span
        >
        <span class="ah-hint">{{ when() }}</span>
        @if (t.carriedFrom; as from) {
          <a
            class="ah-tag ah-tag--outline"
            [routerLink]="['/meetings', from.meetingId]"
            >From {{ day(from.meetingStartsAt) }}</a
          >
        }
        <div class="actions">
          @if (t.movedTo; as to) {
            <span class="ah-hint">Moved to</span>
            <a [routerLink]="['/meetings', to.meetingId]">{{
              day(to.meetingStartsAt)
            }}</a>
          } @else if (moved()) {
            <span class="ah-hint"
              >Moved to a meeting that no longer has it</span
            >
          } @else if (editable()) {
            @if (confirming()) {
              <span class="ah-hint">{{ removeQuestion() }}</span>
              <button
                ahButton="danger-outline"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="remove()"
              >
                Remove
              </button>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                (click)="confirming.set(false)"
              >
                Keep
              </button>
            } @else {
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [attr.aria-label]="'Move ' + t.title + ' up'"
                [disabled]="busy() || first()"
                (click)="up()"
              >
                ↑
              </button>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [attr.aria-label]="'Move ' + t.title + ' down'"
                [disabled]="busy() || last()"
                (click)="down()"
              >
                ↓
              </button>
              @if (canMoveToNext()) {
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  [disabled]="busy()"
                  (click)="store.moveToNext(t.id)"
                >
                  Move to next meeting
                </button>
              }
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="confirming.set(true)"
              >
                Remove
              </button>
            }
          }
        </div>
      </div>
      @if (t.notes.length > 0) {
        <ul [attr.aria-label]="'Notes on ' + t.title">
          @for (note of t.notes; track note.id) {
            <li>
              <span class="note">
                <span class="text">{{ note.text }}</span>
                <span class="ah-hint by" [attr.title]="note.createdBy"
                  >{{ author(note.createdBy, note.createdByName) }} ·
                  {{ time(note.createdAt) }}</span
                >
                @if (editable()) {
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    class="remove-note"
                    [attr.aria-label]="'Remove the note: ' + note.text"
                    [disabled]="busy()"
                    (click)="store.deleteNote(t.id, note.id)"
                  >
                    Remove
                  </button>
                }
              </span>
            </li>
          }
        </ul>
      }
      @if (!moved()) {
        <div class="story">
          @if (draft(); as d) {
            @if (d.status === 'created' && d.jiraKey !== null) {
              <span class="ah-tag ah-tag--accent">{{ chip(d.status) }}</span>
              @if (d.jiraUrl !== null) {
                <a
                  [href]="d.jiraUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ d.jiraKey }}</a
                >
              } @else {
                <span class="ah-key">{{ d.jiraKey }}</span>
              }
            } @else {
              <span
                class="ah-tag"
                [class.ah-tag--accent]="
                  d.status === 'ready' || d.status === 'asking'
                "
                >{{
                  chip(d.status, d.mode === 'grill' && d.answers === null)
                }}</span
              >
              <button
                [ahButton]="
                  d.status === 'ready' || d.status === 'asking'
                    ? 'soft'
                    : 'ghost'
                "
                size="sm"
                type="button"
                [attr.aria-label]="reviewLabel(d)"
                (click)="d.status === 'asking' ? answer(d) : review(d)"
              >
                {{
                  d.status === 'ready'
                    ? 'Check the story'
                    : d.status === 'asking'
                      ? 'Answer questions'
                      : d.status === 'failed'
                        ? 'See why'
                        : 'Open'
                }}
              </button>
            }
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              [attr.aria-label]="'Turn ' + t.title + ' into a user story'"
              [disabled]="drafts.busy()"
              (click)="turnIntoStory()"
            >
              Turn into a user story
            </button>
          }
        </div>
      }
      @if (editable()) {
        <form (submit)="$event.preventDefault(); addNote()">
          <label class="ah-sr" [for]="'note-' + t.id"
            >Add a note to {{ t.title }}</label
          >
          <input
            class="ah-input"
            type="text"
            autocomplete="off"
            placeholder="Add a note"
            [id]="'note-' + t.id"
            [maxlength]="noteMax"
            [formControl]="note"
          />
        </form>
      }
    </article>
  `,
})
export class TopicCard {
  protected readonly store = inject(MeetingsStore);
  protected readonly drafts = inject(StoryDraftsStore);
  private readonly dialogs = inject(DialogService);

  /** The topic, with its notes. */
  readonly topic = input.required<MeetingTopic>();
  /** Whether the meeting takes changes (it has not ended). */
  readonly meetingOpen = input(true);
  /** Whether the meeting belongs to a series, so the topic can go to its next meeting. */
  readonly inSeries = input(false);
  /** Whether the topic is the first of the meeting (it cannot go up). */
  readonly first = input(false);
  /** Whether the topic is the last of the meeting (it cannot go down). */
  readonly last = input(false);

  protected readonly noteMax = NOTE_MAX;
  protected readonly note = new FormControl('', { nonNullable: true });
  /** Whether the person clicked Remove once and is asked to confirm. */
  readonly confirming = signal(false);

  protected readonly busy = this.store.busy;
  protected readonly moved = computed(() => this.topic().status === 'moved');
  protected readonly editable = computed(
    () => this.meetingOpen() && !this.moved()
  );
  protected readonly canMoveToNext = computed(() => this.inSeries());
  protected readonly raisedBy = computed(() => raisedByLabel(this.topic()));
  protected readonly when = computed(() => topicWhen(this.topic()));
  protected readonly removeQuestion = computed(() => {
    const notes = this.topic().notes.length;
    return notes === 0
      ? 'Remove this topic?'
      : `Remove this topic and its ${notes === 1 ? 'note' : `${notes} notes`}?`;
  });

  /** The topic's story draft, if it has one that was not discarded. */
  protected readonly draft = computed(
    () => this.drafts.byTopic().get(this.topic().id) ?? null
  );

  protected readonly chip = draftChip;
  protected readonly day = meetingDay;
  protected readonly time = meetingTime;
  protected readonly author = authorLabel;

  /** "Check the story of Late fees", for a screen reader. */
  protected reviewLabel(draft: MeetingStoryDraft): string {
    const verb =
      draft.status === 'ready'
        ? 'Check the story of'
        : draft.status === 'asking'
          ? "Answer First Mate's questions about"
          : draft.status === 'failed'
            ? 'See why no story was written for'
            : 'Open the story being written for';
    return `${verb} ${this.topic().title}`;
  }

  /** Opens "Turn into a user story" for this topic. */
  turnIntoStory(): void {
    const m = this.store.meeting();
    if (m === null) return;
    this.dialogs.open<unknown, StoryDraftData>(StoryDraftDialog, {
      data: {
        drafts: this.drafts,
        topic: this.topic(),
        meeting: `${m.title}, ${meetingDay(m.startsAt)}`,
      },
      width: '640px',
    });
  }

  /** Opens the review of the topic's draft: check it and create it in Jira, or see why it failed. */
  review(draft: MeetingStoryDraft): void {
    this.dialogs.open<unknown, StoryReviewData>(StoryReviewDialog, {
      data: { drafts: this.drafts, store: this.store, draftId: draft.id },
      width: '720px',
    });
  }

  /** Opens a grill's questions, to answer them one at a time. */
  answer(draft: MeetingStoryDraft): void {
    this.dialogs.open<unknown, StoryGrillData>(StoryGrillDialog, {
      data: { drafts: this.drafts, draftId: draft.id },
      width: '720px',
    });
  }

  /** Moves the topic one place up. */
  up(): Promise<void> {
    return this.store.reorder(this.topic().id, -1);
  }

  /** Moves the topic one place down. */
  down(): Promise<void> {
    return this.store.reorder(this.topic().id, 1);
  }

  /** Adds the typed note; on success the line clears for the next one. */
  async addNote(): Promise<void> {
    const text = this.note.value.trim();
    if (text === '' || this.busy()) return;
    const added = await this.store.addNote(this.topic().id, text);
    if (added) this.note.setValue('');
  }

  /** Removes the topic and its notes, once confirmed. */
  async remove(): Promise<void> {
    await this.store.deleteTopic(this.topic().id);
    this.confirming.set(false);
  }
}
