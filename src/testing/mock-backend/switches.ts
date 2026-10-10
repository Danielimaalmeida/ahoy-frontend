/**
 * The interruptors of the mock (plan, lane 2D, deliverable 5), read from wherever the host keeps them: the browser's
 * query string and `localStorage` (`ahoy.mock.<name>`), or the query of `/__mock/switches` on `npm run mock:api`.
 *
 * | Name           | Value                                   | Effect                                                         |
 * | -------------- | --------------------------------------- | -------------------------------------------------------------- |
 * | `latencyMs`    | 0 to 60000                              | every answer waits that long (stays set)                       |
 * | `failNext`     | an HTTP status, 400 to 599              | the next request answers it (502/504: a gateway's HTML page)   |
 * | `conflictNext` | a 409 code, or `1` for `stale_version`  | the next command (POST) answers `409` with that code           |
 * | `dropStream`   | anything                                | open event streams break now; clients resume with Last-Event-ID |
 */
import type { ProblemCode } from '@core/api/types';
import { CONFLICT_CODES, type MockAhoyServer } from './server';

/** The prefix of the switches in `localStorage` and in the browser's query string. */
export const SWITCH_PREFIX = 'ahoy.mock.';

/** The names of the switches. */
export const SWITCH_NAMES = [
  'latencyMs',
  'failNext',
  'conflictNext',
  'dropStream',
] as const;
/** The name of one switch. */
export type SwitchName = (typeof SWITCH_NAMES)[number];

/** The switches that act once and are then forgotten. */
export const ONE_SHOT_SWITCHES: readonly SwitchName[] = [
  'failNext',
  'conflictNext',
  'dropStream',
];

/** Applies the switches `read` gives a value for; returns what it applied, as `name=value`, and what it refused. */
export function applySwitches(
  server: MockAhoyServer,
  read: (name: SwitchName) => string | null
): {
  readonly applied: readonly string[];
  readonly refused: readonly string[];
} {
  const applied: string[] = [];
  const refused: string[] = [];
  for (const name of SWITCH_NAMES) {
    const raw = read(name);
    if (raw === null) continue;
    const value = raw.trim();
    if (apply(server, name, value)) applied.push(`${name}=${value}`);
    else refused.push(`${name}=${value}`);
  }
  return { applied, refused };
}

function apply(
  server: MockAhoyServer,
  name: SwitchName,
  value: string
): boolean {
  switch (name) {
    case 'latencyMs': {
      const ms = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
      if (!(ms >= 0 && ms <= 60_000)) return false;
      server.switches.latencyMs = ms;
      return true;
    }
    case 'failNext': {
      const status = /^\d{3}$/.test(value) ? Number(value) : NaN;
      if (!(status >= 400 && status <= 599)) return false;
      server.switches.failNext = status;
      return true;
    }
    case 'conflictNext': {
      const code = conflictCode(value);
      if (code === null) return false;
      server.switches.conflictNext = code;
      return true;
    }
    case 'dropStream':
      server.dropStreams();
      return true;
  }
}

/** The 409 code a `conflictNext` value names, or null. */
function conflictCode(value: string): ProblemCode | null {
  if (value === '' || value === '1' || value === 'true') return 'stale_version';
  return CONFLICT_CODES.find((code) => code === value) ?? null;
}

/** Something with `localStorage`'s reading and removing (a fake in specs). */
export interface SwitchStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/**
 * Reads the switches from `localStorage` (`ahoy.mock.latencyMs` and so on) and removes the one-shots it applied, so a
 * developer can type `localStorage.setItem("ahoy.mock.failNext", "503")` and see the next request fail.
 */
export function applyStorageSwitches(
  server: MockAhoyServer,
  storage: SwitchStorage | null
): readonly string[] {
  if (storage === null) return [];
  const read = (name: SwitchName): string | null => {
    try {
      const value = storage.getItem(SWITCH_PREFIX + name);
      if (value !== null && ONE_SHOT_SWITCHES.includes(name))
        storage.removeItem(SWITCH_PREFIX + name);
      return value;
    } catch {
      return null; // storage blocked (private window, sandbox)
    }
  };
  return applySwitches(server, read).applied;
}

/** Reads the switches from a query string with the same `ahoy.mock.` names (`?ahoy.mock.latencyMs=300`). */
export function applyQuerySwitches(
  server: MockAhoyServer,
  search: string
): readonly string[] {
  const params = new URLSearchParams(search);
  return applySwitches(server, (name) => params.get(SWITCH_PREFIX + name))
    .applied;
}
