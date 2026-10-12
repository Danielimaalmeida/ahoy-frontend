/**
 * Words and numbers for the Metrics pages (`GET /metrics`). Pure: the period comes in with `now`, and every function
 * takes plain numbers, so a value of the API type can always be passed.
 */
import { formatAiu } from './aiu';
import type { DiagnosisActor } from './types';

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;
const DAY_MS = DAY_S * 1000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** The periods the page offers, in days; 30 is the API's default. */
export const METRICS_PERIODS = [7, 30, 90] as const;

/** A period the page offers. */
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];

/** Whether a value (a query parameter) names one of the periods. */
export function isMetricsPeriod(value: unknown): value is MetricsPeriod {
  return METRICS_PERIODS.some((p) => p === value);
}

/** The `[from, to)` of the last `days` days before `now`, as the API takes them. */
export function periodRange(
  days: number,
  now: Date
): { readonly from: string; readonly to: string } {
  return {
    from: new Date(now.getTime() - days * DAY_MS).toISOString(),
    to: now.toISOString(),
  };
}

/** The period of the same length just before `[from, to)`, to compare with. */
export function previousRange(range: {
  readonly from: string;
  readonly to: string;
}): { readonly from: string; readonly to: string } {
  const from = Date.parse(range.from);
  const length = Date.parse(range.to) - from;
  return {
    from: new Date(from - length).toISOString(),
    to: range.from,
  };
}

/** A whole-seconds duration in words: "45 s", "48 m", "2 h 50 m", "3 d 4 h"; a dash for none. */
export function formatSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isSafeInteger(seconds) || seconds < 0)
    return '—';
  if (seconds < MINUTE_S) return `${seconds} s`;
  if (seconds < HOUR_S) return `${Math.floor(seconds / MINUTE_S)} m`;
  if (seconds < DAY_S) {
    const hours = Math.floor(seconds / HOUR_S);
    const minutes = Math.floor((seconds % HOUR_S) / MINUTE_S);
    return minutes > 0 ? `${hours} h ${minutes} m` : `${hours} h`;
  }
  const days = Math.floor(seconds / DAY_S);
  const hours = Math.floor((seconds % DAY_S) / HOUR_S);
  return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
}

/** `part` as a whole percentage of `whole`, rounded half up; `null` when there is no whole. */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(whole) || whole <= 0)
    return null;
  return Math.floor((part * 200 + whole) / (whole * 2));
}

/** `part` as a percentage of `whole` for a cell: "78%", or a dash when there is no whole. */
export function formatPercent(part: number, whole: number): string {
  const percent = percentOf(part, whole);
  return percent === null ? '—' : `${percent}%`;
}

/** How a figure moved against the period before, in words: "+12% vs previous 30 days"; `null` with nothing to compare. */
export function changeVsPrevious(
  current: number,
  previous: number,
  days: number
): string | null {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous))
    return null;
  if (previous <= 0) return null;
  const percent = percentOf(Math.abs(current - previous), previous) ?? 0;
  const sign = current >= previous ? '+' : '−';
  return `${sign}${percent}% vs previous ${days} days`;
}

/** The width, as a percentage of the widest, of a bar worth `value`; at least 1 for any value above 0. */
export function barWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round((value / max) * 100)));
}

/** A token count for a tile: "820", "48.2 k", "3.1 M". */
export function formatTokens(tokens: number): string {
  if (!Number.isSafeInteger(tokens) || tokens < 0) return '—';
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${tenths(tokens, 1_000)} k`;
  return `${tenths(tokens, 1_000_000)} M`;
}

/** `value / unit` with one decimal, by integer arithmetic. */
function tenths(value: number, unit: number): string {
  const scaled = Math.floor((value * 10 + unit / 2) / unit);
  return `${Math.floor(scaled / 10)}.${scaled % 10}`;
}

/** AIU for the metrics tables: two decimals. */
export function formatMetricsAiu(nanoAiu: number): string {
  return formatAiu(nanoAiu, 2);
}

/** The label of a week that starts on `weekStart` (a Monday, `YYYY-MM-DD`): "14–20 Sep", "28 Sep–4 Oct". */
export function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return weekStart;
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const month = (d: Date) => MONTHS[d.getUTCMonth()] ?? '';
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${month(end)}`
    : `${start.getUTCDate()} ${month(start)}–${end.getUTCDate()} ${month(end)}`;
}

/** The short name of who fixes a halt, for table cells. */
export const FIXER_LABELS: Readonly<Record<DiagnosisActor, string>> = {
  story_owner: 'Owner',
  operator: 'Operator',
  agent_maintainer: 'Agent instructions',
};

/** The words of a `DiagnosisActor` the API sends, or the raw value for one this build does not know. */
export function fixerLabel(actor: string): string {
  return Object.hasOwn(FIXER_LABELS, actor)
    ? FIXER_LABELS[actor as DiagnosisActor]
    : actor;
}

