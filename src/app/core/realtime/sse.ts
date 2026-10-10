/**
 * A Server-Sent Events parser for a body read with `fetch` (F6: no `EventSource`, which cannot send headers). It follows
 * the WHATWG "event stream interpretation" rules: lines end in `\r\n`, `\n` or `\r`; a blank line dispatches; `:` starts a
 * comment; `data:` lines join with `\n`; `id:` sets the last event id, which carries over to later messages; unknown
 * fields and `retry:` are ignored (the client has its own back-off); a message cut off by the end of the stream is
 * dropped.
 */

/** One dispatched message. */
export interface SseMessage {
  /** The `event:` field, `message` when the block had none. */
  readonly event: string;
  /** The `data:` lines, joined with `\n`. */
  readonly data: string;
  /** The last event id when the message was dispatched, from this block or an earlier one; empty when none was set. */
  readonly lastEventId: string;
}

const LF = 10;
const CR = 13;

/**
 * The line and block logic of the parser, over text. Text goes in by pieces of any size, cut anywhere, and messages come
 * out as soon as their blank line has arrived. {@link parseSseStream} feeds it the decoded body.
 */
export class SseDecoder {
  private buffer = '';
  private data: string[] = [];
  private eventType = '';
  private lastEventId = '';

  /** Adds text and returns the messages it completes. */
  push(text: string): SseMessage[] {
    const out: SseMessage[] = [];
    const buffer = this.buffer + text;
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer.charCodeAt(i);
      if (c === LF) {
        this.line(buffer.slice(start, i), out);
        start = i + 1;
      } else if (c === CR) {
        // A CR at the end may be the first half of a CRLF cut in two: wait for the next piece to tell.
        if (i + 1 === buffer.length) break;
        this.line(buffer.slice(start, i), out);
        if (buffer.charCodeAt(i + 1) === LF) i++;
        start = i + 1;
      }
    }
    this.buffer = buffer.slice(start);
    return out;
  }

  /** Ends the stream: a held CR still ends its line, and a message without its blank line is dropped. */
  end(): SseMessage[] {
    const out: SseMessage[] = [];
    if (this.buffer.endsWith('\r')) this.line(this.buffer.slice(0, -1), out);
    this.buffer = '';
    this.data = [];
    this.eventType = '';
    return out;
  }

  private line(line: string, out: SseMessage[]): void {
    if (line === '') {
      this.dispatch(out);
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        this.eventType = value;
        break;
      case 'data':
        this.data.push(value);
        break;
      case 'id':
        if (!value.includes('\0')) this.lastEventId = value;
        break;
      default:
      // `retry` and unknown fields are ignored.
    }
  }

  private dispatch(out: SseMessage[]): void {
    if (this.data.length > 0) {
      out.push({
        event: this.eventType || 'message',
        data: this.data.join('\n'),
        lastEventId: this.lastEventId,
      });
    }
    this.data = [];
    this.eventType = '';
  }
}

/**
 * Reads an event-stream body and yields its messages as they complete. Bytes are decoded as UTF-8 across chunk
 * boundaries, so a chunk that cuts a character in two is fine, and a leading BOM is dropped. A read error (the
 * connection dropped) rejects the iteration. Stopping the iteration early cancels the body.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseMessage, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const sse = new SseDecoder();
  let finished = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      yield* sse.push(decoder.decode(chunk.value, { stream: true }));
    }
    finished = true;
    yield* sse.push(decoder.decode());
    yield* sse.end();
  } finally {
    if (!finished) {
      // Early return or a read error: let go of the connection. A cancel that fails has nothing left to tell.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
