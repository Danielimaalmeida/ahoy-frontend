import type { DestroyRef } from '@angular/core';

/** Something shared between holders, torn down when the last one lets go. */
export interface Disposable {
  dispose(): void;
}

/**
 * Entries shared by key and counted by holder: the first `acquire` of a key creates its entry, the last `release`
 * disposes of it. The stores use it so that only what a screen has open is kept alive.
 */
export class LeaseMap<K, E extends Disposable> {
  private readonly entries = new Map<K, { entry: E; holders: number }>();

  /** The entry of `key`, if someone holds it. */
  get(key: K): E | undefined {
    return this.entries.get(key)?.entry;
  }

  /** The keys held now. */
  keys(): readonly K[] {
    return [...this.entries.keys()];
  }

  /** Takes a hold on the entry of `key`, creating it if needed. Calling `release` more than once does nothing. */
  acquire(
    key: K,
    create: () => E
  ): { readonly entry: E; readonly release: () => void } {
    let held = this.entries.get(key);
    if (held === undefined) {
      held = { entry: create(), holders: 0 };
      this.entries.set(key, held);
    }
    held.holders++;
    const slot = held;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      slot.holders--;
      if (slot.holders === 0 && this.entries.get(key) === slot) {
        this.entries.delete(key);
        slot.entry.dispose();
      }
    };
    return { entry: slot.entry, release };
  }

  /** Disposes of every entry. */
  clear(): void {
    for (const { entry } of this.entries.values()) entry.dispose();
    this.entries.clear();
  }
}

/** Calls `release` when `destroyRef` is destroyed, if one is given, and returns `release` for an earlier call. */
export function releaseOnDestroy(
  release: () => void,
  destroyRef: DestroyRef | undefined
): () => void {
  if (destroyRef === undefined) return release;
  const unregister = destroyRef.onDestroy(release);
  return () => {
    unregister();
    release();
  };
}
