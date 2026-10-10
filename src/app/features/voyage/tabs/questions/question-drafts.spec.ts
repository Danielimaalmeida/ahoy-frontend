import { DRAFT_STORAGE, QuestionDrafts, draftKey } from './question-drafts';
import { TestBed } from '@angular/core/testing';

/** A `Storage` held in a map, which can be made to throw as a browser that denies storage does. */
class FakeStorage implements Storage {
  readonly items = new Map<string, string>();
  denied = false;

  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    if (this.denied) throw new DOMException('denied', 'SecurityError');
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    if (this.denied) throw new DOMException('denied', 'SecurityError');
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.denied) throw new DOMException('denied', 'QuotaExceededError');
    this.items.set(key, value);
  }
}

describe('QuestionDrafts', () => {
  it('stores a draft under ahoy.draft.{key}.{Qn}', () => {
    const storage = new FakeStorage();
    new QuestionDrafts('PROJ-131', storage).write('Q3', 'On the total.');
    expect(storage.items.get('ahoy.draft.PROJ-131.Q3')).toBe('On the total.');
    expect(draftKey('PROJ-131', 'Q3')).toBe('ahoy.draft.PROJ-131.Q3');
  });

  it('gives a draft back after a page reload (a new instance over the same storage)', () => {
    const storage = new FakeStorage();
    new QuestionDrafts('PROJ-131', storage).write('Q3', 'On the total.');
    const reloaded = new QuestionDrafts('PROJ-131', storage);
    expect(reloaded.read('Q3')).toBe('On the total.');
  });

  it("keeps one voyage's drafts apart from another's", () => {
    const storage = new FakeStorage();
    new QuestionDrafts('PROJ-131', storage).write('Q3', 'mine');
    expect(new QuestionDrafts('PROJ-123', storage).read('Q3')).toBe('');
  });

  it('forgets a draft only when it is cleared, in memory and in storage', () => {
    const storage = new FakeStorage();
    const drafts = new QuestionDrafts('PROJ-131', storage);
    drafts.write('Q3', 'On the total.');
    drafts.clear('Q3');
    expect(drafts.read('Q3')).toBe('');
    expect(storage.items.size).toBe(0);
  });

  it('treats an emptied text as no draft', () => {
    const storage = new FakeStorage();
    const drafts = new QuestionDrafts('PROJ-131', storage);
    drafts.write('Q3', 'a');
    drafts.write('Q3', '');
    expect(drafts.read('Q3')).toBe('');
    expect(storage.items.size).toBe(0);
  });

  it('keeps drafts in memory when the storage denies every access', () => {
    const storage = new FakeStorage();
    storage.denied = true;
    const drafts = new QuestionDrafts('PROJ-131', storage);
    expect(() => drafts.write('Q3', 'kept')).not.toThrow();
    expect(drafts.read('Q3')).toBe('kept');
    expect(() => drafts.clear('Q3')).not.toThrow();
    expect(drafts.read('Q3')).toBe('');
    expect(new QuestionDrafts('PROJ-131', storage).read('Q2')).toBe('');
  });

  it('works with no storage at all', () => {
    const drafts = new QuestionDrafts('PROJ-131', null);
    drafts.write('Q3', 'kept');
    expect(drafts.read('Q3')).toBe('kept');
  });

  it("injects the tab's sessionStorage by default", () => {
    expect(TestBed.inject(DRAFT_STORAGE)).toBe(globalThis.sessionStorage);
  });
});
