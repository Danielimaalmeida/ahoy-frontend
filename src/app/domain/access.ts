/** A qnumber: `q` then 1 to 62 letters or digits, compared without case (the API's `AHOY_ALLOWED_QNUMBERS` rule). */
export const QNUMBER_PATTERN = /^q[a-z0-9]{1,62}$/i;

/** The qnumber in lower case, or null when the text is not one. Surrounding spaces are ignored. */
export function normalizeQnumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return QNUMBER_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** The first candidate that is a qnumber (the token's `sub`, then its `uid`, …), lower-cased; null if none is. */
export function qnumberOf(candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    const qnumber = normalizeQnumber(candidate);
    if (qnumber !== null) return qnumber;
  }
  return null;
}

/**
 * Whether a user may use the app. Without a list (`undefined`) the app does not check, and the API's own list decides;
 * with one, only a user whose qnumber is on it may, so a user whose qnumber cannot be read is refused.
 */
export function isAllowedUser(
  qnumber: string | null,
  allowed: readonly string[] | undefined
): boolean {
  if (allowed === undefined) return true;
  return qnumber !== null && allowed.includes(qnumber);
}
