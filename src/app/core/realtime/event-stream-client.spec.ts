import type { AhoyEvent } from '@core/api/types';
import type { AuthStrategy } from '@core/auth/auth-strategy';
import { NoAuthStrategy } from '@core/auth/auth-strategy';
import {
  EventStreamClient,
  RECONNECT,
  reconnectDelay,
  type EventStreamQuery,
} from './event-stream-client';
import { FakeClock, settle } from './testing/fake-clock';
import { FakeFetch, problemResponse } from './testing/fake-fetch';
import { anEvent } from './testing/events';

describe('reconnectDelay', () => {
  it('doubles from 1 s and stops at 30 s, without jitter in the middle of the range', () => {
    const middle = () => 0.5;
    expect(
      [0, 1, 2, 3, 4, 5, 6, 10, 100].map((n) => reconnectDelay(n, middle))
    ).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000,
    ]);
  });

  it('spreads each delay by ±20 % and never goes over 30 s', () => {
    expect(reconnectDelay(0, () => 0)).toBe(800);
    expect(reconnectDelay(0, () => 0.999999)).toBe(1_200);
    expect(reconnectDelay(4, () => 0)).toBe(12_800);
    expect(reconnectDelay(4, () => 0.999999)).toBe(19_200);
    expect(reconnectDelay(5, () => 0)).toBe(25_600);
    expect(reconnectDelay(5, () => 0.999999)).toBe(RECONNECT.maxMs);
  });
});

