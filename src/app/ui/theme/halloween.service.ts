import { Injectable, inject, signal } from '@angular/core';
import { THEME_STORAGE } from './theme.service';

/** The `localStorage` key that remembers whether the Halloween decorations are on. */
export const HALLOWEEN_STORAGE_KEY = 'ahoy.halloween';

/**
 * Temporary: whether the top bar wears its Halloween decorations. On by default, remembered in `localStorage` when the
 * browser allows it. Delete with the decorations.
 */
@Injectable({ providedIn: 'root' })
export class HalloweenService {
  private readonly storage = inject(THEME_STORAGE);
  private readonly current = signal(this.stored());

  /** Whether the decorations are on. */
  readonly enabled = this.current.asReadonly();

  /** Turns the decorations on or off and remembers it. */
  set(enabled: boolean): void {
    this.current.set(enabled);
    try {
      this.storage?.setItem(HALLOWEEN_STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Storage full or refused: the choice still applies until the page reloads.
    }
  }

  /** Switches the decorations on or off. */
  toggle(): void {
    this.set(!this.current());
  }

  /** The remembered choice: on unless `off` is stored. */
  private stored(): boolean {
    try {
      return this.storage?.getItem(HALLOWEEN_STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }
}
