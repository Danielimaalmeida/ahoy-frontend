import { SseDecoder, parseSseStream, type SseMessage } from './sse';

/** Decodes text given in pieces. */
function decodeText(pieces: readonly string[]): SseMessage[] {
  const decoder = new SseDecoder();
  const out = pieces.flatMap((piece) => decoder.push(piece));
  return [...out, ...decoder.end()];
}

/** A body that hands over the given chunks, one per read. */
function bodyOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[i++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(chunk);
    },
  });
}

async function collect(
  body: ReadableStream<Uint8Array>
): Promise<SseMessage[]> {
  const out: SseMessage[] = [];
  for await (const message of parseSseStream(body)) out.push(message);
  return out;
}

/** Cuts bytes into two chunks at `at`. */
function cutAt(bytes: Uint8Array, at: number): Uint8Array[] {
  return [bytes.slice(0, at), bytes.slice(at)];
}

const encoder = new TextEncoder();

/** A frame as the API sends one, with multibyte characters (2, 3 and 4 bytes) in the data. */
const FRAME =
  'id: 42\nevent: run.progress\ndata: {"text":"Ação: ver o ficheiro ✓ 🚢 [REDACTED]"}\n\n' +
  ': keepalive\n\n' +
  'id: 43\r\nevent: story.halted\r\ndata: line one\r\ndata: line two\r\n\r\n';

const FRAME_MESSAGES: readonly SseMessage[] = [
  {
    event: 'run.progress',
    data: '{"text":"Ação: ver o ficheiro ✓ 🚢 [REDACTED]"}',
    lastEventId: '42',
  },
  { event: 'story.halted', data: 'line one\nline two', lastEventId: '43' },
];

describe('SseDecoder', () => {
  it('dispatches a message at the blank line, with its id, type and data', () => {
    expect(decodeText(['id: 1\nevent: story.started\ndata: {}\n\n'])).toEqual([
      { event: 'story.started', data: '{}', lastEventId: '1' },
    ]);
  });

  it('joins several data lines with a newline', () => {
    expect(decodeText(['data: a\ndata: b\ndata: c\n\n'])).toEqual([
      { event: 'message', data: 'a\nb\nc', lastEventId: '' },
    ]);
  });

  it('names a message without an event field `message`', () => {
    expect(decodeText(['data: x\n\n'])[0]?.event).toBe('message');
  });

  it('ignores comment lines, such as the keepalive', () => {
    expect(
      decodeText([': keepalive\n\n', ':\n', 'data: x\n: in the middle\n\n'])
    ).toEqual([{ event: 'message', data: 'x', lastEventId: '' }]);
  });

  it('accepts LF, CRLF and CR as line ends, mixed', () => {
    expect(
      decodeText(['data: a\r\n\r\ndata: b\r\rdata: c\n\n']).map((m) => m.data)
    ).toEqual(['a', 'b', 'c']);
  });

  it('removes one space after the colon, and only one', () => {
    expect(
      decodeText(['data:x\n\n', 'data:  y\n\n', 'data:\n\n']).map((m) => m.data)
    ).toEqual(['x', ' y', '']);
  });

  it('reads a field without a colon as a field with an empty value', () => {
    expect(decodeText(['data\ndata\n\n'])).toEqual([
      { event: 'message', data: '\n', lastEventId: '' },
    ]);
  });

  it('ignores unknown fields and retry', () => {
    expect(
      decodeText(['retry: 10\nfoo: bar\nDATA: no\ndata: yes\n\n'])
    ).toEqual([{ event: 'message', data: 'yes', lastEventId: '' }]);
  });

  it('does not dispatch a block without data, but keeps its id for the next message', () => {
    expect(decodeText(['id: 7\nevent: ignored\n\n', 'data: x\n\n'])).toEqual([
      { event: 'message', data: 'x', lastEventId: '7' },
    ]);
  });

  it('carries the last id over to later messages without one', () => {
    expect(
      decodeText(['id: 5\ndata: a\n\ndata: b\n\n']).map((m) => m.lastEventId)
    ).toEqual(['5', '5']);
  });

  it('ignores an id that holds a NUL character', () => {
    expect(
      decodeText(['id: 5\ndata: a\n\nid: 6\u00007\ndata: b\n\n']).map(
        (m) => m.lastEventId
      )
    ).toEqual(['5', '5']);
  });

  it('drops a message the stream ends in the middle of', () => {
    expect(decodeText(['data: whole\n\ndata: cut off\n'])).toEqual([
      { event: 'message', data: 'whole', lastEventId: '' },
    ]);
    expect(decodeText(['data: cut off'])).toEqual([]);
  });

  it('still ends a line on a CR that is the very last character of the stream', () => {
    expect(decodeText(['data: x\n\r'])).toEqual([
      { event: 'message', data: 'x', lastEventId: '' },
    ]);
  });

  it('does not take a CR cut from its LF as two line ends', () => {
    expect(decodeText(['data: a\r', '\ndata: b\r\n\r', '\n'])).toEqual([
      { event: 'message', data: 'a\nb', lastEventId: '' },
    ]);
  });

  it('gives the same messages whatever single position the text is cut at', () => {
    for (let at = 0; at <= FRAME.length; at++) {
      expect(
        decodeText([FRAME.slice(0, at), FRAME.slice(at)]),
        `cut at ${at}`
      ).toEqual(FRAME_MESSAGES);
    }
  });

  it('gives the same messages when the text arrives one character at a time', () => {
    expect(decodeText([...FRAME])).toEqual(FRAME_MESSAGES);
  });
});

