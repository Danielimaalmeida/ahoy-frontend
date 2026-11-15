import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ConversationProposal, MeetingSummary } from '@core/api/types';
import { isJiraProjectKey } from '@domain/conversations';
import { meetingDay, meetingTime } from '@domain/meetings';
import { storySentence } from '@domain/story-drafts';
import { Button } from '@ui/button/button';
import { FieldControl } from '@ui/field/field';

/** What the card's actions show: the buttons, or the short form of one of them. */
type Acting = 'none' | 'jira' | 'meeting';

/**
 * One story or meeting topic the agent proposed, numbered in its answer, with what it flagged and the evidence. Its
 * conversation's owner turns it into work with a click (D24, step 2): Create in Jira for a story, in a project they
 * name, or Add to a meeting that is planned or running. Once done, the card says what it became, with its link.
 */
@Component({
  selector: 'ah-proposal-card',
  imports: [Button, FieldControl, RouterLink],
  styles: `
    :host {
      display: block;
    }
    article {
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--surface);
    }
    .head {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    .n {
      font-weight: 700;
      color: var(--ink-soft);
    }
    h3 {
      margin: 0;
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
    }
    ul {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .text {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .flags {
      list-style: none;
      padding: 0;
      gap: 6px;
    }
    .flag {
      display: flex;
      flex-direction: column;
      gap: 2px;
      border-left: 3px solid var(--notice-line);
      padding-left: 8px;
    }
    .actions,
    .act {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: end;
    }
    .act label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      min-width: 0;
    }
    .act input {
      width: 9rem;
    }
    .act select {
      max-width: 100%;
    }
    .done {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    @let p = proposal();
    <article [attr.aria-label]="'Proposal ' + number()">
      <div class="head">
        <span class="n">{{ number() }}</span>
        <span class="ah-tag">{{
          p.kind === 'story' ? 'Story' : 'Meeting topic'
        }}</span>
        <h3>{{ p.story?.title ?? p.topic?.title }}</h3>
      </div>
      @if (p.story; as s) {
        <span class="text">{{ sentence(s) }}</span>
        <span class="label">Acceptance criteria</span>
        <ul>
          @for (c of s.acceptanceCriteria; track $index) {
            <li class="text">{{ c }}</li>
          }
        </ul>
        @if (s.outOfScope.length > 0) {
          <span class="label">Out of scope</span>
          <ul>
            @for (c of s.outOfScope; track $index) {
              <li class="text">{{ c }}</li>
            }
          </ul>
        }
        @if (s.openQuestions.length > 0) {
          <span class="label">Open questions</span>
          <ul>
            @for (c of s.openQuestions; track $index) {
              <li class="text">{{ c }}</li>
            }
          </ul>
        }
      }
      @if (p.topic; as t) {
        <span class="text">{{ t.note }}</span>
      }
      @if (p.flags.length > 0) {
        <ul class="flags" aria-label="Flags">
          @for (f of p.flags; track $index) {
            <li class="flag">
              <b class="text">{{ f.label }}</b>
              <span class="ah-hint text">{{ f.evidence }}</span>
            </li>
          }
        </ul>
      }
      @if (p.done; as d) {
        <p class="done ah-hint">
          @if (d.jiraKey !== null) {
            Created in Jira as
            @if (d.jiraUrl !== null) {
              <a [href]="d.jiraUrl" target="_blank" rel="noopener noreferrer">{{
                d.jiraKey
              }}</a>
            } @else {
              <b>{{ d.jiraKey }}</b>
            }
          } @else if (d.meetingId !== null) {
            Added to the meeting
            <a [routerLink]="['/meetings', d.meetingId]">{{
              d.meetingTitle ?? 'it was added to'
            }}</a>
          } @else {
            Added to a meeting that was deleted since
          }
          by {{ d.byName ?? d.by }}, {{ when(d.at) }}.
        </p>
      } @else if (canAct()) {
        @switch (acting()) {
          @case ('none') {
            <div class="actions">
              @if (p.kind === 'story') {
                <button ahButton size="sm" type="button" (click)="startJira()">
                  Create in Jira
                </button>
              }
              <button ahButton size="sm" type="button" (click)="startMeeting()">
                Add to a meeting
              </button>
            </div>
          }
          @case ('jira') {
            <form class="act" (submit)="$event.preventDefault(); create()">
              <label
                >Jira project
                <input
                  ahInput
                  autocomplete="off"
                  maxlength="50"
                  placeholder="PROJ"
                  [attr.aria-invalid]="projectProblem() ? 'true' : null"
                  [value]="project()"
                  (input)="project.set(text($event))"
                />
              </label>
              <button
                ahButton="primary"
                size="sm"
                type="submit"
                [disabled]="!projectOk()"
                [attr.aria-disabled]="busy() ? 'true' : null"
              >
                Create story
              </button>
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                (click)="acting.set('none')"
              >
                Cancel
              </button>
            </form>
            <span class="ah-hint"
              >Creates the story in Jira as it is shown here, labelled
              ahoy-product.</span
            >
          }
          @case ('meeting') {
            @if (meetings(); as list) {
              @if (list.length === 0) {
                <span class="ah-hint"
                  >No meeting is planned or running. Plan one on the
                  <a routerLink="/meetings">Meetings</a> page first.</span
                >
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  (click)="acting.set('none')"
                >
                  Cancel
                </button>
              } @else {
                <form class="act" (submit)="$event.preventDefault(); add()">
                  <label
                    >Meeting
                    <select
                      ahInput
                      [value]="chosenMeeting()"
                      (change)="meetingId.set(text($event))"
                    >
                      @for (m of list; track m.id) {
                        <option [value]="m.id">
                          {{ m.title }} · {{ when(m.startsAt)
                          }}{{ m.status === 'in_progress' ? ' · running' : '' }}
                        </option>
                      }
                    </select>
                  </label>
                  <button
                    ahButton="primary"
                    size="sm"
                    type="submit"
                    [disabled]="chosenMeeting() === ''"
                    [attr.aria-disabled]="busy() ? 'true' : null"
                  >
                    Add topic
                  </button>
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    (click)="acting.set('none')"
                  >
                    Cancel
                  </button>
                </form>
              }
            } @else {
              <span class="ah-hint" role="status">Reading the meetings…</span>
            }
          }
        }
      }
    </article>
  `,
})
export class ProposalCard {
  /** The proposal, as the agent handed it in. */
  readonly proposal = input.required<ConversationProposal>();
  /** Its number in the answer, from 1. */
  readonly number = input.required<number>();
  /** Whether the person may turn it into work: the conversation is theirs. */
  readonly canAct = input(false);
  /** Whether a command is in flight, so a second click waits. */
  readonly busy = input(false);
  /** The Jira project offered first: the project of the first pinned Jira issue, or empty. */
  readonly defaultProject = input('');
  /** The planned and running meetings, or null while they are read. */
  readonly meetings = input<readonly MeetingSummary[] | null>(null);
  /** Asks for the story in Jira, in the project named. */
  readonly createIssue = output<string>();
  /** Asks for the proposal as a topic of the meeting named. */
  readonly addToMeeting = output<string>();
  /** Asks for the meetings to be read, when the person first wants to add to one. */
  readonly meetingsWanted = output();

