/**
 * The Setup page in words (`ahoy-hosted` design D23, §5 "Setup"): what is still needed before stories can run, the next
 * step, and the line the banner shows. Pure: the steps come from the API, already checked.
 */

/** Where a step stands, as the API says it. */
export type SetupStepState = 'done' | 'missing' | 'attention' | 'optional';

/** Who fixes a step: the chart (installation), an admin in Team settings (team), or the reader (you: their own token). */
export type SetupStepGroup = 'installation' | 'team' | 'you';

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

/** The fields of the reader's own Copilot token page this module reads. */
export interface CopilotTokenLike {
  readonly qnumber: string;
  readonly tokenReadable: boolean;
  readonly token: null | {
    readonly hint: string;
    readonly lastTest: null | {
      readonly result: 'works' | 'refused' | 'unreachable';
      readonly detail: string | null;
    };
  };
}

/**
 * The reader's own step after a change to their token, in the words Setup would answer (parity with `ahoy-hosted`'s
 * `copilotStep` in `service/setup.ts`), so the step shows the change without reading Setup again.
 */
export function copilotSetupStep(page: CopilotTokenLike): {
  state: SetupStepState;
  detail: string;
} {
  const token = page.token;
  if (token === null)
    return {
      state: 'optional',
      detail: `Not saved: your runs use the cluster's ahoy-copilot-${page.qnumber} Secret, if there is one.`,
    };
  if (!page.tokenReadable)
    return {
      state: 'attention',
      detail: 'Saved, but it cannot be read here: enter it again.',
    };
  const saved = `Saved, ending in ${token.hint || '…'}`;
  const test = token.lastTest;
  if (test?.result === 'refused')
    return {
      state: 'attention',
      detail: 'GitHub refused it at the last test.',
    };
  if (test?.result === 'unreachable')
    return {
      state: 'done',
      detail: `${saved}; GitHub could not be asked at the last test, so test it again.`,
    };
  if (test?.result === 'works')
    return {
      state: 'done',
      detail: `${saved}; it works as ${test.detail ?? '?'}.`,
    };
  return {
    state: 'done',
    detail: `${saved}; test it to see that GitHub takes it.`,
  };
}
