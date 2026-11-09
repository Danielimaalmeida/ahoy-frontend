/**
 * Words and numbers for the Trends section of the Metrics page (`GET /metrics/trends`): whether the harness is getting
 * better. The API gives counts and medians; this file divides them into the signals, compares the last four weeks with
 * the four before and draws the sparklines. Pure.
 */
import { formatAiu } from './aiu';
import { formatSeconds, weekLabel } from './metrics';

/** The spans the section offers, in weeks; 12 is the API's default. */
export const TREND_SPANS = [8, 12, 26] as const;

/** A span the section offers. */
export type TrendSpan = (typeof TREND_SPANS)[number];

/** Whether a value (a query parameter) names one of the spans. */
export function isTrendSpan(value: unknown): value is TrendSpan {
  return TREND_SPANS.some((s) => s === value);
}

/** The weeks of the recent window, and of the window before it, that the verdicts compare. */
export const RECENT_WEEKS = 4;

/** A week with fewer voyages than this is drawn faded: too few to read a trend into. */
export const MIN_VOYAGES = 3;

/** A change smaller than this share of the earlier value is "flat". */
const FLAT_SHARE = 0.1;

/** What the API counts in one window (`TrendSignals`): counts and medians. */
export interface TrendCounts {
  readonly voyages: number;
  readonly halts: number;
  readonly repeatedHalts: number;
  readonly questions: number;
  readonly humanDecisions: number;
  readonly sentBack: number;
  readonly gateEvaluations: number;
  readonly gatePasses: number;
  readonly finished: number;
  readonly done: number;
  readonly finishedWithRework: number;
  readonly packages: number;
  readonly unverified: number;
  readonly runs: number;
  readonly runErrors: number;
  readonly nanoAiu: number;
  readonly fixNanoAiu: number;
  readonly medianNanoAiuPerDone: number | null;
  readonly medianSecondsToDone: number | null;
  readonly waits: number;
  readonly medianWaitSeconds: number | null;
}

/** The groups of signals, in the order the section shows them. */
export const TREND_GROUPS = [
  {
    id: 'autonomy',
    label: 'Autonomy',
    lede: 'How often a person has to step in',
  },
  {
    id: 'quality',
    label: 'Quality of the work',
    lede: 'Does it come out right the first time',
  },
  {
    id: 'cost',
    label: 'Cost and speed',
    lede: 'What a voyage costs and how long it takes',
  },
] as const;

export type TrendGroup = (typeof TREND_GROUPS)[number]['id'];

/** How a signal's value reads: a ratio, a percentage, AIU, a duration or a count per week. */
type TrendFormat = 'ratio' | 'percent' | 'aiu' | 'duration' | 'perWeek';

/** One signal: what it divides, which way is better and how it reads. */
export interface TrendSignal {
  readonly id: string;
  readonly group: TrendGroup;
  readonly label: string;
  /** Which way the harness gets better. */
  readonly better: 'lower' | 'higher';
  readonly format: TrendFormat;
  /** The signal's value in a window of `weeks` weeks; `null` when there is nothing to divide by. */
  readonly value: (c: TrendCounts, weeks: number) => number | null;
  /** What it was counted over, in a few words, for the card's foot. */
  readonly basis: (c: TrendCounts) => string;
}

