import { Component, input } from '@angular/core';
import type { ConversationProposal } from '@core/api/types';
import { storySentence } from '@domain/story-drafts';

/**
 * One story or meeting topic the agent proposed, numbered in its answer, with what it flagged and the evidence. It
 * proposes only: creating it in Jira or adding it to a meeting comes in a later step, so the card has no buttons yet.
 */
@Component({
  selector: 'ah-proposal-card',
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
    </article>
  `,
})
export class ProposalCard {
  /** The proposal, as the agent handed it in. */
  readonly proposal = input.required<ConversationProposal>();
  /** Its number in the answer, from 1. */
  readonly number = input.required<number>();
  protected readonly sentence = storySentence;
}
