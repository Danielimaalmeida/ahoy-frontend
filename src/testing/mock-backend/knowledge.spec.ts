import { isRecord } from './http';
import { ACTOR, call, field, problemCode, testServer } from './spec-helpers';

/** The items of a list answer, as records. */
function items(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body['items']))
    throw new Error('not a list answer');
  return body['items'].filter(isRecord);
}

describe('MockAhoyServer · knowledge reviews of done and halted stories', () => {
  it('proposes rules and lessons for a done story, with one patch of both, once the review succeeds', () => {
    const { server, clock } = testServer();
    const asked = call(server, 'POST', '/stories/PROJ-097/knowledge-reviews', {
      confirmSpend: true,
      notes: ' Look again at the refunds ',
    });
    expect(asked.status).toBe(202);
    expect([
      field(asked, 'status'),
      field(asked, 'notes'),
      field(asked, 'requestedBy'),
      field(asked, 'proposal'),
      field(asked, 'lessons'),
      field(asked, 'patch'),
    ]).toEqual([
      'queued',
      'Look again at the refunds',
      ACTOR,
      null,
      null,
      null,
    ]);
    expect(String(field(asked, 'id'))).toMatch(
      /^proj-097-knowledge-001-[0-9a-f]{4}$/
    );

    clock.advance(3_000);
    const [done] = items(
      call(server, 'GET', '/stories/PROJ-097/knowledge-reviews').body
    );
    expect([done?.['status'], done?.['agent']]).toEqual([
      'succeeded',
      'knowledge-curator',
    ]);
    expect(String(done?.['content'])).toMatch(/^## Rules\n- Added/);
    expect(String(done?.['proposal'])).toMatch(/^# Business context/);
    expect(String(done?.['lessons'])).toMatch(
      /## All repositories\n- \(PROJ-097\) Simulated lesson/
    );
    expect(String(done?.['patch'])).toMatch(
      /^diff --git a\/knowledge\/business-context\.md[\s\S]*diff --git a\/knowledge\/lessons\.md/
    );
  });

  it('proposes lessons only for a halted story, and leaves the story as it was', () => {
    const { server, clock } = testServer();
    const before = call(server, 'GET', '/stories/PROJ-118').body;
    call(server, 'POST', '/stories/PROJ-118/knowledge-reviews', {
      confirmSpend: true,
    });
    clock.advance(3_000);
    const [done] = items(
      call(server, 'GET', '/stories/PROJ-118/knowledge-reviews').body
    );
    expect(done?.['status']).toBe('succeeded');
    expect(done?.['proposal']).toBeNull();
    expect(String(done?.['content'])).toMatch(
      /a halted story gets lessons only/
    );
    expect(String(done?.['patch'])).not.toMatch(/business-context/);
    expect(String(done?.['patch'])).toMatch(/\+\+\+ b\/knowledge\/lessons\.md/);
    expect(call(server, 'GET', '/stories/PROJ-118').body).toEqual(before);
  });

  it('refuses a story still under way, one that does not exist and a second review in progress, and cancels one', () => {
    const { server } = testServer();
    const running = call(
      server,
      'POST',
      '/stories/PROJ-140/knowledge-reviews',
      {
        confirmSpend: true,
      }
    );
    expect([running.status, problemCode(running)]).toEqual([
      409,
      'invalid_state',
    ]);
    const unknown = call(
      server,
      'POST',
      '/stories/PROJ-999/knowledge-reviews',
      {
        confirmSpend: true,
      }
    );
    expect([unknown.status, problemCode(unknown)]).toEqual([404, 'not_found']);
    call(server, 'POST', '/stories/PROJ-097/knowledge-reviews', {
      confirmSpend: true,
    });
    const again = call(server, 'POST', '/stories/PROJ-097/knowledge-reviews', {
      confirmSpend: true,
    });
    expect(problemCode(again)).toBe('invalid_state');
    const cancelled = call(
      server,
      'POST',
      '/stories/PROJ-097/knowledge-reviews/cancel',
      { reason: 'Asked by mistake' }
    );
    expect([
      cancelled.status,
      field(cancelled, 'status'),
      field(cancelled, 'exitReason'),
      field(cancelled, 'patch'),
    ]).toEqual([
      202,
      'cancelled',
      `cancelled by ${ACTOR}: Asked by mistake`,
      null,
    ]);
  });
});
