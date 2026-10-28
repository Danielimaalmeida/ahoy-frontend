import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  MEETING_NOTE_IMAGE_TYPES,
  MEETING_NOTE_KINDS,
  type MeetingNote,
  type MeetingStoryDraft,
  type MeetingTopic,
} from '@core/api/types';
import {
  acceptImages,
  authorLabel,
  dueLabel,
  MAX_IMAGES_PER_NOTE,
  meetingDay,
  meetingTime,
  NOTE_KIND_LABELS,
  noteShortcut,
  raisedByLabel,
  threadNotes,
  topicWhen,
  type NoteKind,
} from '@domain/meetings';
import { draftChip } from '@domain/story-drafts';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { MeetingsStore } from './meetings-store';
import { NoteImages } from './note-images';
import { StoryDraftDialog, type StoryDraftData } from './story-draft-dialog';
import { StoryDraftsStore } from './story-drafts-store';
import { StoryGrillDialog, type StoryGrillData } from './story-grill-dialog';
import { StoryReviewDialog, type StoryReviewData } from './story-review-dialog';

/** The longest note the API takes (`maxLength: 4000`). */
export const NOTE_MAX = 4000;

/**
 * One topic of a meeting (board `Meetings`): its title, who raised it and when, its notes oldest first, and a line to
 * add a note. While it can change, it can also go up or down, move to the series' next meeting, or be removed with its
 * notes (after a second click). A moved topic is read-only and links to where it went. Notes are plain text; a note can
 * be a decision, an action (with an owner and a due day, ticked done also after the meeting ended) or a question,
 * chosen beside the line or typed as `/d`, `/a`, `/q` before the text. A question shows open or answered, with its
 * answers under it: Answer opens a line under it (also after the meeting ended), the first answer marks it answered,
 * and Reopen marks it open again keeping the answers. Images (PNG, JPEG, WebP, GIF) are pasted into the
 * line, dropped on the topic or chosen with Add image, and go with the next note; Add image beside a note adds to it. A topic
 * that was not moved can be turned into a user story (also after the meeting ended); its draft's state shows on a line
 * of its own, with the way to check it, and the Jira issue once created.
 */
