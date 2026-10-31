/** Reading an API payload that arrives as `unknown`, field by field. Pure. */

/** Whether a value is a plain object whose fields can be read by name. */
export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
