/**
 * A host URL as the API keeps it: parsed (the host in lower case, a default port dropped) and without trailing
 * slashes, so the same host typed another way is not taken for a new one. Text that does not parse is only trimmed.
 */
export function hostOf(text: string): string {
  const trimmed = text.trim();
  let href = trimmed;
  try {
    href = new URL(trimmed).href;
  } catch {
    // The validator refuses it; keep the text as typed.
  }
  return href.replace(/\/+$/, '');
}
