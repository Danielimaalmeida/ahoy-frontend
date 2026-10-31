/**
 * Team settings in words: what one entry of the settings history says happened, and how a token is shown. Pure: the
 * payloads come from the API as `unknown` and are read field by field.
 */

import { describeAgentEvent } from './agent-settings';
import { describeFigmaEvent } from './figma-settings';
import { describeJiraEvent } from './jira-settings';
import { describeTeamsEvent } from './teams-settings';

/** One change of a field, as the API records it: `{ from, to }`. */
interface FieldChange {
  readonly from: unknown;
  readonly to: unknown;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldChange(value: unknown): value is FieldChange {
  return isRecord(value) && 'from' in value && 'to' in value;
}

/** A text field of a payload, or `fallback` when it is missing or not text. */
function textOf(
  payload: Readonly<Record<string, unknown>>,
  key: string,
  fallback = ''
): string {
  const value = payload[key];
  return typeof value === 'string' ? value : fallback;
}

/** How a token is shown: four dots, then its last four characters when the API kept them (a long enough token). */
export function tokenLabel(hint: string): string {
  return `••••${hint}`;
}

/** A project key in words: the key, or how the reconciler finds it when the row sets none. */
export function projectKeyLabel(key: string | null): string {
  return key ?? 'found by the reconciler';
}

/** One value of a change in words. */
function valueLabel(field: string, value: unknown): string {
  if (field === 'tokenHint')
    return typeof value === 'string' ? tokenLabel(value) : 'set';
  if (field === 'isDefault') return value === true ? 'yes' : 'no';
  if (field === 'projectKey')
    return projectKeyLabel(typeof value === 'string' ? value : null);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The words of each field a change can name. */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  name: 'name',
  hostUrl: 'host',
  tokenHint: 'token',
  isDefault: 'default',
  server: 'server',
  projectKey: 'project key',
};

/** The changes of an `updated` entry, such as "host https://a → https://b, token …cdef → …9999". */
function changesLabel(payload: Readonly<Record<string, unknown>>): string {
  const changes = payload['changes'];
  if (!isRecord(changes)) return '';
  return Object.entries(changes)
    .filter((entry): entry is [string, FieldChange] => isFieldChange(entry[1]))
    .map(([field, change]) => {
      const words = FIELD_WORDS[field] ?? field;
      return `${words} ${valueLabel(field, change.from)} → ${valueLabel(field, change.to)}`;
    })
    .join(', ');
}

/**
 * What one entry of the settings history says happened, without who or when: "Added SonarQube server Main
 * (https://sonar.example.com), token …cdef". An entry of a type this page does not know reads as its type.
 */
export function describeSettingsEvent(type: string, payload: unknown): string {
  const p = isRecord(payload) ? payload : {};
  const name = textOf(p, 'name', 'a server');
  const repository = textOf(p, 'repository', 'a repository');
  switch (type) {
    case 'sonar_server.created': {
      const isDefault = p['isDefault'] === true ? ', the default' : '';
      return `Added SonarQube server ${name} (${textOf(p, 'hostUrl')})${isDefault}, token ${valueLabel('tokenHint', p['tokenHint'])}`;
    }
    case 'sonar_server.updated': {
      const changes = changesLabel(p);
      return changes === ''
        ? `Saved SonarQube server ${name}`
        : `Changed SonarQube server ${name}: ${changes}`;
    }
    case 'sonar_server.deleted':
      return `Removed SonarQube server ${name}`;
    case 'sonar_repository.created': {
      const key =
        typeof p['projectKey'] === 'string'
          ? `, project key ${p['projectKey']}`
          : '';
      return `Put ${repository} on ${textOf(p, 'server', 'a server')}${key}`;
    }
    case 'sonar_repository.updated': {
      const changes = changesLabel(p);
      return changes === ''
        ? `Saved ${repository}`
        : `Changed ${repository}: ${changes}`;
    }
    case 'sonar_repository.deleted':
      return `Took ${repository} off its server`;
    default:
      return (
        describeJiraEvent(type, payload) ??
        describeTeamsEvent(type, payload) ??
        describeFigmaEvent(type, payload) ??
        describeAgentEvent(type, payload) ??
        type
      );
  }
}