@Component({
  selector: 'ah-topic-card',
  imports: [Button, NoteImages, ReactiveFormsModule, RouterLink],
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
    article.dropping {
      outline: 2px dashed var(--accent);
      outline-offset: -2px;
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
    .kind {
      flex: none;
    }
    .kind-decision {
      background: var(--status-decision-bg);
      color: var(--status-decision-fg);
    }
    .kind-question {
      background: var(--status-input-bg);
      color: var(--status-input-fg);
    }
    .done .text {
      text-decoration: line-through;
      color: var(--ink-soft);
    }
    .overdue {
      color: var(--danger-text);
    }
    .done-box {
      margin: 0;
      flex: none;
      accent-color: var(--accent);
    }
    .remove-note,
    .add-image {
      opacity: 0;
    }
    li:hover > .note :is(.remove-note, .add-image),
    li:focus-within > .note :is(.remove-note, .add-image) {
      opacity: 1;
    }
    .status {
      flex: none;
      border-radius: 999px;
    }
    .answered {
      background: var(--status-done-bg);
      color: var(--status-done-fg);
    }
    .open {
      background: transparent;
      border: 1px solid currentColor;
      color: var(--status-input-fg);
    }
    ul.answers {
      padding: 4px 0 0 22px;
    }
    .reply {
      flex: none;
      align-self: center;
      color: var(--ink-soft);
    }
    .question-actions {
      display: flex;
      gap: 4px;
      padding: 2px 0 0 18px;
    }
    form.answer {
      padding: 6px 0 2px 18px;
      align-items: center;
    }
    form.answer .line {
      flex: 1 1 260px;
    }
    .pending {
      flex: 1 0 100%;
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pending li {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0 0 0 8px;
    }
    .image-hint {
      flex: 1 0 100%;
      margin: 0;
    }
    .closed-hint {
      padding: 0 16px 8px;
    }
    form {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 16px 12px;
    }
    form input,
    form select {
      height: 32px;
      background: var(--surface-raised);
      border-color: var(--line);
    }
    form select {
      flex: none;
      width: auto;
    }
    form .line {
      flex: 1 1 240px;
    }
    form .owner {
      flex: 0 1 160px;
    }
    form .due {
      flex: 0 1 150px;
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
    <article
      [class.moved]="moved()"
      [class.dropping]="dropping()"
      [attr.aria-labelledby]="'topic-' + t.id"
      (dragover)="dragOver($event)"
      (dragleave)="dropping.set(false)"
      (drop)="drop($event)"
    >
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
      @if (notes().length > 0) {
        <ul [attr.aria-label]="'Notes on ' + t.title">
          @for (note of notes(); track note.id) {
            <li [class.done]="note.kind === 'action' && note.doneAt !== null">
              <span class="note">
                @if (note.kind === 'action') {
                  <input
                    type="checkbox"
                    class="done-box"
                    [checked]="note.doneAt !== null"
                    [disabled]="busy() || moved()"
                    [attr.aria-label]="
                      (note.doneAt === null
                        ? 'Mark done: '
                        : 'Mark not done: ') + note.text
                    "
                    (change)="toggleDone(note, $event)"
                  />
                }
                @if (note.kind !== 'note') {
                  <span class="ah-tag kind" [class]="'kind-' + note.kind">{{
                    kindLabel[note.kind]
                  }}</span>
                }
                <span class="text">{{ note.text }}</span>
                @if (note.kind === 'question') {
                  @if (note.doneAt !== null) {
                    <span class="ah-tag status answered">Answered</span>
                  } @else {
                    <span class="ah-tag status open">Open</span>
                  }
                }
                @if (note.kind === 'action') {
                  @if (note.owner !== null) {
                    <span class="ah-hint by">{{ note.owner }}</span>
                  }
                  @if (due(note); as d) {
                    <span class="ah-hint by" [class.overdue]="d.overdue">{{
                      d.text
                    }}</span>
                  }
                }
                <span class="ah-hint by" [attr.title]="note.createdBy"
                  >{{ author(note.createdBy, note.createdByName) }} ·
                  {{ time(note.createdAt) }}</span
                >
                @if (editable()) {
                  @if (note.images.length < maxImages) {
                    <input
                      #picker
                      type="file"
                      multiple
                      hidden
                      [accept]="imageTypes"
                      (change)="addImagesTo(note, $event)"
                    />
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      class="add-image"
                      [attr.aria-label]="
                        'Add an image to the note: ' + note.text
                      "
                      [disabled]="busy()"
                      (click)="picker.click()"
                    >
                      Add image
                    </button>
                  }
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
              @if (note.images.length > 0) {
                <ah-note-images [note]="note" [editable]="editable()" />
              }
              @if (note.kind === 'question') {
                @let answers = answersOf().get(note.id) ?? [];
                @if (answers.length > 0) {
                  <ul
                    class="answers"
                    [attr.aria-label]="'Answers to ' + note.text"
                  >
                    @for (a of answers; track a.id) {
                      <li>
                        <span class="note">
                          <svg
                            class="reply"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 4v7a4 4 0 0 0 4 4h10" />
                            <path d="M15 11l4 4-4 4" />
                          </svg>
                          <span class="text">{{ a.text }}</span>
                          <span class="ah-hint by" [attr.title]="a.createdBy"
                            >{{ author(a.createdBy, a.createdByName) }} ·
                            {{ time(a.createdAt) }}</span
                          >
                          @if (!moved()) {
                            @if (a.images.length < maxImages) {
                              <input
                                #answerPicker
                                type="file"
                                multiple
                                hidden
                                [accept]="imageTypes"
                                (change)="addImagesTo(a, $event)"
                              />
                              <button
                                ahButton="ghost"
                                size="sm"
                                type="button"
                                class="add-image"
                                [attr.aria-label]="
                                  'Add an image to the answer: ' + a.text
                                "
                                [disabled]="busy()"
                                (click)="answerPicker.click()"
                              >
                                Add image
                              </button>
                            }
                            <button
                              ahButton="ghost"
                              size="sm"
                              type="button"
                              class="remove-note"
                              [attr.aria-label]="'Remove the answer: ' + a.text"
                              [disabled]="busy()"
                              (click)="store.deleteNote(t.id, a.id)"
                            >
                              Remove
                            </button>
                          }
                        </span>
                        @if (a.images.length > 0) {
                          <ah-note-images [note]="a" [editable]="!moved()" />
                        }
                      </li>
                    }
                  </ul>
                }
                @if (!moved()) {
                  @if (answering() === note.id) {
                    <form
                      class="answer"
                      (submit)="$event.preventDefault(); addAnswer(note)"
                    >
                      <label class="ah-sr" [for]="'answer-' + note.id"
                        >Answer to: {{ note.text }}</label
                      >
                      <input
                        class="ah-input line"
                        type="text"
                        autocomplete="off"
                        placeholder="Write the answer"
                        [id]="'answer-' + note.id"
                        [maxlength]="noteMax"
                        [formControl]="answerText"
                        (paste)="pasteAnswer($event)"
                        (keydown.escape)="cancelAnswer()"
                      />
                      <button
                        ahButton="primary"
                        size="sm"
                        type="submit"
                        [disabled]="busy()"
                      >
                        Add answer
                      </button>
                      <input
                        #answerComposerPicker
                        type="file"
                        multiple
                        hidden
                        [accept]="imageTypes"
                        (change)="chooseForAnswer($event)"
                      />
                      <button
                        ahButton="ghost"
                        size="sm"
                        type="button"
                        [attr.aria-label]="
                          'Add an image to the answer to: ' + note.text
                        "
                        [disabled]="
                          busy() || answerPending().length >= maxImages
                        "
                        (click)="answerComposerPicker.click()"
                      >
                        Add image
                      </button>
                      <button
                        ahButton="default"
                        size="sm"
                        type="button"
                        (click)="cancelAnswer()"
                      >
                        Cancel
                      </button>
                      @if (answerPending().length > 0) {
                        <ul
                          class="pending"
                          [attr.aria-label]="
                            'Images for the answer to: ' + note.text
                          "
                        >
                          @for (file of answerPending(); track $index) {
                            <li class="ah-tag">
                              {{ file.name || 'Pasted image' }}
                              <button
                                ahButton="ghost"
                                size="sm"
                                type="button"
                                [attr.aria-label]="
                                  'Leave out ' +
                                  (file.name || 'the pasted image')
                                "
                                (click)="leaveOutOfAnswer($index)"
                              >
                                ×
                              </button>
                            </li>
                          }
                        </ul>
                      }
                      <p class="ah-hint image-hint" role="status">
                        {{
                          answerHint() ??
                            'Enter adds it. The first answer marks the question answered; you can reopen it.'
                        }}
                      </p>
                    </form>
                  } @else {
                    <span class="question-actions">
                      <button
                        ahButton="ghost"
                        size="sm"
                        type="button"
                        [attr.aria-label]="'Answer: ' + note.text"
                        [disabled]="busy()"
                        (click)="startAnswer(note)"
                      >
                        Answer
                      </button>
                      @if (note.doneAt !== null) {
                        <button
                          ahButton="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="'Reopen: ' + note.text"
                          [disabled]="busy()"
                          (click)="store.setDone(note.id, false)"
                        >
                          Reopen
                        </button>
                      }
                    </span>
                  }
                }
              }
            </li>
          }
        </ul>
      }
      @if (!editable() && imageHint() !== null) {
        <p class="ah-hint image-hint closed-hint" role="status">
          {{ imageHint() }}
        </p>
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
          <label class="ah-sr" [for]="'kind-' + t.id"
            >Kind of note for {{ t.title }}</label
          >
          <select class="ah-input" [id]="'kind-' + t.id" [formControl]="kind">
            @for (k of kinds; track k) {
              <option [value]="k">{{ kindLabel[k] }}</option>
            }
          </select>
          <label class="ah-sr" [for]="'note-' + t.id"
            >Add a note to {{ t.title }}</label
          >
          <input
            class="ah-input line"
            type="text"
            autocomplete="off"
            [placeholder]="placeholder()"
            [id]="'note-' + t.id"
            [maxlength]="noteMax"
            [formControl]="note"
            (paste)="paste($event)"
          />
          @if (kindNow() === 'action') {
            <label class="ah-sr" [for]="'owner-' + t.id">Who does it</label>
            <input
              class="ah-input owner"
              type="text"
              autocomplete="off"
              placeholder="Owner"
              maxlength="200"
              [id]="'owner-' + t.id"
              [formControl]="owner"
            />
            <label class="ah-sr" [for]="'due-' + t.id">Due on</label>
            <input
              class="ah-input due"
              type="date"
              [id]="'due-' + t.id"
              [formControl]="dueOn"
            />
            <button ahButton="soft" size="sm" type="submit" [disabled]="busy()">
              Add action
            </button>
          }
          <input
            #composerPicker
            type="file"
            multiple
            hidden
            [accept]="imageTypes"
            (change)="choose($event)"
          />
          <button
            ahButton="ghost"
            size="sm"
            type="button"
            [attr.aria-label]="'Add an image to the next note on ' + t.title"
            [disabled]="busy() || pending().length >= maxImages"
            (click)="composerPicker.click()"
          >
            Add image
          </button>
          @if (pending().length > 0) {
            <ul
              class="pending"
              [attr.aria-label]="'Images for the next note on ' + t.title"
            >
              @for (file of pending(); track $index) {
                <li class="ah-tag">
                  {{ file.name || 'Pasted image' }}
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    [attr.aria-label]="
                      'Leave out ' + (file.name || 'the pasted image')
                    "
                    (click)="leaveOut($index)"
                  >
                    ×
                  </button>
                </li>
              }
            </ul>
          }
          @if (imageHint(); as hint) {
            <p class="ah-hint image-hint" role="status">{{ hint }}</p>
          }
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
  protected readonly kind = new FormControl<NoteKind>('note', {
    nonNullable: true,
  });
  protected readonly owner = new FormControl('', { nonNullable: true });
  protected readonly dueOn = new FormControl('', { nonNullable: true });
  protected readonly kinds = MEETING_NOTE_KINDS;
  protected readonly kindLabel = NOTE_KIND_LABELS;
  /** The kind chosen beside the line, as a signal for the template. */
  protected readonly kindNow = toSignal(this.kind.valueChanges, {
    initialValue: this.kind.value,
  });
  protected readonly placeholder = computed(() =>
    this.kindNow() === 'note'
      ? 'Add a note (/d decision, /a action, /q question)'
      : `Add a ${NOTE_KIND_LABELS[this.kindNow()].toLowerCase()}`
  );
  /** The question whose answer line is open, if any. */
  readonly answering = signal<string | null>(null);
  protected readonly answerText = new FormControl('', { nonNullable: true });
  /** The images pasted or chosen for the answer being written. */
  readonly answerPending = signal<readonly File[]>([]);
  /** Why an image for the answer was left out. */
  readonly answerHint = signal<string | null>(null);
  /** Whether the person clicked Remove once and is asked to confirm. */
  readonly confirming = signal(false);
  /** The images pasted, dropped or chosen for the next note. */
  readonly pending = signal<readonly File[]>([]);
  /** Why an image pasted, dropped or chosen was left out. */
  readonly imageHint = signal<string | null>(null);
  /** Whether files are dragged over the topic. */
  protected readonly dropping = signal(false);
  protected readonly imageTypes = MEETING_NOTE_IMAGE_TYPES.join(',');
  protected readonly maxImages = MAX_IMAGES_PER_NOTE;

  protected readonly busy = this.store.busy;
  protected readonly moved = computed(() => this.topic().status === 'moved');
  protected readonly editable = computed(
    () => this.meetingOpen() && !this.moved()
  );
  protected readonly canMoveToNext = computed(() => this.inSeries());
  protected readonly raisedBy = computed(() => raisedByLabel(this.topic()));
  protected readonly when = computed(() => topicWhen(this.topic()));
  /** The topic's notes without the answers, and each question's answers, which show under it. */
  protected readonly thread = computed(() => threadNotes(this.topic().notes));
  protected readonly notes = computed(() => this.thread().notes);
  protected readonly answersOf = computed(() => this.thread().answers);
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

  /** When an action is due, against today. */
  protected due(note: MeetingNote) {
    return dueLabel(note.dueOn, this.store.today());
  }

  /** Ticks an action done, or not done again; the box follows the answer. */
  protected async toggleDone(note: MeetingNote, event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const done = box.checked;
    const changed = await this.store.setDone(note.id, done);
    if (!changed) box.checked = !done;
  }

  /**
   * Adds the typed note, of the kind chosen beside the line or typed as a shortcut (`/a Send the deck`); on success the
   * line clears for the next one and the kind goes back to a plain note.
   */
  async addNote(): Promise<void> {
    const typed = this.note.value.trim();
    const shortcut = noteShortcut(typed);
    const text = shortcut?.text ?? typed;
    const kind = shortcut?.kind ?? this.kind.value;
    const images = this.pending();
    if ((text === '' && images.length === 0) || this.busy()) return;
    const added = await this.store.addNote(
      this.topic().id,
      text !== '' ? text : images.length === 1 ? 'Image' : 'Images',
      { kind, owner: this.owner.value, dueOn: this.dueOn.value },
      images
    );
    if (!added) return;
    this.pending.set([]);
    this.imageHint.set(null);
    this.note.setValue('');
    this.owner.setValue('');
    this.dueOn.setValue('');
    this.kind.setValue('note');
  }

  /** Opens the answer line under a question, closing any other. */
  startAnswer(question: MeetingNote): void {
    this.answering.set(question.id);
    this.answerText.setValue('');
    this.answerPending.set([]);
    this.answerHint.set(null);
  }

  /** Closes the answer line, dropping what was typed. */
  cancelAnswer(): void {
    this.answering.set(null);
    this.answerText.setValue('');
    this.answerPending.set([]);
    this.answerHint.set(null);
  }

  /** Adds the typed answer, with its images; on success the answer line closes. */
  async addAnswer(question: MeetingNote): Promise<void> {
    const text = this.answerText.value.trim();
    const images = this.answerPending();
    if ((text === '' && images.length === 0) || this.busy()) return;
    const added = await this.store.answer(
      question.id,
      text !== '' ? text : images.length === 1 ? 'Image' : 'Images',
      images
    );
    if (added) this.cancelAnswer();
  }

  /** Takes the images pasted into the answer line; pasted text goes in as usual. */
  protected pasteAnswer(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    this.takeForAnswer(files);
  }

  /** Takes the images chosen with Add image beside the answer line. */
  protected chooseForAnswer(event: Event): void {
    this.takeForAnswer(chosenFiles(event));
  }

  /** Leaves an image out of the answer being written. */
  protected leaveOutOfAnswer(index: number): void {
    this.answerPending.update((files) => files.filter((_, i) => i !== index));
  }

  private takeForAnswer(files: readonly File[]): void {
    const { images, refusal } = acceptImages(
      files,
      MAX_IMAGES_PER_NOTE - this.answerPending().length
    );
    this.answerHint.set(refusal);
    if (images.length > 0) this.answerPending.update((p) => [...p, ...images]);
  }

  /** Takes the images pasted into the line for the next note; pasted text goes in as usual. */
  protected paste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    this.take(files);
  }

  /** Lets files be dropped on a topic that takes notes. */
  protected dragOver(event: DragEvent): void {
    if (!this.editable() || !event.dataTransfer?.types.includes('Files'))
      return;
    event.preventDefault();
    this.dropping.set(true);
  }

  /** Takes the images dropped on the topic for the next note. */
  protected drop(event: DragEvent): void {
    this.dropping.set(false);
    if (!this.editable()) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    this.take(files);
  }

  /** Takes the images chosen with Add image beside the line for the next note. */
  protected choose(event: Event): void {
    this.take(chosenFiles(event));
  }

  /** Leaves an image out of the next note. */
  protected leaveOut(index: number): void {
    this.pending.update((files) => files.filter((_, i) => i !== index));
  }

  /** Adds the images chosen with Add image beside a note to that note. */
  protected async addImagesTo(note: MeetingNote, event: Event): Promise<void> {
    const { images, refusal } = acceptImages(
      chosenFiles(event),
      MAX_IMAGES_PER_NOTE - note.images.length
    );
    this.imageHint.set(refusal);
    if (images.length > 0) await this.store.addNoteImages(note.id, images);
  }

  private take(files: readonly File[]): void {
    const { images, refusal } = acceptImages(
      files,
      MAX_IMAGES_PER_NOTE - this.pending().length
    );
    this.imageHint.set(refusal);
    if (images.length > 0) this.pending.update((p) => [...p, ...images]);
  }

  /** Removes the topic and its notes, once confirmed. */
  async remove(): Promise<void> {
    await this.store.deleteTopic(this.topic().id);
    this.confirming.set(false);
  }
}

/** The files chosen in a file input, which is cleared so the same file can be chosen again. */
function chosenFiles(event: Event): readonly File[] {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return [];
  const files = Array.from(input.files ?? []);
  input.value = '';
  return files;
}
