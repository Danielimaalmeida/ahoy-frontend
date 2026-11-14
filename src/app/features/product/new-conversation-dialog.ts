import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CONVERSATION_RECIPES, type ConversationRecipe } from '@core/api/types';
import { CONVERSATION_TITLE_MAX, RECIPE_WORDS } from '@domain/conversations';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { conversationErrorView } from './product-errors';
import type { ProductStore } from './product-store';

/** What the New conversation dialog is opened with: the page's store, and the recipe picked on the left, if any. */
export interface NewConversationData {
  readonly store: ProductStore;
  readonly recipe: ConversationRecipe | null;
}

/** The select's value for a conversation without a recipe. */
export const NO_RECIPE = 'none';

/**
 * "New conversation": a title and, optionally, a recipe that says what it is for. Starting one is 0 AIU; nothing is
 * asked yet. Answers the new conversation's id.
 */
@Component({
  selector: 'ah-new-conversation-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      icon="message"
      heading="New conversation"
      confirmLabel="Start"
      busyLabel="Starting…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Pin what the agent should read, then ask. Starting it spends
        nothing.</span
      >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Title" required [errorMessages]="messages">
          <input
            ahInput
            formControlName="title"
            autocomplete="off"
            placeholder="Late fees on invoices"
            [maxlength]="titleMax"
          />
        </ah-field>
        <ah-field label="Recipe" optional [hint]="hint()">
          <select ahInput formControlName="recipe">
            <option [value]="noRecipe">None: ask anything</option>
            @for (r of recipes; track r) {
              <option [value]="r">{{ words[r].label }}</option>
            }
          </select>
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class NewConversationDialog {
  private readonly data = inject<NewConversationData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<string>>(DialogRef);
  private readonly store = this.data.store;

  protected readonly recipes = CONVERSATION_RECIPES;
  protected readonly words = RECIPE_WORDS;
  protected readonly noRecipe = NO_RECIPE;
  protected readonly titleMax = CONVERSATION_TITLE_MAX;
  protected readonly messages: Readonly<Record<string, string>> = {
    required: 'A title is required.',
    maxlength: `At most ${CONVERSATION_TITLE_MAX} characters.`,
  };
  protected readonly busy = this.store.busy;

  protected readonly form = new FormGroup({
    title: new FormControl(
      this.data.recipe === null ? '' : RECIPE_WORDS[this.data.recipe].title,
      {
        nonNullable: true,
        validators: [requiredText, maxTrimmed(CONVERSATION_TITLE_MAX)],
      }
    ),
    recipe: new FormControl<string>(this.data.recipe ?? NO_RECIPE, {
      nonNullable: true,
    }),
  });

  private readonly recipe = signal(this.form.controls.recipe.value);
  protected readonly hint = computed(() => {
    const r = this.chosen(this.recipe());
    return r === null
      ? 'A recipe starts it with a goal and a first question.'
      : RECIPE_WORDS[r].hint;
  });
  private readonly failed = signal(false);
  protected readonly error = computed(() => {
    const error = this.store.commandError();
    return this.failed() && error !== null
      ? conversationErrorView(error)
      : null;
  });

  constructor() {
    this.form.controls.recipe.valueChanges.subscribe((v) => this.recipe.set(v));
  }

  /** Starts the conversation and closes with its id. */
  async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.controls.title.markAsTouched();
    if (this.form.controls.title.invalid) return;
    const value = this.form.getRawValue();
    this.failed.set(false);
    const result = await this.store.create(
      value.title,
      this.chosen(value.recipe)
    );
    if (result.ok) this.ref.close(result.value.id);
    else this.failed.set(true);
  }

  private chosen(value: string): ConversationRecipe | null {
    return CONVERSATION_RECIPES.find((r) => r === value) ?? null;
  }
}
