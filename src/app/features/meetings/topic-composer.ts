import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { RaisedBy } from '@core/api/types';
import { RAISED_BY_LABELS } from '@domain/meetings';
import { Button } from '@ui/button/button';
import { MeetingsStore } from './meetings-store';

/** The longest topic title the API takes (`maxLength: 300`). */
export const TOPIC_TITLE_MAX = 300;

/** The `them` choice that names no stakeholder. */
const SOMEONE_ELSE = '';

/**
 * The one line that adds a topic to the open meeting (boards `Meetings` and `MeetingNext`): the title, who raised it
 * (OTHER_COMPANY or ACME, and which stakeholder) and Add. Before the meeting the topic is one to raise; during it,
 * one that came up. Enter adds it; the choice of side stays for the next topic.
 */
@Component({
  selector: 'ah-topic-composer',
  imports: [Button, ReactiveFormsModule],
  styles: `
    :host {
      display: block;
    }
    form {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      background: var(--surface);
      border: 1px solid var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
      border-radius: var(--radius-lg);
    }
    .title {
      flex: 1 1 320px;
      width: auto;
      min-width: 0;
      font-size: 14px;
    }
    .who {
      width: 190px;
    }
    .ah-tabs__item[aria-pressed='true'] {
      background: var(--surface);
      color: var(--accent-text);
      box-shadow: var(--shadow-selected);
    }
  `,
  template: `
    <form (submit)="$event.preventDefault(); add()">
      <label class="ah-sr" for="topic-title">New topic</label>
      <input
        id="topic-title"
        class="ah-input title"
        type="text"
        autocomplete="off"
        [maxlength]="max"
        [placeholder]="placeholder()"
        [formControl]="title"
      />
      <span class="ah-hint" id="raised-by-label">Raised by</span>
      <div
        class="ah-tabs ah-tabs--pill"
        role="group"
        aria-labelledby="raised-by-label"
      >
        <button
          class="ah-tabs__item"
          type="button"
          [attr.aria-pressed]="raisedBy() === 'us'"
          (click)="raisedBy.set('us')"
        >
          {{ labels.us }}
        </button>
        <button
          class="ah-tabs__item"
          type="button"
          [attr.aria-pressed]="raisedBy() === 'them'"
          (click)="raisedBy.set('them')"
        >
          {{ labels.them }}
        </button>
      </div>
      @if (raisedBy() === 'them') {
        <label class="ah-sr" for="topic-who">Which stakeholder</label>
        <select id="topic-who" class="ah-input who" [formControl]="who">
          @for (email of stakeholders(); track email) {
            <option [value]="email">{{ email }}</option>
          }
          <option [value]="someoneElse">Someone else</option>
        </select>
      }
      <button ahButton="soft" type="submit" [disabled]="busy() || blank()">
        Add topic
      </button>
    </form>
  `,
})
export class TopicComposer {
  private readonly store = inject(MeetingsStore);

  protected readonly max = TOPIC_TITLE_MAX;
  protected readonly someoneElse = SOMEONE_ELSE;
  protected readonly labels = RAISED_BY_LABELS;
  protected readonly title = new FormControl('', { nonNullable: true });
  protected readonly who = new FormControl(SOMEONE_ELSE, { nonNullable: true });
  /** Who raised the next topic; `us` until the person picks Them. */
  readonly raisedBy = signal<RaisedBy>('us');
  private readonly typed = signal('');

  protected readonly busy = this.store.busy;
  protected readonly blank = computed(() => this.typed().trim() === '');
  protected readonly stakeholders = computed(
    () => this.store.meeting()?.stakeholders ?? []
  );
  protected readonly placeholder = computed(() =>
    this.store.meeting()?.status === 'in_progress'
      ? 'A topic that just came up'
      : 'A topic to raise in this meeting'
  );

  /** Which meeting is open; the same id while the answer to a command replaces the meeting with a fresh copy. */
  private readonly meetingId = computed(() => this.store.meeting()?.id ?? null);

  constructor() {
    this.title.valueChanges.subscribe((value) => this.typed.set(value));
    // Another meeting has other stakeholders: start again from its first one. Only a change of meeting does that: a
    // topic moved up or down in the same meeting keeps the stakeholder that was picked.
    effect(() => {
      this.meetingId();
      untracked(() =>
        this.who.setValue(this.stakeholders()[0] ?? SOMEONE_ELSE)
      );
    });
  }

  /** Adds the topic; on success the title clears and the choice of side stays. */
  async add(): Promise<void> {
    const title = this.title.value.trim();
    if (title === '' || this.busy()) return;
    const email =
      this.raisedBy() === 'them' && this.who.value !== SOMEONE_ELSE
        ? this.who.value
        : null;
    const added = await this.store.addTopic(title, this.raisedBy(), email);
    if (added) this.title.setValue('');
  }
}