const ratio = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;
const percent = (part: number, whole: number): number | null =>
  whole > 0 ? (part * 100) / whole : null;
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** The signals, in their groups' order. */
export const TREND_SIGNALS: readonly TrendSignal[] = [
  {
    id: 'halts',
    group: 'autonomy',
    label: 'Halts per voyage',
    better: 'lower',
    format: 'ratio',
    value: (c) => ratio(c.halts, c.voyages),
    basis: (c) =>
      `${plural(c.halts, 'halt')} in ${plural(c.voyages, 'voyage')}`,
  },
  {
    id: 'repeated',
    group: 'autonomy',
    label: 'Halts that repeat the last diagnosis',
    better: 'lower',
    format: 'percent',
    value: (c) => percent(c.repeatedHalts, c.halts),
    basis: (c) => `${c.repeatedHalts} of ${plural(c.halts, 'halt')}`,
  },
  {
    id: 'questions',
    group: 'autonomy',
    label: 'Questions to people per voyage',
    better: 'lower',
    format: 'ratio',
    value: (c) => ratio(c.questions, c.voyages),
    basis: (c) => `${plural(c.questions, 'time')} an agent stopped to ask`,
  },
  {
    id: 'sentBack',
    group: 'autonomy',
    label: 'Sent back at human gates',
    better: 'lower',
    format: 'percent',
    value: (c) => percent(c.sentBack, c.humanDecisions),
    basis: (c) => `${c.sentBack} of ${plural(c.humanDecisions, 'decision')}`,
  },
  {
    id: 'gatePass',
    group: 'quality',
    label: 'Gate verdicts that pass',
    better: 'higher',
    format: 'percent',
    value: (c) => percent(c.gatePasses, c.gateEvaluations),
    basis: (c) => `${plural(c.gateEvaluations, 'verdict')}, CI polls left out`,
  },
  {
    id: 'rework',
    group: 'quality',
    label: 'Voyages that needed rework',
    better: 'lower',
    format: 'percent',
    value: (c) => percent(c.finishedWithRework, c.finished),
    basis: (c) =>
      `${c.finishedWithRework} of ${plural(c.finished, 'finished voyage')}`,
  },
  {
    id: 'unverified',
    group: 'quality',
    label: 'Work packages delivered unverified',
    better: 'lower',
    format: 'percent',
    value: (c) => percent(c.unverified, c.packages),
    basis: (c) => `${c.unverified} of ${plural(c.packages, 'package')}`,
  },
  {
    id: 'runErrors',
    group: 'quality',
    label: 'Runs that ended in an error',
    better: 'lower',
    format: 'percent',
    value: (c) => percent(c.runErrors, c.runs),
    basis: (c) => `${c.runErrors} of ${plural(c.runs, 'run')}`,
  },
  {
    id: 'aiuPerDone',
    group: 'cost',
    label: 'AIU per done voyage (median)',
    better: 'lower',
    format: 'aiu',
    value: (c) => c.medianNanoAiuPerDone,
    basis: (c) => plural(c.done, 'done voyage'),
  },
  {
    id: 'fixAiu',
    group: 'cost',
    label: 'AIU spent redoing work',
    better: 'lower',
    format: 'percent',
    value: (c) => percent(c.fixNanoAiu, c.nanoAiu),
    basis: () => 'review rework, CI fixes, retries, revisions, repairs',
  },
  {
    id: 'timeToDone',
    group: 'cost',
    label: 'Time to done (median)',
    better: 'lower',
    format: 'duration',
    value: (c) => c.medianSecondsToDone,
    basis: () => "first run to done, people's waits included",
  },
  {
    id: 'wait',
    group: 'cost',
    label: 'Wait on a person (median)',
    better: 'lower',
    format: 'duration',
    value: (c) => c.medianWaitSeconds,
    basis: (c) =>
      `${plural(c.waits, 'wait')} for answers, decisions or a resume`,
  },
  {
    id: 'done',
    group: 'cost',
    label: 'Voyages done',
    better: 'higher',
    format: 'perWeek',
    value: (c, weeks) => (weeks > 0 ? c.done / weeks : null),
    basis: (c) =>
      `${plural(c.finished - c.done, 'voyage')} blocked at a ceiling`,
  },
];

/** A signal's value in words: "0.8", "19%", "41.2", "1 d 6 h", "7 / week"; a dash for none. */
export function formatTrend(format: TrendFormat, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'ratio':
      return value.toFixed(1);
    case 'percent':
      return `${Math.round(value)}%`;
    case 'aiu':
      return formatAiu(Math.round(value), 1);
    case 'duration':
      return formatSeconds(Math.round(value));
    case 'perWeek':
      return `${value.toFixed(1).replace(/\.0$/, '')} / week`;
  }
}

/** Whether a signal moved the way the harness gets better. `none` when one side has nothing to compare. */
export type TrendVerdict = 'better' | 'worse' | 'flat' | 'none';

/** How `now` compares with `was` for a signal that gets better `better`. */
export function trendVerdict(
  now: number | null,
  was: number | null,
  better: 'lower' | 'higher'
): { readonly verdict: TrendVerdict; readonly change: number | null } {
  if (now === null || was === null) return { verdict: 'none', change: null };
  const change = was === 0 ? null : Math.round(((now - was) * 100) / was);
  const flat =
    was === 0 ? now === 0 : Math.abs(now - was) < Math.abs(was) * FLAT_SHARE;
  if (flat) return { verdict: 'flat', change };
  const up = now > was;
  return {
    verdict: up === (better === 'higher') ? 'better' : 'worse',
    change,
  };
}

