import { signal } from "@angular/core";
import type { ApiError, ApiResult } from "@core/api/api-error";

/**
 * Where a resource stands. `idle` until someone first needs it; `loading` only while there is no value yet (a refresh
 * keeps the old value on screen and the status `ready`); `error` keeps the last value, if there was one.
 */
export type ResourceStatus = "idle" | "loading" | "ready" | "error";

/** Decides which of two values to keep: the one in hand or the one just received. */
export type Reconcile<T> = (current: T | undefined, next: T) => T;

/** Keeps the received value unless the one in hand has a greater `version` (a command answer can beat a slow GET). */
export function newestVersion<T extends { readonly version: number }>(current: T | undefined, next: T): T {
  return current !== undefined && current.version > next.version ? current : next;
}

/**
 * One piece of server data held in signals, with a `refresh()` that never runs twice at once: a refresh asked for while
 * one is in flight runs once more after it, so the last answer always reflects the last request.
 */
export class StoreResource<T> {
  private readonly statusSignal = signal<ResourceStatus>("idle");
  private readonly valueSignal = signal<T | undefined>(undefined);
  private readonly errorSignal = signal<ApiError | null>(null);
  private readonly busySignal = signal(false);

  /** `idle`, `loading`, `ready` or `error`. */
  readonly status = this.statusSignal.asReadonly();
  /** The last value received, kept through refreshes and errors. */
  readonly value = this.valueSignal.asReadonly();
  /** The error of the last refresh, or null once one succeeds. */
  readonly error = this.errorSignal.asReadonly();
  /** Whether a request is in flight (the first load or a refresh). */
  readonly busy = this.busySignal.asReadonly();

  private inFlight: Promise<void> | null = null;
  private again = false;
  private disposed = false;

  constructor(
    private readonly load: () => Promise<ApiResult<T>>,
    private readonly reconcile: Reconcile<T> = (_current, next) => next,
  ) {}

  /** Reads the resource from the API. Resolves when the value (or the error) is in place. */
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.inFlight !== null) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Sets the value from elsewhere, such as the `202` answer of a command: the answer is the truth. */
  accept(value: T): void {
    if (this.disposed) return;
    this.valueSignal.set(this.reconcile(this.valueSignal(), value));
    this.errorSignal.set(null);
    this.statusSignal.set("ready");
  }

  /** Stops it for good: answers still in flight are dropped. */
  dispose(): void {
    this.disposed = true;
    this.again = false;
  }

  private async run(): Promise<void> {
    this.busySignal.set(true);
    try {
      do {
        this.again = false;
        if (this.valueSignal() === undefined) this.statusSignal.set("loading");
        const result = await this.load();
        if (this.disposed) return;
        if (result.ok) {
          this.accept(result.value);
        } else {
          this.errorSignal.set(result.error);
          this.statusSignal.set("error");
        }
      } while (this.again);
    } finally {
      this.busySignal.set(false);
    }
  }
}
