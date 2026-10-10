import type {
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import {
  budgetProblem,
  keyProblem,
  modelProblem,
  titleProblem,
  type BudgetProblem,
  type KeyProblem,
  type ModelProblem,
} from './start-request';

/** What the field says for each way the key can be wrong. */
export const KEY_MESSAGES: Readonly<Record<KeyProblem, string>> = {
  empty: 'Enter the Jira key of the story.',
  too_long: 'A Jira key is at most 40 characters.',
  pattern:
    'Use a Jira key such as PROJ-123: capital letters or digits, a dash and a number.',
};

/** What the field says for each way the budget can be wrong. */
export const BUDGET_MESSAGES: Readonly<Record<BudgetProblem, string>> = {
  empty: 'Enter the most this voyage may spend, in AIU.',
  zero: 'The budget must be more than 0 AIU.',
  malformed: 'Type the amount as plain digits, such as 25 or 25.5.',
  decimals: 'Use at most 9 decimal places.',
  too_large: 'That amount is too large.',
};

/** What the field says when the title is too long. */
export const TITLE_MESSAGE = 'A title is at most 500 characters.';

/** What the model row says for each way the model id can be wrong. */
export const MODEL_MESSAGES: Readonly<Record<ModelProblem, string>> = {
  pattern:
    'A model id has letters, digits and . _ : / - only, and starts with a letter or digit.',
  too_long: 'A model id is at most 200 characters.',
};

/** Keeps the control's value as text; any other value reads as blank. */
function textOf(control: AbstractControl): string {
  const value: unknown = control.value;
  return typeof value === 'string' ? value : '';
}

/** `{ key: message }` while the Jira key is not one. */
export const keyValidator: ValidatorFn = (control): ValidationErrors | null => {
  const problem = keyProblem(textOf(control));
  return problem === null ? null : { key: KEY_MESSAGES[problem] };
};

/** `{ budget: message }` while the budget text is not a positive amount of at most nine decimals. */
export const budgetValidator: ValidatorFn = (
  control
): ValidationErrors | null => {
  const problem = budgetProblem(textOf(control));
  return problem === null ? null : { budget: BUDGET_MESSAGES[problem] };
};

/** `{ model: message }` while a typed model id would be refused. */
export const modelValidator: ValidatorFn = (
  control
): ValidationErrors | null => {
  const problem = modelProblem(textOf(control));
  return problem === null ? null : { model: MODEL_MESSAGES[problem] };
};

/** `{ title: message }` while the title is longer than the API takes. */
export const titleValidator: ValidatorFn = (
  control
): ValidationErrors | null =>
  titleProblem(textOf(control)) === null ? null : { title: TITLE_MESSAGE };
