import type { ElementRef } from '@angular/core';
import {
  Component,
  afterRenderEffect,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { Icon } from '@ui/icon/icon';

/** A row of the live steps: a tool call, a message, or a gap where steps were left out. */
export type LiveStep =
  | {
      readonly kind: 'tool';
      readonly at?: string;
      readonly tool: string;
      readonly summary?: string;
    }
  | { readonly kind: 'message'; readonly at?: string; readonly text: string }
  | { readonly kind: 'gap'; readonly count: number };

/** A piece of agent text: plain, or a masked credential shown in `ah-redacted`. */
export interface TextSegment {
  readonly text: string;
  readonly redacted: boolean;
}

/** What the API puts where it masked a credential. */
export const REDACTED = '[REDACTED]';

/** How many characters of a message a row shows. */
export const MESSAGE_CHARS = 200;

/** How close to the bottom (px) still counts as "at the bottom", so new steps keep scrolling into view. */
const BOTTOM_SLACK = 24;

/** Splits agent text around `[REDACTED]`, so the masks can be highlighted by interpolation, never as HTML. */
export function redactedSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  text.split(REDACTED).forEach((part, index) => {
    if (index > 0) segments.push({ text: REDACTED, redacted: true });
    if (part !== '') segments.push({ text: part, redacted: false });
  });
  return segments;
}

/** A message's first `MESSAGE_CHARS` characters, with "…" when it was longer. */
export function clipMessage(text: string): string {
  const chars = Array.from(text);
  return chars.length > MESSAGE_CHARS
    ? `${chars.slice(0, MESSAGE_CHARS).join('')}…`
    : text;
}

/** The time of a step for the log column: "10:41:05" in the browser's time zone; "" when unknown. */
export function stepTime(at: string | undefined): string {
  if (at === undefined) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/** "38 steps not shown", "1 step not shown". */
export function gapLabel(count: number): string {
  return `${count} ${count === 1 ? 'step' : 'steps'} not shown`;
}

/** One row, ready for the template. */
type StepRow =
  | { readonly kind: 'gap'; readonly label: string }
  | {
      readonly kind: 'tool' | 'message';
      readonly time: string;
      readonly name: string;
      readonly segments: readonly TextSegment[];
    };

/**
 * The read-only list of a running agent's steps (`role="log"`), newest at the bottom. Tool rows show the tool and its
 * summary in mono; message rows the first 200 characters; gap rows say how many steps were left out. `[REDACTED]` is
 * wrapped in `ah-redacted` by interpolation: agent text is never HTML. The list scrolls itself to new steps only
 * while the reader is already at the bottom. A view, not a control: no actions, no chat.
 */
@Component({
  selector: 'ah-live-steps',
  imports: [Icon],
  // The bundle styles the rows but not the scroll box; the preview sets the mono summary's weight inline.
  styles: `
    :host {
      display: block;
    }
    .ah-steps {
      max-height: 360px;
      overflow-y: auto;
    }
    .ah-steps__text.ah-mono {
      font-weight: 400;
    }
    .ah-live-steps__empty {
      padding: var(--space-3) var(--space-4);
    }
    .ah-live-steps__foot {
      margin: 0;
      padding: var(--space-2) var(--space-4) var(--space-3);
      border-top: 1px solid var(--line-soft);
    }
  `,
  template: `
    <div
      #log
      class="ah-steps"
      role="log"
      [attr.aria-label]="label()"
      tabindex="0"
      (scroll)="onScroll()"
    >
      @for (row of rows(); track $index) {
        @if (row.kind === 'gap') {
          <div class="ah-steps__gap">{{ row.label }}</div>
        } @else {
          <div
            class="ah-steps__row"
            [class.ah-steps__row--message]="row.kind === 'message'"
          >
            <span class="ah-steps__time">{{ row.time }}</span>
            <span class="ah-steps__icon"
              ><ah-icon [name]="row.kind" [size]="12"
            /></span>
            <span class="ah-steps__tool">{{ row.name }}</span>
            <span class="ah-steps__text" [class.ah-mono]="row.kind === 'tool'">
              @for (part of row.segments; track $index) {
                <span [class.ah-redacted]="part.redacted">{{ part.text }}</span>
              }
            </span>
          </div>
        }
      } @empty {
        <div class="ah-live-steps__empty ah-hint">No steps yet.</div>
      }
    </div>
    @if (footer()) {
      <p class="ah-live-steps__foot ah-hint">{{ footer() }}</p>
    }
  `,
})
export class LiveSteps {
  /** The steps, oldest first; gap rows where the API left steps out. */
  readonly steps = input.required<readonly LiveStep[]>();
  /** The log's accessible name. */
  readonly label = input('Live steps');
  /** The line under the list; empty to leave it out. */
  readonly footer = input(
    'Newest at the bottom. Some steps are left out on purpose, so this list is never complete. ' +
      "This is a view, not a control: there's no chat with the agent."
  );

  protected readonly rows = computed<StepRow[]>(() =>
    this.steps().map((step): StepRow => {
      switch (step.kind) {
        case 'gap':
          return { kind: 'gap', label: gapLabel(step.count) };
        case 'tool':
          return {
            kind: 'tool',
            time: stepTime(step.at),
            name: step.tool,
            segments: redactedSegments(step.summary ?? ''),
          };
        case 'message':
          return {
            kind: 'message',
            time: stepTime(step.at),
            name: 'message',
            segments: redactedSegments(clipMessage(step.text)),
          };
      }
    })
  );

  private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');
  /** The reader is at the bottom (or hasn't scrolled): new steps scroll into view. */
  private atBottom = true;

  constructor() {
    afterRenderEffect({
      write: () => {
        this.rows();
        const el = this.log().nativeElement;
        if (this.atBottom) el.scrollTop = el.scrollHeight;
      },
    });
  }

  protected onScroll(): void {
    const el = this.log().nativeElement;
    this.atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
  }
}
