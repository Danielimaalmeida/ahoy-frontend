import { TestBed } from '@angular/core/testing';
import { HALLOWEEN_STORAGE_KEY, HalloweenService } from './halloween.service';
import { THEME_STORAGE } from './theme.service';

/** A hand-written `localStorage` stand-in; `broken` makes every call throw, as a refused storage does. */
class FakeStorage {
  readonly items = new Map<string, string>();
  broken = false;

  getItem(key: string): string | null {
    if (this.broken) throw new Error('SecurityError');
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.broken) throw new Error('QuotaExceededError');
    this.items.set(key, value);
  }
}

/** Creates the service over a given storage. */
function service(storage: FakeStorage | null): HalloweenService {
  TestBed.configureTestingModule({
    providers: [{ provide: THEME_STORAGE, useValue: storage }],
  });
  return TestBed.inject(HalloweenService);
}

describe('HalloweenService', () => {
  it('starts on when nothing is stored', () => {
    expect(service(new FakeStorage()).enabled()).toBe(true);
  });

  it('restores a stored off', () => {
    const storage = new FakeStorage();
    storage.items.set(HALLOWEEN_STORAGE_KEY, 'off');
    expect(service(storage).enabled()).toBe(false);
  });

  it('toggles and remembers the choice', () => {
    const storage = new FakeStorage();
    const halloween = service(storage);
    halloween.toggle();
    expect(halloween.enabled()).toBe(false);
    expect(storage.items.get(HALLOWEEN_STORAGE_KEY)).toBe('off');
    halloween.toggle();
    expect(halloween.enabled()).toBe(true);
    expect(storage.items.get(HALLOWEEN_STORAGE_KEY)).toBe('on');
  });

  it('still toggles when storage refuses reads and writes, or is missing', () => {
    const storage = new FakeStorage();
    storage.broken = true;
    const halloween = service(storage);
    expect(halloween.enabled()).toBe(true);
    halloween.toggle();
    expect(halloween.enabled()).toBe(false);
    TestBed.resetTestingModule();
    const without = service(null);
    without.set(false);
    expect(without.enabled()).toBe(false);
  });
});
