import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import {
  CONVERSATION_CONTEXT_KINDS,
  type ConversationContextKind,
  type MeetingTopicInContext,
} from '@core/api/types';
import {
  CONTEXT_KIND_WORDS,
  pinInput,
  pinRefusal,
} from '@domain/conversations';
import { meetingDay } from '@domain/meetings';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { conversationErrorView } from './product-errors';
import type { ProductStore } from './product-store';

/** What the Add context dialog is opened with: the page's store, whose open conversation it pins to. */
export interface AddContextData {
  readonly store: ProductStore;
}

/**
 * "Add context": one more thing for the agent to read, a Jira issue or epic, a defect, a meeting topic (found by a
 * search over open topics), a Figma link or a repository of the content repository. Pinning is 0 AIU; a warm session
 * stops, so the next question starts one that reads everything again. Closes with true once pinned.
 */
@Component({
  selector: 'ah-add-context-dialog',
  imports: [DialogShell, Field, FieldControl],
  styles: `
    .found {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 220px;
      overflow-y: auto;
    }
    .found label {
      display: flex;
      gap: 8px;
      align-items: baseline;
      padding: 6px 8px;
      border-radius: var(--radius-md);
      cursor: pointer;
    }
    .found label:hover {
      background: var(--surface-hover);
    }
    .found .sub {
      display: block;
    }
  `,
  template: `
    <ah-dialog
      icon="anchor"
      heading="Add context"
      confirmLabel="Pin"
      busyLabel="Pinning…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >The agent reads what is pinned before it answers. Pinning spends
        nothing; a warm session restarts on the next question.</span
      >
      <form (submit)="$event.preventDefault(); submit()">
        <ah-field label="What">
          <select ahInput [value]="kind()" (change)="pickKind($event)">
            @for (k of kinds; track k) {
              <option [value]="k">{{ words[k].label }}</option>
            }
          </select>
        </ah-field>
        @if (kind() === 'meeting_topic') {
          <ah-field label="Topic" hint="Open topics whose title has this.">
            <input
              ahInput
              type="search"
              autocomplete="off"
              maxlength="100"
              [placeholder]="words[kind()].placeholder"
              [value]="query()"
              (input)="search(text($event))"
            />
          </ah-field>
          @if (searching()) {
            <p class="ah-hint" role="status">Searching…</p>
          } @else if (query().trim().length >= 2 && topics().length === 0) {
            <p class="ah-hint" role="status">
              No open topic matches “{{ query().trim() }}”.
            </p>
          } @else if (topics().length > 0) {
            <ul class="found" aria-label="Topics found">
              @for (t of topics(); track t.id) {
                <li>
                  <label>
                    <input
                      type="radio"
                      name="topic"
                      [checked]="picked()?.id === t.id"
                      (change)="picked.set(t)"
                    />
                    <span>
                      {{ t.title }}
                      <span class="sub ah-hint"
                        >{{ t.meetingTitle }} ·
                        {{ day(t.meetingStartsAt) }}</span
                      >
                    </span>
                  </label>
                </li>
              }
            </ul>
          }
        } @else {
          <ah-field [label]="words[kind()].label" [errorText]="problem() ?? ''">
            <input
              ahInput
              [mono]="kind() !== 'figma'"
              autocomplete="off"
              maxlength="2000"
              [placeholder]="words[kind()].placeholder"
              [value]="ref()"
              (input)="ref.set(text($event)); problem.set(null)"
            />
          </ah-field>
        }
      </form>
    </ah-dialog>
  `,
})
export class AddContextDialog {
  private readonly store = inject<AddContextData>(DIALOG_DATA).store;
  private readonly ref$ = inject<DialogRef<boolean>>(DialogRef);
  private readonly api = inject(ApiClient);

  protected readonly kinds = CONVERSATION_CONTEXT_KINDS;
  protected readonly words = CONTEXT_KIND_WORDS;
  protected readonly day = meetingDay;
  protected readonly busy = this.store.busy;

  readonly kind = signal<ConversationContextKind>('jira');
  readonly ref = signal('');
  readonly query = signal('');
  readonly topics = signal<readonly MeetingTopicInContext[]>([]);
  readonly picked = signal<MeetingTopicInContext | null>(null);
  protected readonly searching = signal(false);
  /** What is wrong with what was typed, before anything is sent. */
  readonly problem = signal<string | null>(null);
  private readonly failed = signal(false);
  /** Counts searches, so an older answer never replaces a newer one. */
  private searches = 0;

  protected readonly error = computed(() => {
    const error = this.store.commandError();
    if (this.failed() && error !== null) return conversationErrorView(error);
    const problem = this.problem();
    return problem !== null && this.kind() === 'meeting_topic'
      ? { variant: 'error' as const, heading: problem }
      : null;
  });

  protected pickKind(event: Event): void {
    const value =
      event.target instanceof HTMLSelectElement ? event.target.value : '';
    const kind = CONVERSATION_CONTEXT_KINDS.find((k) => k === value);
    if (kind === undefined) return;
    this.kind.set(kind);
    this.problem.set(null);
  }

  protected text(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  /** Searches open topics as the person types (2 characters or more). */
  async search(text: string): Promise<void> {
    this.query.set(text);
    this.problem.set(null);
    const q = text.trim().slice(0, 100);
    const n = ++this.searches;
    if (q.length < 2) {
      this.topics.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    const result = await this.api.searchMeetings(q);
    if (n !== this.searches) return;
    this.searching.set(false);
    this.topics.set(result.ok ? result.value.topics : []);
    if (!result.ok) this.problem.set('The search failed. Try again.');
  }

  /** Pins the item next to what is pinned already, and closes. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    const conversation = this.store.conversation();
    if (conversation === null) return;
    const kind = this.kind();
    let ref: string;
    if (kind === 'meeting_topic') {
      const topic = this.picked();
      if (topic === null) {
        this.problem.set('Pick a topic.');
        return;
      }
      ref = topic.id;
    } else {
      const typed = pinInput(kind, this.ref());
      if (!typed.ok) {
        this.problem.set(typed.message);
        return;
      }
      ref = typed.ref;
    }
    const refusal = pinRefusal(conversation.context, kind, ref);
    if (refusal !== null) {
      this.problem.set(refusal);
      return;
    }
    this.failed.set(false);
    const result = await this.store.pin([
      ...conversation.context,
      { kind, ref },
    ]);
    if (result.ok) this.ref$.close(true);
    else this.failed.set(true);
  }
}
