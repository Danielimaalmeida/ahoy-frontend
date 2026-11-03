import type { BacklogSprint } from './backlog-port';

const SPRINT_ORDER = { active: 0, future: 1, closed: 2 } as const;

/**
 * The order the backlog shows its sprints in: active, then future, then closed, each by id, and "No sprint" last. The
 * adapter pages in this order too, so that each page fills whole sprints instead of scattering stories across them.
 */
export function compareSprints(
  a: BacklogSprint | null,
  b: BacklogSprint | null
): number {
  return (
    (a === null ? 3 : SPRINT_ORDER[a.state]) -
      (b === null ? 3 : SPRINT_ORDER[b.state]) || (a?.id ?? 0) - (b?.id ?? 0)
  );
}
