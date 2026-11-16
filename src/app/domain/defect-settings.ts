/**
 * Team settings › Defects in words (`ahoy-hosted` design §5 "Defect watch"): the state the side navigation shows, how
 * the priorities are typed and read back, and what one entry of the section's history says.
 * Pure.
 */

import { NANO_AIU_PER_AIU } from './aiu';
import { aiuLabel } from './phase-settings';
import { isRecord } from './records';

/** What the section keeps that the navigation and the history name. */
export interface DefectChoice {
  readonly watchOn: boolean;
  readonly autoStart?: boolean;
}

/** The highest AIU cap per defect the API takes: 200 AIU. */
export const MAX_DEFECT_BUDGET_NANO_AIU = 200 * NANO_AIU_PER_AIU;
/** The highest cap on starts per day and on open voyages the API takes. */
export const MAX_DEFECT_STARTS = 20;

/** A whole number as typed, from `min` to `max`, or why it is refused. */
function wholeNumberOf(
  typed: string,
  min: number,
  max: number
): { readonly value: number } | { readonly problem: string } {
  const text = typed.trim();
  const value = /^\d{1,3}$/.test(text) ? Number(text) : Number.NaN;
  return value >= min && value <= max
    ? { value }
    : { problem: `Type a whole number from ${min} to ${max}.` };
}

/** A cap on starts as typed: a whole number from 1 to {@link MAX_DEFECT_STARTS}, or why it is refused. */
export function startCapOf(
  typed: string
): { readonly value: number } | { readonly problem: string } {
  return wholeNumberOf(typed, 1, MAX_DEFECT_STARTS);
}

/**
 * The most AIU automatic starts may spend in a day: the cap per defect times the starts per day ("40 AIU"), or null
 * without a cap.
 */
export function dailySpendText(
  budgetNanoAiu: number | null,
  maxStartsPerDay: number
): string | null {
  return budgetNanoAiu === null
    ? null
    : aiuLabel(budgetNanoAiu * maxStartsPerDay);
}

/** What the spend confirmation weighs of the settings. */
export interface DefectSpend {
  readonly watchOn: boolean;
  readonly autoStart: boolean;
  readonly budgetNanoAiu: number | null;
  readonly maxStartsPerDay: number;
  /** Whose Copilot token the voyages run on. */
  readonly startAs: string | null;
}

/**
 * Whether going from `was` to `now` lets the watch spend more by itself, which needs the admin's yes (`confirmSpend`):
 * turning automatic starts on, or, while they are on, raising the cap per defect or the starts per day, or changing
 * who they start as (another person's Copilot token). Mirrors `ahoy-hosted`'s `spendsMore`.
 */
export function spendsMore(was: DefectSpend, now: DefectSpend): boolean {
  if (!now.watchOn || !now.autoStart) return false;
  if (!was.watchOn || !was.autoStart) return true;
  return (
    (now.budgetNanoAiu ?? 0) > (was.budgetNanoAiu ?? 0) ||
    now.maxStartsPerDay > was.maxStartsPerDay ||
    now.startAs !== was.startAs
  );
}

/** The most reproductions in any 24 hours the API takes. */
export const MAX_REPRODUCTIONS_PER_DAY = 50;

/** The reproductions per day as typed: a whole number from 1 to {@link MAX_REPRODUCTIONS_PER_DAY}, or why not. */
export function reproductionCapOf(
  typed: string
): { readonly value: number } | { readonly problem: string } {
  return wholeNumberOf(typed, 1, MAX_REPRODUCTIONS_PER_DAY);
}

/** The most hosts the API keeps. */
export const MAX_ALLOWED_HOSTS = 20;

const HOST =
  /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * The hosts a reproduction may reach as typed, separated by commas, spaces or lines: each lowercase and once, a host
 * name (`test.example.com`) or `*.domain` for its subdomains; or why not. Mirrors `ahoy-hosted`'s `allowedHostsOf`.
 */
export function allowedHostsOf(
  typed: string
): { readonly value: readonly string[] } | { readonly problem: string } {
  const hosts = [
    ...new Set(
      typed
        .split(/[\s,]+/)
        .map((h) => h.trim().toLowerCase())
        .filter((h) => h !== '')
    ),
  ];
  if (hosts.length > MAX_ALLOWED_HOSTS)
    return { problem: `Name at most ${MAX_ALLOWED_HOSTS} hosts.` };
  const bad = hosts.find((h) => h.length > 253 || !HOST.test(h));
  return bad === undefined
    ? { value: hosts }
    : {
        problem: `${bad} is not a host name or a *.domain wildcard, such as test.example.com or *.example.com.`,
      };
}

/** The hosts as the form shows them: one per line. */
export function allowedHostsText(hosts: readonly string[]): string {
  return hosts.join('\n');
}

/** The most days the API keeps a reproduction's screenshots and recordings. */
export const MAX_EVIDENCE_DAYS = 30;

