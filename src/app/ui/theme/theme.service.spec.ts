import { TestBed } from '@angular/core/testing';
import {
  THEME_STORAGE,
  THEME_STORAGE_KEY,
  ThemeService,
  isTheme,
} from './theme.service';

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
function service(storage: FakeStorage | null): ThemeService {
  TestBed.configureTestingModule({
    providers: [{ provide: THEME_STORAGE, useValue: storage }],
  });
  return TestBed.inject(ThemeService);
}

const htmlTheme = (): string | null =>
  document.documentElement.getAttribute('data-theme');

describe('ThemeService', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('starts light and marks <html> with it when nothing is stored', () => {
    const theme = service(new FakeStorage());
    expect(theme.theme()).toBe('light');
    expect(htmlTheme()).toBe('light');
  });

  it('restores a stored dark theme', () => {
    const storage = new FakeStorage();
    storage.items.set(THEME_STORAGE_KEY, 'dark');
    expect(service(storage).theme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    const storage = new FakeStorage();
    storage.items.set(THEME_STORAGE_KEY, 'midnight');
    expect(service(storage).theme()).toBe('light');
  });

  it('switches the theme, marks <html> and remembers it', () => {
    const storage = new FakeStorage();
    const theme = service(storage);
    theme.set('dark');
    expect(theme.theme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('dark');
    theme.toggle();
    expect(theme.theme()).toBe('light');
    expect(htmlTheme()).toBe('light');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('still switches when storage refuses reads and writes', () => {
    const storage = new FakeStorage();
    storage.broken = true;
    const theme = service(storage);
    expect(theme.theme()).toBe('light');
    theme.toggle();
    expect(theme.theme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  it('works without storage at all', () => {
    const theme = service(null);
    theme.set('dark');
    expect(htmlTheme()).toBe('dark');
  });

  it('recognises only the two themes', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('Dark')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
