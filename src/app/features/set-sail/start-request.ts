import type { StartStoryRequest } from '@core/api/types';
import { formatAiu, parseAiu } from '@domain/aiu';
import { MODEL_SLOTS } from '@domain/models';
import type { ModelChoice, ModelSlot } from '@domain/types';
import type { EffortChoice } from '@ui/model-choice/model-choice';

/** The contract's pattern for a story key, and the longest one the form takes. */
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+-[0-9]+$/;
export const KEY_MAX_LENGTH = 40;

/** Why the text of "Jira key" is not a usable key. */
export type KeyProblem = 'empty' | 'too_long' | 'pattern';

/** A typed or pasted key as the form keeps it: trimmed and in capitals. */
export function normalizeKey(text: string): string {
  return text.trim().toUpperCase();
}

/** What is wrong with the key text (as typed, already in capitals), or `null` when it is a Jira key. */
export function keyProblem(text: string): KeyProblem | null {
  const key = text.trim();
  if (key === '') return 'empty';
  if (key.length > KEY_MAX_LENGTH) return 'too_long';
  return JIRA_KEY_PATTERN.test(key) ? null : 'pattern';
}

/** Why the text of "Total budget" is not a usable amount. */
export type BudgetProblem =
  'empty' | 'malformed' | 'decimals' | 'zero' | 'too_large';

const AMOUNT_WITH_DECIMALS = /^\d+\.\d{10,}$/;
const PLAIN_AMOUNT = /^\d+(?:\.\d+)?$/;

/**
 * What is wrong with the budget text, or `null` when it is a positive amount of at most nine decimals. The text is read
 * by `parseAiu`, as integers (F14): `1e3`, `-5`, `25,5` and `.5` are refused, `25.5` is 25 500 000 000 nano-AIU.
 */
export function budgetProblem(text: string): BudgetProblem | null {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  const nano = parseAiu(trimmed);
  if (nano === 0) return 'zero';
  if (nano !== null) return null;
  if (AMOUNT_WITH_DECIMALS.test(trimmed)) return 'decimals';
  return PLAIN_AMOUNT.test(trimmed) ? 'too_large' : 'malformed';
}

/** The budget as integer nano-AIU, or `null` when {@link budgetProblem} finds a problem. */
export function budgetNanoAiu(text: string): number | null {
  return budgetProblem(text) === null ? parseAiu(text) : null;
}

/** The longest title the API takes, in characters (code points). */
export const TITLE_MAX_LENGTH = 500;

/** Why the text of "Title" would be refused. */
export type TitleProblem = 'too_long';

/**
 * What is wrong with the title text, or `null`. The API counts code points (JSON Schema `maxLength`) and the form sends the
 * title trimmed, so that is what is counted: 500 emoji fit, and a trailing space does not count.
 */
export function titleProblem(text: string): TitleProblem | null {
  return Array.from(text.trim()).length > TITLE_MAX_LENGTH ? 'too_long' : null;
}

/** The two controls of one model slot as the form holds them: blank text and `""` mean "the server decides". */
export interface ModelValues {
  readonly model: string;
  readonly effort: EffortChoice;
}

/** What the form holds, as text. */
export interface SetSailValues {
  readonly key: string;
  readonly title: string;
  readonly budget: string;
  readonly models: Readonly<Record<ModelSlot, ModelValues>>;
}

const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MODEL_ID_MAX_LENGTH = 200;

/** Why a typed model id would be refused (the contract's `ModelId`); blank is fine, the server decides. */
export type ModelProblem = 'pattern' | 'too_long';

/** What is wrong with a typed model id, or `null` when it is blank or a well-formed id. */
export function modelProblem(text: string): ModelProblem | null {
  const model = text.trim();
  if (model === '') return null;
  if (model.length > MODEL_ID_MAX_LENGTH) return 'too_long';
  return MODEL_ID_PATTERN.test(model) ? null : 'pattern';
}

/** A slot's choice, or `null` when the user filled in neither the model nor the effort. */
export function chosenModel(values: ModelValues): ModelChoice | null {
  const model = values.model.trim();
  if (model === '' && values.effort === '') return null;
  return {
    ...(model !== '' ? { model } : {}),
    ...(values.effort !== '' ? { reasoningEffort: values.effort } : {}),
  };
}

/** Only the slots the user filled in; `null` when there are none, so the request leaves `models` out. */
function chosenModels(
  models: SetSailValues['models']
): NonNullable<StartStoryRequest['models']> | null {
  const chosen: Partial<Record<ModelSlot, ModelChoice>> = {};
  for (const slot of MODEL_SLOTS) {
    const choice = chosenModel(models[slot]);
    if (choice !== null) chosen[slot] = choice;
  }
  return Object.keys(chosen).length > 0 ? chosen : null;
}

/**
 * The `startStory` body for what the form holds, or `null` when the key, the title, the budget or a model id would be refused. The
 * budget goes through {@link budgetNanoAiu} (never a float); only slots the user filled in go in `models`, and a blank
 * title is left out.
 */
export function buildStartRequest(
  values: SetSailValues
): StartStoryRequest | null {
  const key = normalizeKey(values.key);
  const title = values.title.trim();
  const budget = budgetNanoAiu(values.budget);
  const modelsOk = MODEL_SLOTS.every(
    (slot) => modelProblem(values.models[slot].model) === null
  );
  if (
    keyProblem(key) !== null ||
    budget === null ||
    titleProblem(title) !== null ||
    !modelsOk
  )
    return null;
  const models = chosenModels(values.models);
  return {
    key,
    ...(title !== '' ? { title } : {}),
    budgetNanoAiu: budget,
    ...(models !== null ? { models } : {}),
  };
}

/** Integer nano-AIU as an AIU amount without trailing zeros ("25", "25.5"), for "up to 25 AIU". */
export function describeAiu(nanoAiu: number): string {
  return formatAiu(nanoAiu, 9).replace(/\.?0+$/, '');
}
