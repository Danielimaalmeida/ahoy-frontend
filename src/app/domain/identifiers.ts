/** Jira key pattern: project key, hyphen, issue number (3B). */
export const STORY_KEY_PATTERN = /^[A-Z][A-Z0-9]+-[0-9]+$/;

/** True when the text is a key a voyage may have, like `PROJ-123`: the pattern and at most 40 characters (`StoryKey`). */
export function isStoryKey(value: string): boolean {
  return value.length <= 40 && STORY_KEY_PATTERN.test(value);
}

/** Short form of a control SHA for headers and tables ("a41f9c2"). */
export function shortSha(controlSha: string): string {
  return controlSha.slice(0, 7);
}

/** The actors Ahoy itself writes as: the reconciler, and the defect watch when it starts a voyage by itself. */
export const AHOY_ACTORS: readonly string[] = [
  'ahoy-reconciler',
  'ahoy-defect-watch',
];

/** Human name of an actor: Ahoy's own actors show as "Ahoy", everyone else by their e-mail. */
export function actorLabel(actor: string): string {
  return AHOY_ACTORS.includes(actor) ? 'Ahoy' : actor;
}

/** Token counts for run detail: "999", "182k", "1.5M". */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return '—';
  if (tokens < 1_000) return String(Math.round(tokens));
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  const millions = tokens / 1_000_000;
  if (millions < 10) {
    const rounded = millions.toFixed(1);
    return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded}M`;
  }
  return `${Math.round(millions)}M`;
}
