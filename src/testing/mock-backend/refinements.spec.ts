import { isRecord } from './http';
import { ACTOR, call, field, problemCode, testServer } from './spec-helpers';

/** The items of a list answer, as records. */
function items(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body['items']))
    throw new Error('not a list answer');
  return body['items'].filter(isRecord);
}

describe('MockAhoyServer · refinements of backlog items', () => {
  it('queues a refinement, runs it on the clock and keeps its Markdown, newest first per key', () => {
    const { server, clock } = testServer();
    const asked = call(server, 'POST', '/refinements/PROJ-145', {
      confirmSpend: true,
      notes: '  Check the CSV export limits ',
    });
    expect(asked.status).toBe(202);
    expect([
      field(asked, 'status'),
      field(asked, 'notes'),
      field(asked, 'requestedBy'),
      field(asked, 'content'),
      field(asked, 'budgetNanoAiu'),
    ]).toEqual([
      'queued',
      'Check the CSV export limits',
      ACTOR,
      null,
      10_000_000_000,
    ]);

    clock.advance(1_000);
    expect(
      items(call(server, 'GET', '/refinements').body).map((r) => r['status'])
    ).toEqual(['running']);
    clock.advance(2_000);
    const [done] = items(call(server, 'GET', '/refinements/PROJ-145').body);
    expect(done?.['status']).toBe('succeeded');
    expect(String(done?.['content'])).toMatch(
      /^## Verdict\nNEEDS WORK\. A simulated pre-refinement of PROJ-145/
    );
    expect(String(done?.['content'])).toMatch(
      /## Requester's notes\nCheck the CSV export limits$/
    );
    const [summary] = items(call(server, 'GET', '/refinements').body);
    expect(summary && 'content' in summary).toBe(false);

    call(server, 'POST', '/refinements/PROJ-145', { confirmSpend: true });
    expect(
      items(call(server, 'GET', '/refinements/PROJ-145').body).map(
        (r) => r['status']
      )
    ).toEqual(['queued', 'succeeded']);
  });

  it('answers an issue never refined with no items, and refuses a second refinement in progress', () => {
    const { server } = testServer();
    expect(call(server, 'GET', '/refinements/PROJ-999').body).toEqual({
      key: 'PROJ-999',
      items: [],
    });
    call(server, 'POST', '/refinements/PROJ-150', { confirmSpend: true });
    const again = call(server, 'POST', '/refinements/PROJ-150', {
      confirmSpend: true,
    });
    expect([again.status, problemCode(again)]).toEqual([409, 'invalid_state']);
    const unconfirmed = call(server, 'POST', '/refinements/PROJ-151', {});
    expect(problemCode(unconfirmed)).toBe('validation_failed');
  });

  it('takes a limit of up to 20 AIU and refuses more as the contract does', () => {
    const { server } = testServer();
    const atCap = call(server, 'POST', '/refinements/PROJ-153', {
      confirmSpend: true,
      budgetNanoAiu: 20_000_000_000,
    });
    expect([atCap.status, field(atCap, 'budgetNanoAiu')]).toEqual([
      202, 20_000_000_000,
    ]);
    const over = call(server, 'POST', '/refinements/PROJ-154', {
      confirmSpend: true,
      budgetNanoAiu: 20_000_000_001,
    });
    expect([over.status, problemCode(over)]).toEqual([
      400,
      'validation_failed',
    ]);
  });

  it('cancels a queued refinement at once and a running one a moment later, keeping who cancelled', () => {
    const { server, clock } = testServer();
    call(server, 'POST', '/refinements/PROJ-150', { confirmSpend: true });
    const queued = call(server, 'POST', '/refinements/PROJ-150/cancel', {
      reason: 'Wrong story',
    });
    expect([queued.status, field(queued, 'status')]).toEqual([
      202,
      'cancelled',
    ]);
    expect(field(queued, 'exitReason')).toBe(
      `cancelled by ${ACTOR}: Wrong story`
    );

    call(server, 'POST', '/refinements/PROJ-152', { confirmSpend: true });
    clock.advance(1_000);
    const running = call(server, 'POST', '/refinements/PROJ-152/cancel', {
      reason: 'Too slow',
    });
    expect([
      field(running, 'status'),
      field(running, 'cancelRequested'),
    ]).toEqual(['running', true]);
    clock.advance(500);
    const [ended] = items(call(server, 'GET', '/refinements/PROJ-152').body);
    expect([ended?.['status'], ended?.['content']]).toEqual([
      'cancelled',
      null,
    ]);
    const nothing = call(server, 'POST', '/refinements/PROJ-152/cancel', {
      reason: 'Again',
    });
    expect(problemCode(nothing)).toBe('invalid_state');
  });
});

