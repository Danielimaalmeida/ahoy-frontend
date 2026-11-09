import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  Conversation,
  ConversationContextKind,
  ConversationRecipe,
  ConversationSummary,
} from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import { CONVERSATION_POLL_MS, needsPolling } from '@domain/conversations';

/** One item to pin, as the context request takes it. */
export interface PinRef {
  readonly kind: ConversationContextKind;
  readonly ref: string;
}

/**
 * The Product page's conversations: the list on the left and the one open on the right, read again every second while
 * one of its questions waits or is being answered, so the answer shows as the agent writes it. Asking a question may
 * start a session that spends AIU (the person confirms it on the page); everything else here is 0 AIU and calls
 * nothing outside Ahoy.
 */
@Injectable()
export class ProductStore {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);
  /** Counts opens, so an answer for a conversation no longer open is dropped. */
  private generation = 0;
  private timer: Timer | null = null;

  /** Every conversation the person may see: their own and those shared with the team. */
  readonly conversations = signal<readonly ConversationSummary[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  /** Why the list could not be read. */
  readonly loadError = signal<ApiError | null>(null);

  /** The conversation in the address, once read. */
  readonly conversation = signal<Conversation | null>(null);
  /** The id in the address, read or not. */
  readonly openId = signal<string | null>(null);
  /** Why the open conversation could not be read. */
  readonly openError = signal<ApiError | null>(null);

  /** Whether a command is in flight. */
  readonly busy = signal(false);
  /** Why the last command did not go through; cleared by the next one. */
  readonly commandError = signal<ApiError | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  /** Reads the list. */
  async load(): Promise<void> {
    this.loading.set(true);
    const result = await this.api.listConversations();
    this.loading.set(false);
    if (!result.ok) {
      this.loadError.set(result.error);
      return;
    }
    this.loadError.set(null);
    this.loaded.set(true);
    this.conversations.set(result.value.items);
  }

  /** Opens a conversation (none for null), and keeps reading it while a question is open. */
  async open(id: string | null): Promise<void> {
    if (
      id === this.openId() &&
      (this.conversation() !== null || this.timer !== null)
    )
      return;
    this.stopPolling();
    const generation = ++this.generation;
    this.openId.set(id);
    this.openError.set(null);
    this.commandError.set(null);
    if (this.conversation()?.id !== id) this.conversation.set(null);
    if (id === null) return;
    await this.fetch(generation, id);
  }

  /** Reads the open conversation again now. */
  async refresh(): Promise<void> {
    const id = this.openId();
    if (id === null) return;
    this.stopPolling();
    await this.fetch(this.generation, id);
  }

  /** Starts a conversation, the person's own, and answers it; the page then opens it. 0 AIU. */
  async create(
    title: string,
    recipe: ConversationRecipe | null
  ): Promise<ApiResult<Conversation>> {
    const result = await this.command(() =>
      this.api.createConversation({ title: title.trim(), recipe })
    );
    if (result.ok) this.remember(result.value);
    return result;
  }

  /** Asks the open conversation a question; the person has confirmed it may spend up to `cap` (the server's when null). */
  async ask(
    question: string,
    cap: number | null
  ): Promise<ApiResult<Conversation>> {
    return this.change((id) =>
      this.api.askConversation(id, {
        question: question.trim(),
        confirmSpend: true,
        ...(cap !== null ? { budgetNanoAiu: cap } : {}),
      })
    );
  }

  /** Cancels the question waiting or being answered; the session stops and what it spent is kept. */
  cancel(): Promise<ApiResult<Conversation>> {
    return this.change((id) => this.api.cancelConversationTurn(id));
  }

  /** Replaces what the agent reads. 0 AIU; a warm session stops, and the next question starts a new one. */
  pin(items: readonly PinRef[]): Promise<ApiResult<Conversation>> {
    return this.change((id) =>
      this.api.setConversationContext(id, {
        items: items.map((i) => ({ kind: i.kind, ref: i.ref })),
      })
    );
  }

  /** Shares the open conversation with the team (read-only to them), or stops sharing it. */
  share(shared: boolean): Promise<ApiResult<Conversation>> {
    return this.change((id) => this.api.updateConversation(id, { shared }));
  }

  /** Renames the open conversation. */
  rename(title: string): Promise<ApiResult<Conversation>> {
    return this.change((id) =>
      this.api.updateConversation(id, { title: title.trim() })
    );
  }

  /** Deletes the open conversation; its session, if any, is stopped first. */
  async remove(): Promise<ApiResult<null>> {
    const id = this.openId();
    if (id === null)
      throw new Error('No conversation is open: the page offers no command.');
    const result = await this.command(() => this.api.deleteConversation(id));
    if (result.ok) {
      this.stopPolling();
      this.generation++;
      this.conversations.set(this.conversations().filter((c) => c.id !== id));
      this.conversation.set(null);
      this.openId.set(null);
    }
    return result;
  }

  /** Clears the last command's error, for example when a dialog opens. */
  dismissError(): void {
    this.commandError.set(null);
  }

  private async change(
    call: (id: string) => Promise<ApiResult<Conversation>>
  ): Promise<ApiResult<Conversation>> {
    const id = this.openId();
    if (id === null)
      throw new Error('No conversation is open: the page offers no command.');
    const result = await this.command(() => call(id));
    if (result.ok && this.openId() === id) {
      this.stopPolling();
      this.remember(result.value);
      this.conversation.set(result.value);
      this.poll();
    }
    return result;
  }

  private async command<T>(
    call: () => Promise<ApiResult<T>>
  ): Promise<ApiResult<T>> {
    this.busy.set(true);
    this.commandError.set(null);
    const result = await call();
    this.busy.set(false);
    if (!result.ok) this.commandError.set(result.error);
    return result;
  }

  private async fetch(generation: number, id: string): Promise<void> {
    const result = await this.api.getConversation(id);
    if (generation !== this.generation) return;
    if (!result.ok) {
      this.openError.set(result.error);
    } else {
      this.openError.set(null);
      this.conversation.set(result.value);
      this.remember(result.value);
    }
    this.poll();
  }

  /** Reads again in a second while a question is open (and after a read that failed while one was). */
  private poll(): void {
    this.stopPolling();
    const open = this.conversation();
    const id = this.openId();
    if (id === null || open === null || open.id !== id || !needsPolling(open))
      return;
    const generation = this.generation;
    this.timer = this.clock.schedule(CONVERSATION_POLL_MS, () => {
      this.timer = null;
      if (generation === this.generation) void this.fetch(generation, id);
    });
  }

  private stopPolling(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  /** Puts a conversation's summary in the list, first when it is new. */
  private remember(c: Conversation): void {
    const summary: ConversationSummary = {
      id: c.id,
      key: c.key,
      title: c.title,
      recipe: c.recipe,
      owner: c.owner,
      ownerName: c.ownerName,
      shared: c.shared,
      turnCount: c.turnCount,
      lastQuestion: c.lastQuestion,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
    const list = this.conversations();
    this.conversations.set(
      list.some((x) => x.id === c.id)
        ? list.map((x) => (x.id === c.id ? summary : x))
        : [summary, ...list]
    );
  }
}
