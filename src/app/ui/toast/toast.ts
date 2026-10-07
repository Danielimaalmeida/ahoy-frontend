import type { OnDestroy } from "@angular/core";
import { Component, Injectable, inject, signal } from "@angular/core";
import { Icon } from "@ui/icon/icon";

/** How long a toast stays: about 5 seconds, as the Toast README says. */
export const TOAST_DURATION_MS = 5000;

/** The most toasts on screen at once; a new one past this pushes the oldest out. */
export const MAX_TOASTS = 3;

/** One confirmation on screen. */
export interface ToastMessage {
  readonly id: number;
  readonly text: string;
}

/**
 * Short confirmations after an action succeeds, in the past tense and saying what changed and what is next:
 * `toasts.show("Answer to Q2 sent. 1 question left.")`. They disappear on their own and never hold an action; anything
 * someone must decide is a banner or a dialog. Render them with one `<ah-toast-host />` in the app shell.
 */
@Injectable({ providedIn: "root" })
export class ToastService implements OnDestroy {
  private readonly queue = signal<readonly ToastMessage[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  /** The toasts on screen, oldest first. */
  readonly toasts = this.queue.asReadonly();

  /** Shows a toast for about 5 seconds. Blank text shows nothing. */
  show(text: string): void {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const id = this.nextId++;
    const next = [...this.queue(), { id, text: trimmed }];
    for (const dropped of next.splice(0, Math.max(0, next.length - MAX_TOASTS))) this.forget(dropped.id);
    this.queue.set(next);
    this.timers.set(
      id,
      setTimeout(() => {
        this.forget(id);
        this.queue.update((all) => all.filter((toast) => toast.id !== id));
      }, TOAST_DURATION_MS),
    );
  }

  ngOnDestroy(): void {
    for (const id of this.timers.keys()) this.forget(id);
  }

  private forget(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
  }
}

/**
 * Where toasts appear: bottom centre, above everything, and never in the way of a click. The region is always in the
 * page (`role="status"`, only additions announced) so a screen reader hears each toast as it arrives.
 */
@Component({
  selector: "ah-toast-host",
  imports: [Icon],
  template: `
    <div class="ah-toast-host" role="status" aria-atomic="false">
      @for (toast of toasts(); track toast.id) {
        <div class="ah-toast">
          <ah-icon name="check" />
          <span>{{ toast.text }}</span>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService).toasts;
}