describe('MockAhoyServer · back to intake', () => {
  it("supersedes the plan review's questions, refuses answers to them, and lets the planner ask afresh", () => {
    const { server, clock } = testServer();
    const before = call(server, 'GET', '/stories/PROJ-123');
    const refreshed = call(server, 'POST', '/stories/PROJ-123/refresh-intake', {
      expectedVersion: field(before, 'version'),
      reason: 'Jira now names the export limits',
      confirmSpend: true,
    });
    expect(refreshed.status).toBe(202);
    expect([
      field(refreshed, 'phase'),
      field(refreshed, 'status'),
      field(refreshed, 'spentNanoAiu'),
    ]).toEqual(['intake', 'ready', field(before, 'spentNanoAiu')]);
    const old = items(call(server, 'GET', '/stories/PROJ-123/questions').body);
    expect(old.length).toBeGreaterThan(0);
    expect(old.every((q) => typeof q['supersededAt'] === 'string')).toBe(true);
    const events = items(
      call(server, 'GET', '/stories/PROJ-123/events?limit=500').body
    );
    expect(events.at(-1)?.['type']).toBe('story.intake_refreshed');

    clock.advance(30_000);
    const story = call(server, 'GET', '/stories/PROJ-123');
    expect([field(story, 'phase'), field(story, 'status')]).toEqual([
      'planning',
      'awaiting_input',
    ]);
    const all = items(call(server, 'GET', '/stories/PROJ-123/questions').body);
    const fresh = all.filter((q) => q['supersededAt'] === null);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((q) => !old.some((o) => o['id'] === q['id']))).toBe(
      true
    );
    const answer = call(
      server,
      'POST',
      `/stories/PROJ-123/questions/${String(old[0]?.['id'])}/answer`,
      { answer: 'Too late', expectedVersion: field(story, 'version') }
    );
    expect([answer.status, problemCode(answer)]).toEqual([
      409,
      'invalid_state',
    ]);
  });

  it('refuses a story outside planning and plan review, and a request without spend confirmation', () => {
    const { server } = testServer();
    const running = call(server, 'GET', '/stories/PROJ-140');
    const refused = call(server, 'POST', '/stories/PROJ-140/refresh-intake', {
      expectedVersion: field(running, 'version'),
      reason: 'Not now',
      confirmSpend: true,
    });
    expect([refused.status, problemCode(refused)]).toEqual([
      409,
      'invalid_state',
    ]);
    const unconfirmed = call(
      server,
      'POST',
      '/stories/PROJ-123/refresh-intake',
      {
        expectedVersion: 1,
        reason: 'x',
        confirmSpend: false,
      }
    );
    expect(problemCode(unconfirmed)).toBe('validation_failed');
  });
});

