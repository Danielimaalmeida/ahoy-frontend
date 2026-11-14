import { isConversation } from '@core/api/guards';
import type { Conversation } from '@core/api/types';
import type { AuthStrategy } from '@core/auth/auth-strategy';
import { parseSseStream } from './sse';

/** Why a conversation's stream ended without being stopped. */
export type ConversationStreamEnd =
  /** The API refused it (a 4xx: the conversation is gone, or the person may not read it). */
  | 'refused'
  /** It could not be opened, or it broke or closed: the caller reads the conversation another way. */
  | 'failed';

/** What a conversation's stream needs; all of it is injected so that tests run on fakes. */
export interface ConversationStreamDeps {
  readonly fetch: typeof fetch;
  readonly auth: AuthStrategy;
  /** The API base, such as `/api/v1`, without a trailing slash. */
  readonly base: string;
  /** Receives the conversation each time the API sends it: first as it is, then after every change. */
  readonly onConversation: (conversation: Conversation) => void;
  /** Called once when the stream ends by itself; never after `stop`. */
  readonly onEnd: (why: ConversationStreamEnd) => void;
}

/**
 * `GET /conversations/{id}/stream` read with `fetch` and {@link parseSseStream} (F6: no `EventSource`, which cannot send
 * the sign-in headers). The API sends the whole conversation as a `conversation` event when the stream opens and each
 * time it changes, so the answer shows as the agent writes it, without reading the conversation again every second.
 *
 * One connection, no reconnection: when the stream cannot be opened, breaks or closes, {@link ConversationStreamDeps.onEnd}
 * says so and the caller falls back to reading the conversation (the Product page polls). A `data:` that is not JSON or
 * does not pass `isConversation` is skipped. {@link stop} aborts the request.
 */
export class ConversationStream {
  private controller: AbortController | null = null;
  private running = false;

  constructor(
    private readonly deps: ConversationStreamDeps,
    private readonly id: string
  ) {}

  /** Whether the stream is open or opening. */
  get open(): boolean {
    return this.running;
  }

  /** Opens the stream. Does nothing when it is already open or opening. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    void this.connect(controller);
  }

  /** Closes the stream; `onEnd` is not called. */
  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.controller = null;
  }

  private async connect(controller: AbortController): Promise<void> {
    const current = () => this.controller === controller;
    let why: ConversationStreamEnd = 'failed';
    try {
      const auth = await this.deps.auth.headers();
      if (!current()) return;
      const response = await this.deps.fetch(
        `${this.deps.base}/conversations/${encodeURIComponent(this.id)}/stream`,
        {
          method: 'GET',
          headers: { ...auth, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: controller.signal,
        }
      );
      if (!current()) return;
      if (response.status >= 400 && response.status < 500) why = 'refused';
      if (!response.ok || response.body === null || !isEventStream(response)) {
        await response.body?.cancel().catch(() => undefined);
      } else {
        for await (const message of parseSseStream(response.body)) {
          if (!current()) return;
          if (message.event !== 'conversation') continue;
          const conversation = parse(message.data);
          if (conversation !== null) this.deps.onConversation(conversation);
        }
      }
    } catch {
      // A network error, an aborted request or an AuthStrategy that failed: the stream failed.
    }
    if (!current()) return;
    this.running = false;
    this.controller = null;
    this.deps.onEnd(why);
  }
}

/** The conversation a `data:` holds, or null when it is not JSON or not a conversation. */
function parse(data: string): Conversation | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return isConversation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether an answer is an event stream; a dev server's HTML page with a 200 is not. */
function isEventStream(response: Response): boolean {
  const type = response.headers.get('Content-Type') ?? '';
  return type.toLowerCase().startsWith('text/event-stream');
}
