import { DOCUMENT } from "@angular/common";
import { Injectable, InjectionToken, inject, signal } from "@angular/core";

/** The design system's themes; the first one is the default (F16). */
export const THEMES = ["light", "dark"] as const;

/** A design-system theme, set as `data-theme` on `<html>`. */
export type Theme = (typeof THEMES)[number];

/** The `localStorage` key that remembers the chosen theme. */
export const THEME_STORAGE_KEY = "ahoy.theme";

/** Whether a value names a theme. */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Where the theme is remembered: `localStorage`, or `null` when the browser refuses it (private mode, policy). */
export const THEME_STORAGE = new InjectionToken<Pick<Storage, "getItem" | "setItem"> | null>("THEME_STORAGE", {
  providedIn: "root",
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * Reads and writes the theme: `data-theme` on `<html>`, light by default, remembered in `localStorage` when the
 * browser allows it. The app has no theme button yet (F16); only the `/_kit` gallery switches it.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly storage = inject(THEME_STORAGE);
  private readonly current = signal<Theme>(this.stored());

  /** The theme in use. */
  readonly theme = this.current.asReadonly();

  constructor() {
    this.root.setAttribute("data-theme", this.current());
  }

  /** Switches to a theme and remembers it. */
  set(theme: Theme): void {
    this.current.set(theme);
    this.root.setAttribute("data-theme", theme);
    try {
      this.storage?.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage full or refused: the theme still applies until the page reloads.
    }
  }

  /** Switches between light and dark. */
  toggle(): void {
    this.set(this.current() === "light" ? "dark" : "light");
  }

  /** The remembered theme, or light when there is none or it is not a theme. */
  private stored(): Theme {
    try {
      const value: unknown = this.storage?.getItem(THEME_STORAGE_KEY);
      return isTheme(value) ? value : THEMES[0];
    } catch {
      return THEMES[0];
    }
  }
}