describe('MockAhoyServer · agent diagnoses of halted stories', () => {
  it('queues a diagnosis of a halted voyage, runs it on the clock and keeps its Markdown, leaving the voyage as it was', () => {
    const { server, clock } = testServer();
    const before = call(server, 'GET', '/stories/PROJ-118').body;
    const asked = call(server, 'POST', '/stories/PROJ-118/agent-diagnoses', {
      confirmSpend: true,
      notes: ' Is it the token? ',
    });
    expect(asked.status).toBe(202);
    expect([
      field(asked, 'key'),
      field(asked, 'status'),
      field(asked, 'notes'),
      field(asked, 'requestedBy'),
      field(asked, 'budgetNanoAiu'),
      field(asked, 'content'),
    ]).toEqual([
      'PROJ-118',
      'queued',
      'Is it the token?',
      ACTOR,
      10_000_000_000,
      null,
    ]);
    expect(String(field(asked, 'id'))).toMatch(
      /^proj-118-diagnosis-001-[0-9a-f]{4}$/
    );

    clock.advance(3_000);
    const [done] = items(
      call(server, 'GET', '/stories/PROJ-118/agent-diagnoses').body
    );
    expect([done?.['status'], done?.['agent']]).toEqual([
      'succeeded',
      'shipwright',
    ]);
    expect(String(done?.['content'])).toMatch(
      /^## Cause\nA simulated diagnosis of PROJ-118/
    );
    expect(String(done?.['content'])).toMatch(/## What is still unknown/);
    expect(call(server, 'GET', '/stories/PROJ-118').body).toEqual(before);
    // It is not a refinement.
    expect(call(server, 'GET', '/refinements/PROJ-118').body).toEqual({
      key: 'PROJ-118',
      items: [],
    });
  });

  it('refuses a voyage that is not halted, one that does not exist, a second request in progress and a limit above 20 AIU', () => {
    const { server } = testServer();
    const notHalted = call(
      server,
      'POST',
      '/stories/PROJ-140/agent-diagnoses',
      {
        confirmSpend: true,
      }
    );
    expect([notHalted.status, problemCode(notHalted)]).toEqual([
      409,
      'invalid_state',
    ]);
    const unknown = call(server, 'POST', '/stories/PROJ-999/agent-diagnoses', {
      confirmSpend: true,
    });
    expect([unknown.status, problemCode(unknown)]).toEqual([404, 'not_found']);
    expect(
      problemCode(call(server, 'GET', '/stories/PROJ-999/agent-diagnoses'))
    ).toBe('not_found');
    const over = call(server, 'POST', '/stories/PROJ-118/agent-diagnoses', {
      confirmSpend: true,
      budgetNanoAiu: 20_000_000_001,
    });
    expect(problemCode(over)).toBe('validation_failed');
    call(server, 'POST', '/stories/PROJ-118/agent-diagnoses', {
      confirmSpend: true,
    });
    const again = call(server, 'POST', '/stories/PROJ-118/agent-diagnoses', {
      confirmSpend: true,
    });
    expect([again.status, problemCode(again)]).toEqual([409, 'invalid_state']);
  });

  it('cancels a queued diagnosis at once and a running one a moment later, keeping who cancelled, beside a refinement of the same key', () => {
    const { server, clock } = testServer();
    call(server, 'POST', '/refinements/PROJ-126', { confirmSpend: true });
    call(server, 'POST', '/stories/PROJ-126/agent-diagnoses', {
      confirmSpend: true,
    });
    const queued = call(
      server,
      'POST',
      '/stories/PROJ-126/agent-diagnoses/cancel',
      {
        reason: 'Asked by mistake',
      }
    );
    expect([
      queued.status,
      field(queued, 'status'),
      field(queued, 'exitReason'),
    ]).toEqual([202, 'cancelled', `cancelled by ${ACTOR}: Asked by mistake`]);
    // The refinement is untouched.
    expect(
      items(call(server, 'GET', '/refinements/PROJ-126').body).map(
        (r) => r['status']
      )
    ).toEqual(['queued']);
    call(server, 'POST', '/stories/PROJ-126/agent-diagnoses', {
      confirmSpend: true,
    });
    clock.advance(1_000);
    const running = call(
      server,
      'POST',
      '/stories/PROJ-126/agent-diagnoses/cancel',
      {
        reason: 'Too slow',
      }
    );
    expect([
      field(running, 'status'),
      field(running, 'cancelRequested'),
    ]).toEqual(['running', true]);
    clock.advance(500);
    const [ended] = items(
      call(server, 'GET', '/stories/PROJ-126/agent-diagnoses').body
    );
    expect([ended?.['status'], ended?.['content']]).toEqual([
      'cancelled',
      null,
    ]);
    const none = call(
      server,
      'POST',
      '/stories/PROJ-126/agent-diagnoses/cancel',
      {
        reason: 'again',
      }
    );
    expect(problemCode(none)).toBe('invalid_state');
  });
});