/**
 * How a change reads on its pill: "↓ 37%", "↑ 13%", "flat", "↑ from 0", "nothing before" when the 4 weeks before had
 * nothing to compare with (no voyages yet), or "no data".
 */
export function changeLabel(
  verdict: TrendVerdict,
  change: number | null,
  now: number | null,
  was: number | null
): string {
  if (verdict === 'flat') return 'flat';
  if (verdict === 'none')
    return now !== null && was === null ? 'nothing before' : 'no data';
  if (change === null)
    return now !== null && was !== null && now > was ? '↑ from 0' : '—';
  return `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%`;
}

/** A point of a sparkline, in its view box; `faded` when its week had too few voyages. */
export interface SparkPoint {
  readonly x: number;
  readonly y: number;
  readonly faded: boolean;
  readonly title: string;
}

/** A sparkline: its line (one `points` string per run of weeks with a value) and its dots. */
export interface Sparkline {
  readonly lines: readonly string[];
  readonly dots: readonly SparkPoint[];
}

/**
 * The sparkline of `values` in a `width` × `height` box with `pad` around it. A week without a value breaks the line;
 * a flat series sits in the middle.
 */
export function sparkline(
  values: readonly (number | null)[],
  labels: readonly string[],
  faded: readonly boolean[],
  width: number,
  height: number,
  pad = 4
): Sparkline {
  const present = values.filter((v): v is number => v !== null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0;
  const x = (i: number): number =>
    values.length > 1 ? pad + i * step : width / 2;
  const y = (v: number): number =>
    max === min
      ? height / 2
      : height - pad - ((v - min) / (max - min)) * (height - 2 * pad);
  const round = (n: number): number => Math.round(n * 10) / 10;
  const lines: string[] = [];
  const dots: SparkPoint[] = [];
  let run: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length > 1) lines.push(run.join(' '));
      run = [];
      return;
    }
    const point = { x: round(x(i)), y: round(y(v)) };
    run.push(`${point.x},${point.y}`);
    dots.push({
      ...point,
      faded: faded[i] ?? false,
      title: labels[i] ?? '',
    });
  });
  if (run.length > 1) lines.push(run.join(' '));
  return { lines, dots };
}

/** The x of week `i` of `count` in a sparkline box, for the version markers and the recent band. */
export function sparkX(
  i: number,
  count: number,
  width: number,
  pad = 4
): number {
  if (count <= 1) return width / 2;
  return Math.round((pad + (i * (width - 2 * pad)) / (count - 1)) * 10) / 10;
}

/** The indexes of the weeks in which a harness version ran its first run. */
export function versionWeeks(
  weekStarts: readonly string[],
  firstRuns: readonly string[]
): readonly number[] {
  const marks = new Set<number>();
  for (const at of firstRuns) {
    const day = at.slice(0, 10);
    // A version that started before the first week is not a change inside the span.
    let week = -1;
    weekStarts.forEach((w, i) => {
      if (w <= day) week = i;
    });
    if (week >= 0) marks.add(week);
  }
  return [...marks].sort((a, b) => a - b);
}

/** The short label of a week for a sparkline's ends: its start, "7 Sep". */
export function weekStartLabel(weekStart: string): string {
  const label = weekLabel(weekStart);
  const [start] = label.split('–');
  const month = label.split(' ').at(-1) ?? '';
  return /\s/.test(start ?? '') ? (start ?? label) : `${start} ${month}`;
}

const WEEK_MS = 7 * 86_400_000;

/** Whether the last week of `weekStarts` was still running at `to`: its counts are of part of a week. */
export function lastWeekPartial(
  weekStarts: readonly string[],
  to: string
): boolean {
  const last = weekStarts.at(-1);
  if (last === undefined) return false;
  return Date.parse(to) < Date.parse(`${last}T00:00:00Z`) + WEEK_MS;
}

/**
 * Where `at` falls among the weeks, as a fractional week index (0 is the first Monday, 1.5 the middle of the second
 * week), kept within the weeks: the start of the recent window, which is a rolling 28 days, not a Monday.
 */
export function weekPosition(
  weekStarts: readonly string[],
  at: string
): number {
  const first = weekStarts[0];
  if (first === undefined) return 0;
  const position =
    (Date.parse(at) - Date.parse(`${first}T00:00:00Z`)) / WEEK_MS;
  return Math.min(Math.max(0, position), Math.max(0, weekStarts.length - 1));
}
