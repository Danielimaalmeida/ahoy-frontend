/**
 * Branch releases in words (`ahoy-hosted` design §4 "Branch releases", §5 "Team settings"): a repository's
 * `workflow_dispatch` workflow that builds a pull request branch's test image and deploys it to TEST, its inputs as a
 * person types them, where a release is, the state the side navigation shows, and what one entry of the section's
 * history says. Pure.
 */

import { isRecord } from './records';

/** A `workflow_dispatch` input's name, as GitHub accepts one (and the API checks). */
const INPUT_NAME = /^[A-Za-z_][\w-]{0,99}$/;
/** A workflow file of `.github/workflows/`, by name. */
const WORKFLOW_FILE = /^[A-Za-z\d][\w.-]{0,99}\.ya?ml$/;
/** GitHub takes at most 25 inputs. */
export const MAX_RELEASE_INPUTS = 25;
/** The longest value the API keeps. */
export const MAX_RELEASE_INPUT_VALUE = 500;

/** Where a release is, as the API names it. */
export type ReleaseStatus = 'queued' | 'dispatched' | 'failed';

/** What a release's status says, in words. */
export function releaseStatusLabel(status: ReleaseStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'dispatched':
      return 'Started on GitHub';
    case 'failed':
      return 'Refused by GitHub';
  }
}

/** The side navigation's word for the section: how many repositories have a workflow, or that none can start. */
export function branchReleasesStateLabel(
  repositories: number,
  dispatchable: boolean
): { readonly label: string; readonly off: boolean } {
  if (repositories === 0) return { label: 'None', off: true };
  if (!dispatchable) return { label: 'Cannot start', off: true };
  return {
    label: repositories === 1 ? '1 repository' : `${repositories} repositories`,
    off: false,
  };
}

/** The inputs as a person edits them: one `name=value` per line, by name. */
export function inputsText(inputs: Readonly<Record<string, string>>): string {
  return Object.keys(inputs)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => `${name}=${inputs[name] ?? ''}`)
    .join('\n');
}

/** "environment=test · update-ops-tag=true", or "no inputs". */
export function inputsSummary(
  inputs: Readonly<Record<string, string>>
): string {
  const text = inputsText(inputs);
  return text === '' ? 'no inputs' : text.split('\n').join(' · ');
}

/**
 * The inputs as typed, one `name=value` per line (blank lines are skipped, the value is kept as written, case
 * included), or why they are refused: a line without `=`, a name GitHub does not take, a name twice, too many, or a
 * value too long.
 */
export function inputsOf(
  typed: string
):
  | { readonly inputs: Readonly<Record<string, string>> }
  | { readonly problem: string } {
  const inputs: Record<string, string> = {};
  let count = 0;
  for (const [index, raw] of typed.split('\n').entries()) {
    const line = raw.trim();
    if (line === '') continue;
    const at = line.indexOf('=');
    const where = `Line ${index + 1}`;
    if (at < 0) return { problem: `${where}: write name=value.` };
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (!INPUT_NAME.test(name))
      return {
        problem: `${where}: “${name}” is not an input name GitHub takes.`,
      };
    if (Object.hasOwn(inputs, name))
      return { problem: `${where}: ${name} is given twice.` };
    if (value.length > MAX_RELEASE_INPUT_VALUE)
      return {
        problem: `${where}: at most ${MAX_RELEASE_INPUT_VALUE} characters.`,
      };
    inputs[name] = value;
    count++;
  }
  if (count > MAX_RELEASE_INPUTS)
    return {
      problem: `A workflow takes at most ${MAX_RELEASE_INPUTS} inputs.`,
    };
  return { inputs };
}

/** The workflow file as typed, without `.github/workflows/`, or undefined when it is not one. */
export function workflowFileOf(typed: string): string | undefined {
  const name = typed.trim().replace(/^\.github\/workflows\//, '');
  return WORKFLOW_FILE.test(name) ? name : undefined;
}

/** The newest release of a repository among a story's releases (newest first), if any. */
export function latestReleaseOf<T extends { readonly repo: string }>(
  releases: readonly T[],
  repo: string
): T | undefined {
  return releases.find((r) => r.repo === repo);
}

/** What one Branch releases entry of the settings history says happened, or undefined for another section's. */
export function describeBranchReleaseEvent(
  type: string,
  payload: unknown
): string | undefined {
  const p = isRecord(payload) ? payload : {};
  const repository =
    typeof p['repository'] === 'string' ? p['repository'] : 'a repository';
  const workflow = typeof p['workflow'] === 'string' ? p['workflow'] : '';
  switch (type) {
    case 'branch_release_repository.created': {
      const inputs = isRecord(p['inputs'])
        ? inputsSummary(stringValues(p['inputs']))
        : 'no inputs';
      return `Gave ${repository} the release workflow ${workflow} (${inputs})`;
    }
    case 'branch_release_repository.updated': {
      const words = changeWords(p['changes']);
      return words === ''
        ? `Saved ${repository}'s release workflow`
        : `Changed ${repository}'s release workflow: ${words}`;
    }
    case 'branch_release_repository.deleted':
      return `Took ${repository}'s release workflow away`;
    default:
      return undefined;
  }
}

function stringValues(
  value: Readonly<Record<string, unknown>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value))
    if (typeof v === 'string') out[k] = v;
  return out;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? value : 'none';

/** "workflow: a.yaml → b.yaml; environment: TEST → INT". */
function changeWords(changes: unknown): string {
  if (!isRecord(changes)) return '';
  const words: string[] = [];
  const workflow = changes['workflow'];
  if (isRecord(workflow))
    words.push(
      `workflow: ${shown(workflow['from'])} → ${shown(workflow['to'])}`
    );
  const inputs = changes['inputs'];
  if (isRecord(inputs))
    for (const [name, change] of Object.entries(inputs))
      if (isRecord(change))
        words.push(
          `${name}: ${shown(change['from'])} → ${shown(change['to'])}`
        );
  return words.join('; ');
}