/** The days as typed: a whole number from 0 to {@link MAX_EVIDENCE_DAYS}, or why not. */
export function evidenceDaysOf(
  typed: string
): { readonly value: number } | { readonly problem: string } {
  return wholeNumberOf(typed, 0, MAX_EVIDENCE_DAYS);
}

/** What the spend confirmation weighs of the reproduction settings. */
export interface ReproductionSpend {
  readonly reproduceOn: boolean;
  readonly maxReproductionsPerDay: number;
}

/**
 * Whether going from `was` to `now` lets reproduction spend more by itself, which needs the admin's yes
 * (`confirmSpend`): turning it on, or raising the reproductions per day while it is on. Mirrors `ahoy-hosted`'s
 * `reproductionSpendsMore`.
 */
export function reproductionSpendsMore(
  was: ReproductionSpend,
  now: ReproductionSpend
): boolean {
  if (!now.reproduceOn) return false;
  return (
    !was.reproduceOn || now.maxReproductionsPerDay > was.maxReproductionsPerDay
  );
}

/** What a mode does with the verdict, in a few words: for the select and the read-only list. */
export function reproduceModeLabel(mode: 'advisory' | 'required'): string {
  return mode === 'required'
    ? 'Required: Ahoy starts only what it reproduced'
    : 'Advisory: the verdict is shown, starts go on as before';
}

/** The most priorities the settings keep, as the contract says. */
export const MAX_PRIORITIES = 20;

/** The side navigation's word for the section: "Watching" or "Off". */
export function defectsStateLabel(settings: DefectChoice): {
  readonly label: string;
  readonly off: boolean;
} {
  if (!settings.watchOn) return { label: 'Off', off: true };
  return settings.autoStart === true
    ? { label: 'Fixing', off: false }
    : { label: 'Watching', off: false };
}

/** The priorities as typed, comma-separated: each trimmed, each once (case ignored), or why they are refused. */
export function prioritiesOf(
  typed: string
): { readonly value: readonly string[] } | { readonly problem: string } {
  const names = typed
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (names.length > MAX_PRIORITIES)
    return { problem: `Name at most ${MAX_PRIORITIES} priorities.` };
  if (names.some((p) => p.length > 60))
    return { problem: 'A priority is at most 60 characters.' };
  const lower = names.map((p) => p.toLowerCase());
  if (new Set(lower).size !== lower.length)
    return { problem: 'Name each priority once.' };
  return { value: names };
}

/** The priorities as the form shows them: "Highest, High". */
export function prioritiesText(priorities: readonly string[]): string {
  return priorities.join(', ');
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  watchOn: 'Watch',
  defectsJql: 'Query',
  priorities: 'Priorities',
  autoStart: 'Automatic starts',
  budgetNanoAiu: 'AIU cap per defect',
  maxStartsPerDay: 'Starts per day',
  maxActive: 'Open voyages',
  startAs: 'Start as',
  reproduceOn: 'Reproduction',
  reproduceMode: 'Reproduction mode',
  reproduceEnvironmentId: 'Reproduction environment',
  maxReproductionsPerDay: 'Reproductions per day',
  reproduceAllowedHosts: 'Allowed hosts',
  evidenceDays: 'Days screenshots and recordings are kept',
  // Kept so the history still names a change the component map once made.
  components: 'Components',
};

/** A field's new value in words, for the history. */
function toWords(field: string, value: unknown): string {
  if (field === 'watchOn' || field === 'autoStart' || field === 'reproduceOn')
    return value === true ? 'on' : 'off';
  if (field === 'reproduceMode')
    return value === 'required' ? 'required' : 'advisory';
  if (field === 'reproduceEnvironmentId')
    return typeof value === 'string' ? 'changed' : 'none';
  if (field === 'budgetNanoAiu')
    return typeof value === 'number' ? aiuLabel(value) : 'none';
  if (field === 'reproduceAllowedHosts')
    return Array.isArray(value) && value.length > 0
      ? value.filter((h) => typeof h === 'string').join(', ')
      : 'none';
  if (
    field === 'maxStartsPerDay' ||
    field === 'maxActive' ||
    field === 'maxReproductionsPerDay' ||
    field === 'evidenceDays'
  )
    return typeof value === 'number' ? String(value) : '?';
  if (field === 'startAs') return typeof value === 'string' ? value : 'nobody';
  if (field === 'defectsJql')
    return typeof value === 'string' ? 'changed' : 'removed';
  if (Array.isArray(value))
    return value.length === 0 ? 'none' : String(value.length);
  return '?';
}

/** What one Defects entry of the settings history says happened, or undefined for another section's. */
export function describeDefectEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'defect_settings.updated') return undefined;
  const p = isRecord(payload) ? payload : {};
  const changes = p['changes'];
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([field, change]) =>
        isRecord(change)
          ? [`${FIELD_NAMES[field] ?? field}: ${toWords(field, change['to'])}`]
          : []
      )
    : [];
  return words.length === 0 ? 'Saved the defect settings' : words.join('; ');
}
