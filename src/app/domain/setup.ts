/**
 * The Setup page in words (`ahoy-hosted` design D23, §5 "Setup"): what is still needed before stories can run, the next
 * step, and the line the banner shows. Pure: the steps come from the API, already checked.
 */

/** Where a step stands, as the API says it. */
export type SetupStepState = 'done' | 'missing' | 'attention' | 'optional';

/** Who fixes a step: the chart (installation) or an admin in Team settings (team). */
export type SetupStepGroup = 'installation' | 'team';

/** The fields of a step this module reads. */
export interface SetupStepLike {
  readonly title: string;
  readonly group: SetupStepGroup;
  readonly required: boolean;
  readonly state: SetupStepState;
}

/** The fields of the page this module reads. */
export interface SetupLike {
  readonly steps: readonly SetupStepLike[];
  readonly requiredDone: number;
  readonly requiredTotal: number;
}

/** Whether every required step is done. */
export function setupReady(setup: SetupLike): boolean {
  return setup.requiredDone >= setup.requiredTotal;
}

/** The first required step not done, in the page's order; or null when Ahoy is ready. */
export function nextSetupStep<T extends SetupStepLike>(setup: {
  readonly steps: readonly T[];
}): T | null {
  return setup.steps.find((s) => s.required && s.state !== 'done') ?? null;
}

/** "8 of 11". */
export function setupProgressLabel(setup: SetupLike): string {
  return `${setup.requiredDone} of ${setup.requiredTotal}`;
}

/** How far along, from 0 to 100, for a progress bar. */
export function setupPercent(setup: SetupLike): number {
  if (setup.requiredTotal <= 0) return 100;
  return Math.round(
    (Math.min(setup.requiredDone, setup.requiredTotal) * 100) /
      setup.requiredTotal
  );
}

/** "1 to fix in the chart · 1 to fix here · 5 optional not set": what is left, by who fixes it. */
export function setupRemainderLabel(setup: SetupLike): string {
  const open = setup.steps.filter((s) => s.required && s.state !== 'done');
  const chart = open.filter((s) => s.group === 'installation').length;
  const here = open.length - chart;
  const review = setup.steps.filter(
    (s) => !s.required && s.state === 'attention'
  ).length;
  const optional = setup.steps.filter((s) => s.state === 'optional').length;
  const parts = [
    chart > 0 ? `${chart} to fix in the chart` : '',
    here > 0 ? `${here} to fix here` : '',
    review > 0 ? `${review} to check` : '',
    optional > 0 ? `${optional} optional not set` : '',
  ].filter(Boolean);
  return parts.length === 0 ? 'Nothing left to do' : parts.join(' · ');
}

/** The banner's line while Ahoy is not ready: what is left and, for an admin, the next step and where it is fixed. */
export function setupBannerText(
  setup: SetupLike,
  admin: boolean
): { readonly heading: string; readonly text: string } {
  if (!admin)
    return {
      heading: 'Ahoy is being set up.',
      text: `Some features may not work until the admins finish (${setupProgressLabel(setup)} required steps).`,
    };
  const next = nextSetupStep(setup);
  const where =
    next === null
      ? ''
      : ` Next: ${next.title}, ${next.group === 'installation' ? 'in the Helm chart' : 'in Team settings'}.`;
  return {
    heading: `Ahoy is not ready yet: ${setupProgressLabel(setup)} required steps done.`,
    text: `Voyages may fail until the rest are.${where}`,
  };
}
