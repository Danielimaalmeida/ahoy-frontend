import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { API_BASE, trimBase } from '@core/api/api-base';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  Conversation,
  ConversationContextKind,
  ConversationRecipe,
  ConversationSummary,
} from '@core/api/types';
import { AUTH_STRATEGY } from '@core/auth/auth-strategy';
import { CLOCK, type Timer } from '@core/realtime/clock';
import { ConversationStream } from '@core/realtime/conversation-stream';
import { FETCH } from '@core/realtime/fetch';
import { CONVERSATION_POLL_MS, needsPolling } from '@domain/conversations';

/** One item to pin, as the context request takes it. */
export interface PinRef {
  readonly kind: ConversationContextKind;
  readonly ref: string;
}

/**
 * The Product page's conversations: the list on the left and the one open on the right, followed while one of its
 * questions waits or is being answered, so the answer shows as the agent writes it: from the conversation's event
 * stream, or, when the stream cannot be opened or breaks, by reading it again every second. Asking a question may
 * start a session that spends AIU (the person confirms it on the page); everything else here is 0 AIU and calls
 * nothing outside Ahoy.
 */
@Injectable()
export class ProductStore {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);
  private readonly fetchFn = inject(FETCH);
  private readonly auth = inject(AUTH_STRATEGY);
  private readonly base = trimBase(inject(API_BASE));
  /** Counts opens, so an answer for a conversation no longer open is dropped. */
  private generation = 0;
  private timer: Timer | null = null;
  private stream: ConversationStream | null = null;
  /** Set when the open conversation's stream failed: it is polled until the next question or conversation. */
  private streamFailed = false;

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
    inject(DestroyRef).onDestroy(() => this.stopFollowing());
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
    this.stopFollowing();
    this.streamFailed = false;
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
    this.stopFollowing();
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
    // A new question tries the stream again, even if it failed for the last one.
    this.streamFailed = false;
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
      this.stopFollowing();
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
      this.stopFollowing();
      this.remember(result.value);
      this.conversation.set(result.value);
      this.follow();
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
    this.follow();
  }

  /**
   * While a question is open (or after a read that failed while one was): follows the conversation on its stream, or,
   * once the stream has failed for this question, reads it again in a second. Stops following when no question is open.
   */
  private follow(): void {
    const open = this.conversation();
    const id = this.openId();
    if (id === null || open === null || open.id !== id || !needsPolling(open)) {
      this.stopFollowing();
      return;
    }
    if (!this.streamFailed) {
      this.stopPolling();
      if (this.stream === null) this.stream = this.openStream(id);
      return;
    }
    this.stopFollowing();
    const generation = this.generation;
    this.timer = this.clock.schedule(CONVERSATION_POLL_MS, () => {
      this.timer = null;
      if (generation === this.generation) void this.fetch(generation, id);
    });
  }

  private openStream(id: string): ConversationStream {
    const generation = this.generation;
    const stream = new ConversationStream(
      {
        fetch: this.fetchFn,
        auth: this.auth,
        base: this.base,
        onConversation: (c) => {
          if (generation !== this.generation || this.openId() !== c.id) return;
          this.conversation.set(c);
          this.remember(c);
          if (!needsPolling(c)) this.stopFollowing();
        },
        onEnd: () => {
          if (this.stream !== stream) return;
          this.stream = null;
          if (generation !== this.generation) return;
          // Read it once now, then every second until the question ends.
          this.streamFailed = true;
          void this.fetch(generation, id);
        },
      },
      id
    );
    stream.start();
    return stream;
  }

  private stopPolling(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  private stopFollowing(): void {
    this.stopPolling();
    this.stream?.stop();
    this.stream = null;
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