  protected readonly acting = signal<Acting>('none');
  protected readonly project = signal('');
  protected readonly meetingId = signal('');
  /** The meeting chosen, or the first one offered until the person picks another. */
  protected readonly chosenMeeting = computed(
    () => this.meetingId() || (this.meetings()?.[0]?.id ?? '')
  );
  protected readonly projectOk = computed(() =>
    isJiraProjectKey(this.project())
  );
  protected readonly projectProblem = computed(
    () => this.project().trim() !== '' && !this.projectOk()
  );
  protected readonly sentence = storySentence;
  protected readonly when = (iso: string) =>
    `${meetingDay(iso)} ${meetingTime(iso)}`;
  protected readonly text = (e: Event) =>
    (e.target as HTMLInputElement | HTMLSelectElement).value;

  protected startJira(): void {
    if (this.project() === '') this.project.set(this.defaultProject());
    this.acting.set('jira');
  }

  protected startMeeting(): void {
    this.meetingsWanted.emit();
    this.acting.set('meeting');
  }

  protected create(): void {
    if (!this.projectOk() || this.busy()) return;
    this.createIssue.emit(this.project().trim().toUpperCase());
  }

  protected add(): void {
    const chosen = this.chosenMeeting();
    if (chosen === '' || this.busy()) return;
    this.addToMeeting.emit(chosen);
  }
}
