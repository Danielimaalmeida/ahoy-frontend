import { InjectionToken } from '@angular/core';

/** Where unsent answers survive a page reload: the tab's `sessionStorage`, or `null` where the browser denies it. */
export const DRAFT_STORAGE = new InjectionToken<Storage | null>(
  'DRAFT_STORAGE',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return globalThis.sessionStorage;
      } catch {
        return null;
      }
    },
  }
);

/** The storage key of one draft: `ahoy.draft.PROJ-131.Q3`. */
export function draftKey(storyKey: string, questionId: string): string {
  return `ahoy.draft.${storyKey}.${questionId}`;
}

/**
 * The answers a person has typed and not sent, for one voyage. They live in memory (so a conflict or a refresh of the
 * store never touches them) and in `sessionStorage` (so a page reload does not either). A draft is removed only by
 * {@link clear}, which the tab calls once the answer is sent. Every storage access is in `try/catch`: a browser that
 * denies or fills the storage just keeps the drafts in memory. What is read back is only ever a string.
 */
export class QuestionDrafts {
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly storyKey: string,
    private readonly storage: Storage | null
  ) {}

  /** The draft for a question: the one in memory, else the one stored; "" when there is none. */
  read(questionId: string): string {
    const kept = this.memory.get(questionId);
    if (kept !== undefined) return kept;
    const stored = this.readStored(questionId);
    if (stored !== '') this.memory.set(questionId, stored);
    return stored;
  }

  /** Keeps the text typed so far; an empty text is no draft. */
  write(questionId: string, text: string): void {
    if (text === '') {
      this.clear(questionId);
      return;
    }
    this.memory.set(questionId, text);
    try {
      this.storage?.setItem(draftKey(this.storyKey, questionId), text);
    } catch {
      // Storage is full or denied: the draft stays in memory.
    }
  }

  /** Forgets the draft, in memory and in storage. */
  clear(questionId: string): void {
    this.memory.delete(questionId);
    try {
      this.storage?.removeItem(draftKey(this.storyKey, questionId));
    } catch {
      // Nothing to remove from a storage that cannot be read.
    }
  }

  private readStored(questionId: string): string {
    try {
      const value: unknown = this.storage?.getItem(
        draftKey(this.storyKey, questionId)
      );
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  }
}
