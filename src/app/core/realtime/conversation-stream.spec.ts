import type { Conversation } from '@core/api/types';
import type { AuthStrategy } from '@core/auth/auth-strategy';
import { NoAuthStrategy } from '@core/auth/auth-strategy';
import getConversation from '@testing/fixtures/getConversation.json';
import {
  ConversationStream,
  type ConversationStreamEnd,
} from './conversation-stream';
import { settle } from './testing/fake-clock';
import { FakeFetch, problemResponse } from './testing/fake-fetch';

const frame = (data: unknown, event = 'conversation'): string =>
  `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

describe('ConversationStream', () => {
  let net: FakeFetch;
  let received: Conversation[];
  let ends: ConversationStreamEnd[];

  function stream(
    id = getConversation.id,
    auth: AuthStrategy = new NoAuthStrategy()
  ): ConversationStream {
    return new ConversationStream(
      {
        fetch: net.fetch,
        auth,
        base: '/api/v1',
        onConversation: (c) => received.push(c),
        onEnd: (why) => ends.push(why),
      },
      id
    );
  }

  beforeEach(() => {
    net = new FakeFetch();
    received = [];
    ends = [];
  });

  it('asks for the conversation stream with Accept and the sign-in headers, uncached', async () => {
    net.stream();
    const auth: AuthStrategy = {
      headers: () => Promise.resolve({ Authorization: 'Bearer test' }),
    };
    const s = stream('conv 1', auth);
    s.start();
    expect(s.open).toBe(true);
    await settle();
    expect(net.requests).toHaveLength(1);
    const request = net.last!;
    expect(request.url).toBe('/api/v1/conversations/conv%201/stream');
    expect(request.method).toBe('GET');
    expect(request.headers.get('Accept')).toBe('text/event-stream');
    expect(request.headers.get('Authorization')).toBe('Bearer test');
    expect(request.init.cache).toBe('no-store');
    s.stop();
  });

  it('hands over each conversation the API sends, as it changes', async () => {
    const body = net.stream();
    const s = stream();
    s.start();
    await settle();
    body.send(frame(getConversation));
    await settle();
    const renamed = { ...getConversation, title: 'Invoices, renamed' };
    body.send(frame(renamed));
    await settle();
    expect(received.map((c) => c.title)).toEqual([
      getConversation.title,
      'Invoices, renamed',
    ]);
    expect(ends).toEqual([]);
    s.stop();
  });

  it('skips other events, comments, data that is not JSON and JSON that is not a conversation', async () => {
    const body = net.stream();
    const s = stream();
    s.start();
    await settle();
    body.send(': keepalive\n\n');
    body.send(frame(getConversation, 'story.updated'));
    body.send(frame('{not json'));
    body.send(frame({ ...getConversation, key: 'PROJ-1' }));
    body.send(frame(getConversation));
    await settle();
    expect(received).toHaveLength(1);
    s.stop();
  });

  it('ends as refused on a 4xx, so the caller reads why', async () => {
    net.answer(problemResponse(404, 'not_found'));
    stream().start();
    await settle();
    expect(ends).toEqual(['refused']);
    expect(received).toEqual([]);
  });

  it('ends as failed on a 5xx, a network error or an answer that is not an event stream', async () => {
    net.answer(problemResponse(503, 'unavailable'));
    net.answer(new TypeError('network error'));
    net.answer(
      new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );
    for (let i = 0; i < 3; i++) {
      stream().start();
      await settle();
    }
    expect(ends).toEqual(['failed', 'failed', 'failed']);
  });

  it('ends as failed when the stream breaks or closes, and does not reconnect', async () => {
    const first = net.stream();
    const s = stream();
    s.start();
    await settle();
    first.fail();
    await settle();
    expect(ends).toEqual(['failed']);
    expect(s.open).toBe(false);

    const second = net.stream();
    s.start();
    await settle();
    second.close();
    await settle();
    expect(ends).toEqual(['failed', 'failed']);
    expect(net.requests).toHaveLength(2);
  });

  it('ends as failed when the sign-in headers cannot be had, without asking', async () => {
    const auth: AuthStrategy = {
      headers: () => Promise.reject(new Error('signed out')),
    };
    stream(getConversation.id, auth).start();
    await settle();
    expect(ends).toEqual(['failed']);
    expect(net.requests).toHaveLength(0);
  });

  it('stops without calling onEnd, aborts the request and hands over nothing more', async () => {
    const body = net.stream();
    const s = stream();
    s.start();
    await settle();
    s.stop();
    expect(s.open).toBe(false);
    expect(net.last!.signal!.aborted).toBe(true);
    body.send(frame(getConversation));
    await settle();
    expect(received).toEqual([]);
    expect(ends).toEqual([]);
  });

  it('opens once however often it is started', async () => {
    net.stream();
    const s = stream();
    s.start();
    s.start();
    await settle();
    expect(net.requests).toHaveLength(1);
    s.stop();
  });
});
