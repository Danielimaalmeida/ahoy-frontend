/**
 * Building blocks of the manual guards in `guards.ts`: small checks that say why a value is refused, so that an
 * `invalid_response` can name the field that broke the contract instead of only saying that something did.
 *
 * Everything that comes from the network is `unknown` until a guard has accepted it. Guards are total: they never throw.
 */

/** A check says why a value is not acceptable, or returns null when it is. `at` names the value in the message. */
export type Check = (value: unknown, at: string) => string | null;

/** A type guard that can also say why it refused a value. */
export interface Guard<T> {
  (value: unknown): value is T;
  /** Why `value` is not a `T`, or null when it is one. */
  readonly explain: (value: unknown) => string | null;
}

/**
 * One check per key of `T`, optional keys included. A key left out, or one `T` does not have, does not compile, so a
 * guard cannot silently stop checking a field when its type gains one.
 */
export type Shape<T> = { readonly [K in keyof T]-?: Check };

/** Whether a value is a JSON object: not null and not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is a whole number JavaScript can hold exactly: no fraction, NaN, infinity or value past 2^53. */
export function isWholeNumber(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

/** Shows a value in a few characters, for a message: strings are quoted and cut, objects only named. */
export function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  switch (typeof value) {
    case "string":
      return value.length > 40 ? `${JSON.stringify(value.slice(0, 40))}…` : JSON.stringify(value);
    case "number":
      return Object.is(value, -0) ? "-0" : String(value);
    case "boolean":
    case "undefined":
      return String(value);
    case "object":
      return "an object";
    default:
      return typeof value;
  }
}

/** The message of a refusal: `Story.spentNanoAiu must be a whole number (got 12.5)`. */
function refuse(at: string, expected: string, value: unknown): string {
  return `${at} must be ${expected} (got ${describe(value)})`;
}

/** Any string. */
export const text: Check = (value, at) => (typeof value === "string" ? null : refuse(at, "a string", value));

/** A string with at least one character. */
export const nonEmptyText: Check = (value, at) =>
  typeof value === "string" && value !== "" ? null : refuse(at, "a non-empty string", value);

/** A boolean. */
export const flag: Check = (value, at) => (typeof value === "boolean" ? null : refuse(at, "true or false", value));

/** A JSON object. Its fields are the business of whoever reads the type it belongs to. */
export const record: Check = (value, at) => (isRecord(value) ? null : refuse(at, "an object", value));

/** A string of `min` to `max` characters. */
export function boundedText(expected: string, min: number, max: number): Check {
  return (value, at) =>
    typeof value === "string" && value.length >= min && value.length <= max ? null : refuse(at, expected, value);
}

/** A string of at most `maxLength` characters that matches `pattern`. The length is checked first, which is cheaper. */
export function patterned(expected: string, pattern: RegExp, maxLength: number): Check {
  return (value, at) =>
    typeof value === "string" && value.length <= maxLength && pattern.test(value) ? null : refuse(at, expected, value);
}

/** A whole number (see {@link isWholeNumber}) from `min` to `max`. */
export function wholeNumber(expected: string, min: number, max = Number.MAX_SAFE_INTEGER): Check {
  return (value, at) => (isWholeNumber(value) && value >= min && value <= max ? null : refuse(at, expected, value));
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An RFC 3339 date-time that `Date` can read, such as `2026-10-06T09:48:00.000Z`. */
export const timestamp: Check = (value, at) =>
  typeof value === "string" && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))
    ? null
    : refuse(at, "a timestamp like 2026-10-06T09:48:00.000Z", value);

/** One of a fixed list of strings. */
export function oneOf<T extends string>(values: readonly T[]): Check {
  return (value, at) =>
    typeof value === "string" && values.some((v) => v === value)
      ? null
      : refuse(at, `one of ${values.join(", ")}`, value);
}

/** The value `null`, or one that passes `check`. */
export function nullable(check: Check): Check {
  return (value, at) => (value === null ? null : check(value, at));
}

/** An absent value (`undefined`), or one that passes `check`. `null` is not absent. */
export function optional(check: Check): Check {
  return (value, at) => (value === undefined ? null : check(value, at));
}

/** An array whose every item passes `item`. */
export function arrayOf(item: Check): Check {
  return (value, at) => {
    if (!Array.isArray(value)) return refuse(at, "an array", value);
    for (const [index, element] of value.entries()) {
      const why = item(element, `${at}[${index}]`);
      if (why !== null) return why;
    }
    return null;
  };
}

/** An object whose fields pass their checks, in the order given. Fields that have no check are tolerated. */
export function shape<T>(checks: Shape<T>): Check {
  const entries = Object.entries<Check>(checks);
  return (value, at) => {
    if (!isRecord(value)) return refuse(at, "an object", value);
    for (const [key, check] of entries) {
      const why = check(value[key], `${at}.${key}`);
      if (why !== null) return why;
    }
    return null;
  };
}

/** A type guard for `T` built from a check; `name` starts the messages of `explain`. */
export function guard<T>(name: string, check: Check): Guard<T> {
  const explain = (value: unknown): string | null => check(value, name);
  return Object.assign((value: unknown): value is T => explain(value) === null, { explain });
}
