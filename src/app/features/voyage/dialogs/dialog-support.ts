import { computed, signal } from '@angular/core';
import { fieldMessage } from '@core/api/api-error';
import { commandErrorView } from '@core/commands/command-error';
import type { CommandOutcome } from '@core/commands/command-runner';
import type { VoyageContext } from '../context/voyage-context';

/** The longest reason the API takes for stop, resume and budget (`maxLength: 2000`). */
export const REASON_MAX = 2000;

/** What a voyage dialog is opened with: the page's context, which holds the story and runs the command. */
export interface VoyageDialogData {
  readonly context: VoyageContext;
}

/** The messages of a reason field. */
export const REASON_MESSAGES: Readonly<Record<string, string>> = {
  required: 'A reason is required.',
  maxlength: `At most ${REASON_MAX} characters.`,
};

/**
 * The server's message for one field of the request, from a `400 validation_failed` (`errors[].path` such as
 * `body/reason` or `/budgetNanoAiu`); "" when there is none.
 */
export function serverFieldError(
  outcome: CommandOutcome<unknown> | null,
  field: string
): string {
  return fieldMessage(outcome?.kind === 'other' ? outcome.error : null, field);
}

/**
 * The last outcome of a dialog's command and what the dialog shows for it: the banner (`error`) and the server's
 * message per field. The form and its text are the dialog's own and never touched here.
 */
export class CommandState<T> {
  private readonly last = signal<CommandOutcome<T> | null>(null);

  /** The banner for the last outcome: the stale notice, a conflict or an error; null before and after success. */
  readonly error = computed(() => {
    const outcome = this.last();
    return outcome === null ? null : commandErrorView(outcome);
  });

  /** The server's message for one field of the request (read it inside a `computed`). */
  fieldError(field: string): string {
    return serverFieldError(this.last(), field);
  }

  /** Records what a command came to and returns its value on success, else null (a skipped command changes nothing). */
  settle(outcome: CommandOutcome<T>): T | null {
    if (outcome.kind === 'skipped') return null;
    this.last.set(outcome);
    return outcome.kind === 'ok' ? outcome.value : null;
  }
}