describe('parseSseStream', () => {
  const bytes = encoder.encode(FRAME);

  it('reads a whole body', async () => {
    expect(await collect(bodyOf([bytes]))).toEqual(FRAME_MESSAGES);
  });

  it('gives the same messages whatever byte the body is cut at, inside UTF-8 characters too', async () => {
    for (let at = 0; at <= bytes.length; at++) {
      expect(
        await collect(bodyOf(cutAt(bytes, at))),
        `cut at byte ${at}`
      ).toEqual(FRAME_MESSAGES);
    }
  });

  it('gives the same messages when every byte is its own chunk', async () => {
    expect(
      await collect(bodyOf([...bytes].map((b) => Uint8Array.of(b))))
    ).toEqual(FRAME_MESSAGES);
  });

  it('gives the same messages when the body is cut at two places at once', async () => {
    // Every pair of cuts across the first message, which holds the multibyte characters.
    const end = FRAME.indexOf('\n\n') + 2;
    const limit = encoder.encode(FRAME.slice(0, end)).length;
    for (let a = 1; a < limit; a++) {
      for (let b = a + 1; b <= limit; b++) {
        const chunks = [bytes.slice(0, a), bytes.slice(a, b), bytes.slice(b)];
        expect(await collect(bodyOf(chunks)), `cuts at ${a} and ${b}`).toEqual(
          FRAME_MESSAGES
        );
      }
    }
  });

  it('drops a leading byte order mark, even cut in two', async () => {
    const withBom = Uint8Array.of(
      0xef,
      0xbb,
      0xbf,
      ...encoder.encode('data: x\n\n')
    );
    for (let at = 0; at <= 4; at++) {
      expect(await collect(bodyOf(cutAt(withBom, at)))).toEqual([
        { event: 'message', data: 'x', lastEventId: '' },
      ]);
    }
  });

  it('drops a BOM before a field name, so the first field is still read', async () => {
    const withBom = Uint8Array.of(
      0xef,
      0xbb,
      0xbf,
      ...encoder.encode('id: 3\ndata: x\n\n')
    );
    expect(await collect(bodyOf([withBom]))).toEqual([
      { event: 'message', data: 'x', lastEventId: '3' },
    ]);
  });

  it('reads bytes that are not UTF-8 as replacement characters instead of failing', async () => {
    const broken = Uint8Array.of(
      ...encoder.encode('data: a'),
      0xff,
      ...encoder.encode('b\n\n')
    );
    expect(await collect(bodyOf([broken]))).toEqual([
      { event: 'message', data: 'a�b', lastEventId: '' },
    ]);
  });

  it('drops a message cut off by the end of the body, and a multibyte character cut off with it', async () => {
    const cut = encoder.encode('data: whole\n\ndata: 🚢').slice(0, -2);
    expect(await collect(bodyOf([cut]))).toEqual([
      { event: 'message', data: 'whole', lastEventId: '' },
    ]);
  });

  it('yields a message as soon as its blank line arrives, before the body ends', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const messages = parseSseStream(body);
    controller!.enqueue(encoder.encode('data: first\n\n'));
    const first = await messages.next();
    expect(first.value).toEqual({
      event: 'message',
      data: 'first',
      lastEventId: '',
    });
    controller!.close();
    expect((await messages.next()).done).toBe(true);
  });

  it('rejects when the body breaks (the connection dropped)', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulls++ === 0) c.enqueue(encoder.encode('data: before\n\n'));
        else c.error(new TypeError('network error'));
      },
    });
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const message of parseSseStream(body))
          seen.push(message.data);
      })()
    ).rejects.toThrow('network error');
    expect(seen).toEqual(['before']);
  });

  it('cancels the body when the reader stops early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('data: one\n\ndata: two\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const message of parseSseStream(body)) {
      expect(message.data).toBe('one');
      break;
    }
    expect(cancelled).toBe(true);
  });
});