describe('EventStreamClient', () => {
  let clock: FakeClock;
  let net: FakeFetch;
  let received: AhoyEvent[];
  let changes: number;

  function client(
    query: EventStreamQuery = {},
    auth: AuthStrategy = new NoAuthStrategy()
  ): EventStreamClient {
    return new EventStreamClient(
      {
        fetch: net.fetch,
        auth,
        base: '/api/v1',
        clock,
        random: () => 0.5,
        onEvent: (event) => received.push(event),
        onChange: () => changes++,
      },
      query
    );
  }

  beforeEach(() => {
    clock = new FakeClock();
    net = new FakeFetch();
    received = [];
    changes = 0;
  });

  it('is offline until started', () => {
    const stream = client();
    expect(stream.status()).toBe('offline');
    expect(net.requests).toHaveLength(0);
  });

  it('asks for the event stream with Accept and nothing else: no Authorization, no Last-Event-ID', async () => {
    net.stream();
    const stream = client();
    stream.start();
    expect(stream.status()).toBe('connecting');
    await settle();
    expect(net.requests).toHaveLength(1);
    const request = net.last!;
    expect(request.url).toBe('/api/v1/events/stream');
    expect(request.method).toBe('GET');
    expect([...request.headers.keys()]).toEqual(['accept']);
    expect(request.headers.get('Accept')).toBe('text/event-stream');
    expect(request.init.cache).toBe('no-store');
    expect(stream.status()).toBe('live');
    stream.stop();
  });

  it('adds the headers of the AuthStrategy, asked for on every connection', async () => {
    let asked = 0;
    const auth: AuthStrategy = {
      headers: () =>
        Promise.resolve({ Authorization: `Bearer token-${++asked}` }),
    };
    const first = net.stream();
    net.stream();
    const stream = client({}, auth);
    stream.start();
    await settle();
    expect(net.last!.headers.get('Authorization')).toBe('Bearer token-1');
    first.close();
    await clock.advance(1_000);
    expect(net.requests).toHaveLength(2);
    expect(net.last!.headers.get('Authorization')).toBe('Bearer token-2');
    stream.stop();
  });

  it("asks for one story's events after an id when told to", async () => {
    net.stream();
    const stream = client({ story: 'PROJ-123', after: '41' });
    stream.start();
    await settle();
    expect(net.last!.url).toBe('/api/v1/events/stream?story=PROJ-123&after=41');
    stream.stop();
  });

  it('hands over each event that passes isEvent, in order, unknown types included', async () => {
    const body = net.stream();
    const stream = client();
    stream.start();
    await settle();
    body.sendEvent(anEvent(1, 'story.started'));
    body.sendEvent(anEvent(2, 'something.new'));
    body.send(': keepalive\n\n');
    await settle();
    expect(received.map((e) => [e.id, e.type])).toEqual([
      ['1', 'story.started'],
      ['2', 'something.new'],
    ]);
    expect(stream.lastEventId()).toBe('2');
    stream.stop();
  });

  it('skips data that is not JSON or not an event, and keeps reading', async () => {
    const body = net.stream();
    const stream = client();
    stream.start();
    await settle();
    body.send('id: 1\ndata: not json\n\n');
    body.send(
      `id: 2\ndata: ${JSON.stringify({ ...anEvent(2, 'story.started'), storyKey: 'not a key' })}\n\n`
    );
    body.send(`id: 3\ndata: ${JSON.stringify({ id: '3' })}\n\n`);
    body.sendEvent(anEvent(4, 'story.halted'));
    await settle();
    expect(received.map((e) => e.id)).toEqual(['4']);
    expect(stream.status()).toBe('live');
    stream.stop();
  });

  it('reconnects after a drop with Last-Event-ID, and without the first after', async () => {
    const first = net.stream();
    const second = net.stream();
    const stream = client({ after: '10' });
    stream.start();
    await settle();
    first.sendEvent(anEvent(11, 'run.queued'));
    first.sendEvent(anEvent(12, 'run.dispatched'));
    await settle();
    first.fail();
    await settle();
    expect(stream.status()).toBe('reconnecting');
    expect(clock.delays).toEqual([1_000]);
    await clock.advance(1_000);
    expect(net.requests).toHaveLength(2);
    expect(net.last!.url).toBe('/api/v1/events/stream');
    expect(net.last!.headers.get('Last-Event-ID')).toBe('12');
    expect(stream.status()).toBe('live');
    second.sendEvent(anEvent(13, 'run.finished'));
    await settle();
    expect(received.map((e) => e.id)).toEqual(['11', '12', '13']);
    stream.stop();
  });

  it('takes the id of the event when the frame has no id field', async () => {
    const body = net.stream();
    const stream = client();
    stream.start();
    await settle();
    body.send(`data: ${JSON.stringify(anEvent(77, 'story.started'))}\n\n`);
    await settle();
    expect(stream.lastEventId()).toBe('77');
    stream.stop();
  });

  it('never sends back an id that is not a decimal event id', async () => {
    const first = net.stream();
    net.stream();
    const stream = client();
    stream.start();
    await settle();
    first.send('id: 5\ndata: x\n\nid: abc\ndata: y\n\n');
    first.close();
    await clock.advance(1_000);
    expect(net.last!.headers.get('Last-Event-ID')).toBe('5');
    stream.stop();
  });

  it.each([401, 403, 400, 404, 429])(
    'ends offline on a %i and never asks again',
    async (status) => {
      net.answer(
        problemResponse(
          status,
          status === 401 ? 'unauthenticated' : 'bad_request'
        )
      );
      const stream = client();
      stream.start();
      await settle();
      expect(stream.status()).toBe('offline');
      expect(stream.refusedWith()).toBe(status);
      expect(stream.degraded()).toBe(false);
      expect(clock.pending).toBe(0);
      await clock.advance(10 * 60_000);
      expect(net.requests).toHaveLength(1);
    }
  );

  it('retries a 5xx with a growing delay', async () => {
    net.answer(
      problemResponse(503, 'unavailable'),
      problemResponse(500, 'internal_error'),
      problemResponse(502, 'x')
    );
    const stream = client();
    stream.start();
    await settle();
    expect(stream.status()).toBe('reconnecting');
    expect(clock.delays).toEqual([1_000]);
    await clock.advance(1_000);
    expect(net.requests).toHaveLength(2);
    expect(clock.delays).toEqual([2_000]);
    await clock.advance(1_999);
    expect(net.requests).toHaveLength(2);
    await clock.advance(1);
    expect(net.requests).toHaveLength(3);
    expect(clock.delays).toEqual([4_000]);
    stream.stop();
  });

  it('retries a network error, an HTML page with a 200 and an AuthStrategy that fails', async () => {
    let authFails = false;
    const auth: AuthStrategy = {
      headers: () =>
        authFails
          ? Promise.reject(new Error('token refresh failed'))
          : Promise.resolve({}),
    };
    net.answer(new TypeError('Failed to fetch'));
    net.answer(
      new Response('<!doctype html><title>Ahoy</title>', {
        headers: { 'Content-Type': 'text/html' },
      })
    );
    const stream = client({}, auth);
    stream.start();
    await settle();
    expect(stream.status()).toBe('reconnecting');
    await clock.advance(1_000);
    expect(net.requests).toHaveLength(2);
    expect(stream.status()).toBe('reconnecting');
    authFails = true;
    await clock.advance(2_000);
    expect(net.requests).toHaveLength(2);
    expect(stream.status()).toBe('reconnecting');
    stream.stop();
  });

  it('becomes degraded after three failures within 60 s, and recovers when live again', async () => {
    net.answer(new TypeError('down'), new TypeError('down'));
    const stream = client();
    stream.start();
    await settle();
    await clock.advance(1_000);
    expect(stream.degraded()).toBe(false);
    net.answer(new TypeError('down'));
    await clock.advance(2_000);
    expect(net.requests).toHaveLength(3);
    expect(stream.degraded()).toBe(true);
    expect(stream.status()).toBe('reconnecting');
    net.stream();
    await clock.advance(4_000);
    expect(stream.status()).toBe('live');
    expect(stream.degraded()).toBe(false);
    stream.stop();
  });

  it('does not count failures older than 60 s towards degraded', async () => {
    // Failures at 0 s, 30 s and 61 s; each connection in between stays up 29 s, short of stable.
    net.answer(new TypeError('down'));
    const stream = client();
    stream.start();
    await settle();
    const first = net.stream();
    await clock.advance(1_000);
    await clock.advance(29_000);
    first.fail();
    await settle();
    const second = net.stream();
    await clock.advance(2_000);
    await clock.advance(29_000);
    second.fail();
    await settle();
    expect(stream.degraded()).toBe(false);
    expect(clock.delays).toEqual([4_000]);
    stream.stop();
  });

  it('resets the back-off after 30 s of a stable connection', async () => {
    net.answer(new TypeError('down'), new TypeError('down'));
    const live = net.stream();
    const stream = client();
    stream.start();
    await settle();
    await clock.advance(1_000);
    await clock.advance(2_000);
    expect(stream.status()).toBe('live');
    await clock.advance(RECONNECT.stableMs);
    live.fail();
    await settle();
    expect(clock.delays).toEqual([1_000]);
    expect(stream.degraded()).toBe(false);
    stream.stop();
  });

  it('keeps growing the back-off when connections keep dropping before they are stable', async () => {
    const first = net.stream();
    const stream = client();
    stream.start();
    await settle();
    first.close();
    await settle();
    expect(clock.delays).toEqual([1_000]);
    const second = net.stream();
    await clock.advance(1_000);
    expect(stream.status()).toBe('live');
    await clock.advance(5_000);
    second.close();
    await settle();
    expect(clock.delays).toEqual([2_000]);
    stream.stop();
  });

  it('stops cleanly: aborts the request, cancels the body and every timer, and stays offline', async () => {
    const body = net.stream();
    const stream = client();
    stream.start();
    await settle();
    expect(clock.pending).toBe(1); // the stable-connection timer
    stream.stop();
    await settle();
    expect(stream.status()).toBe('offline');
    expect(net.last!.signal?.aborted).toBe(true);
    expect(clock.pending).toBe(0);
    body.sendEvent(anEvent(1, 'story.started'));
    await clock.advance(10 * 60_000);
    expect(received).toEqual([]);
    expect(net.requests).toHaveLength(1);
  });

  it('stops while waiting to reconnect without connecting again', async () => {
    net.answer(new TypeError('down'));
    const stream = client();
    stream.start();
    await settle();
    expect(clock.pending).toBe(1);
    stream.stop();
    expect(clock.pending).toBe(0);
    await clock.advance(60_000);
    expect(net.requests).toHaveLength(1);
  });

  it('stops while the request hangs, and the late failure does not schedule a retry', async () => {
    const stream = client();
    stream.start();
    await settle();
    expect(net.requests).toHaveLength(1);
    stream.stop();
    await settle();
    expect(clock.pending).toBe(0);
    expect(stream.status()).toBe('offline');
  });

  it('can be started again after a stop, resuming from the last id', async () => {
    const first = net.stream();
    const stream = client();
    stream.start();
    await settle();
    first.sendEvent(anEvent(9, 'story.started'));
    await settle();
    stream.stop();
    net.stream();
    stream.start();
    await settle();
    expect(net.last!.headers.get('Last-Event-ID')).toBe('9');
    expect(stream.status()).toBe('live');
    stream.stop();
  });

  it('ignores start while already open', async () => {
    net.stream();
    const stream = client();
    stream.start();
    stream.start();
    await settle();
    expect(net.requests).toHaveLength(1);
    stream.stop();
  });

  it('tells its owner when the status or degraded changes', async () => {
    net.stream();
    const stream = client();
    stream.start();
    await settle();
    stream.stop();
    // connecting, live, offline
    expect(changes).toBe(3);
  });
});