/** The kinds of error group, as the API names them. */
export const ERROR_SOURCES = [
  'halt',
  'gate_fail',
  'gate_error',
  'run',
] as const;

/** A kind of error group. */
export type ErrorSource = (typeof ERROR_SOURCES)[number];

/** What an error group is, in words. */
export const ERROR_SOURCE_LABELS: Readonly<Record<ErrorSource, string>> = {
  halt: 'Halt',
  gate_fail: 'Gate failure',
  gate_error: 'Tooling error',
  run: 'Run exit',
};

/** What a person was waiting for, in words; a human gate names its key. */
export function waitLabel(kind: string, gate: string | null): string {
  switch (kind) {
    case 'answers':
      return 'Answers to agent questions';
    case 'decision':
      return gate === 'plan_accepted'
        ? 'Plan review'
        : gate === 'delivery_accepted'
          ? 'Delivery'
          : 'Human gate';
    case 'resume':
      return 'Resume after a halt';
    default:
      return kind;
  }
}

/** The outcomes of a wait as one line: "8 approve · 3 send_back · 1 reject", largest first. */
export function outcomesLine(
  outcomes: Readonly<Record<string, number>>
): string {
  const entries = Object.entries(outcomes)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.length === 0
    ? '—'
    : entries
        .map(([word, n]) => `${n} ${word.replaceAll('_', ' ')}`)
        .join(' · ');
}

/** How many series a chart colours before it folds the rest into "Other". */
export const MAX_SERIES = 5;

/** One series of the weekly chart: its label and its colour slot (1–5, in the design's fixed order). */
export interface WeekSeries {
  readonly label: string;
  readonly slot: number;
  readonly phases: readonly string[];
}

/** One week's column: its label, its total and the AIU of each series, in series order. */
export interface WeekColumn {
  readonly label: string;
  readonly total: number;
  readonly parts: readonly { readonly slot: number; readonly value: number }[];
}

/**
 * The weekly AIU chart: one series per phase in `phaseOrder` (the API's order), with the phases past the fifth folded
 * into "Other" so a colour is never generated; then one column per week.
 */
export function stackWeeks(
  weeks: readonly {
    readonly weekStart: string;
    readonly byPhase: Readonly<Record<string, number>>;
  }[],
  phaseOrder: readonly string[]
): {
  readonly series: readonly WeekSeries[];
  readonly columns: readonly WeekColumn[];
} {
  const seen = [...phaseOrder];
  for (const week of weeks)
    for (const phase of Object.keys(week.byPhase))
      if (!seen.includes(phase)) seen.push(phase);
  const series: WeekSeries[] =
    seen.length <= MAX_SERIES
      ? seen.map((phase, i) => ({ label: phase, slot: i + 1, phases: [phase] }))
      : [
          ...seen.slice(0, MAX_SERIES - 1).map((phase, i) => ({
            label: phase,
            slot: i + 1,
            phases: [phase],
          })),
          {
            label: 'Other',
            slot: MAX_SERIES,
            phases: seen.slice(MAX_SERIES - 1),
          },
        ];
  const columns = weeks.map((week) => {
    const parts = series.map((s) => ({
      slot: s.slot,
      value: s.phases.reduce(
        (sum, phase) => sum + (week.byPhase[phase] ?? 0),
        0
      ),
    }));
    return {
      label: weekLabel(week.weekStart),
      total: parts.reduce((sum, p) => sum + p.value, 0),
      parts,
    };
  });
  return { series, columns };
}

/** One week of the halts-per-week chart: its halts, how many repeated a known diagnosis, and its rows by diagnosis. */
export interface HaltWeek {
  readonly weekStart: string;
  readonly label: string;
  readonly halts: number;
  readonly repeated: number;
  readonly kinds: readonly {
    readonly kind: string;
    readonly halts: number;
    readonly stories: number;
    readonly repeated: number;
  }[];
}

/**
 * The report's `haltWeeks` grouped by week, oldest first, each week's diagnoses most halts first. `repeated` counts the
 * halts whose diagnosis an earlier halt in the period already had: the lessons of earlier voyages should make it fall.
 */
export function groupHaltWeeks(
  rows: readonly {
    readonly weekStart: string;
    readonly kind: string;
    readonly halts: number;
    readonly stories: number;
    readonly repeated: number;
  }[]
): readonly HaltWeek[] {
  const byWeek = new Map<string, (typeof rows)[number][]>();
  for (const row of rows)
    byWeek.set(row.weekStart, [...(byWeek.get(row.weekStart) ?? []), row]);
  return [...byWeek]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, kinds]) => ({
      weekStart,
      label: weekLabel(weekStart),
      halts: kinds.reduce((sum, k) => sum + k.halts, 0),
      repeated: kinds.reduce((sum, k) => sum + k.repeated, 0),
      kinds: [...kinds]
        .sort((a, b) => b.halts - a.halts || a.kind.localeCompare(b.kind))
        .map(({ kind, halts, stories, repeated }) => ({
          kind,
          halts,
          stories,
          repeated,
        })),
    }));
}
