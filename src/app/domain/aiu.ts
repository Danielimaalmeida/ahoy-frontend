/** Number of nano-AIU in one AIU, used when converting user-entered budgets for the API. */
export const NANO_AIU_PER_AIU = 1_000_000_000;
const MAX_DECIMALS = 9;
const AIU_TEXT = /^(\d+)(?:\.(\d{1,9}))?$/;

/**
 * Formats integer nano-AIU as a decimal AIU amount with exactly `decimals` fraction digits, using integer
 * arithmetic only (F14). Non-integer or unsafe values are refused with an em dash.
 */
export function formatAiu(nanoAiu: number, decimals = 1): string {
  if (!Number.isSafeInteger(nanoAiu)) return '—';
  const digits = Number.isFinite(decimals)
    ? Math.min(MAX_DECIMALS, Math.max(0, Math.trunc(decimals)))
    : 1;
  const sign = nanoAiu < 0 ? '-' : '';
  const abs = Math.abs(nanoAiu);
  const divisor = 10 ** (MAX_DECIMALS - digits);
  const units = Math.floor(abs / divisor);
  const remainder = abs - units * divisor;
  const rounded = remainder * 2 >= divisor ? units + 1 : units;
  if (digits === 0) return `${sign}${rounded}`;
  const scale = 10 ** digits;
  const whole = Math.floor(rounded / scale);
  const fraction = String(rounded - whole * scale).padStart(digits, '0');
  return `${sign}${whole}.${fraction}`;
}

/**
 * Parses a decimal AIU amount ("25", "25.5") into integer nano-AIU without passing through a float. Rejects
 * scientific notation, negatives, signs, commas and more than nine decimals; `null` when the text is not an amount.
 */
export function parseAiu(text: string): number | null {
  const match = AIU_TEXT.exec(text.trim());
  if (match === null) return null;
  const whole = match[1] ?? '';
  const fraction = (match[2] ?? '').padEnd(MAX_DECIMALS, '0');
  const nanoAiu = Number(whole) * NANO_AIU_PER_AIU + Number(fraction);
  return Number.isSafeInteger(nanoAiu) ? nanoAiu : null;
}

/** Budget left (`cap − spent`), never below zero: "This may spend up to X AIU". */
export function remainingNano(
  capNanoAiu: number,
  spentNanoAiu: number
): number {
  return Math.max(0, capNanoAiu - spentNanoAiu);
}

/** Rounded percent of the cap already spent (0–100), for the meter fill; no colour change at 100. */
export function budgetPercent(
  capNanoAiu: number,
  spentNanoAiu: number
): number {
  if (capNanoAiu <= 0) return spentNanoAiu > 0 ? 100 : 0;
  return Math.min(
    100,
    Math.max(0, Math.round((spentNanoAiu / capNanoAiu) * 100))
  );
}

/** True when the cap the user typed is at least what the voyage already spent. */
export function capCoversSpent(
  capNanoAiu: number,
  spentNanoAiu: number
): boolean {
  return capNanoAiu >= spentNanoAiu;
}
