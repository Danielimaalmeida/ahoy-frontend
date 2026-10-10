/** Helpers to break a fixture one field at a time, for tests of what a guard refuses. */

/** A copy of `value` with `key` set to `to`. */
export function withField(value: object, key: string, to: unknown): unknown {
  return { ...value, [key]: to };
}

/** A copy of `value` without `key`. */
export function withoutField(value: object, key: string): unknown {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key)
  );
}
