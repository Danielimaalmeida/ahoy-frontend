import { call, problemCode, testServer } from './spec-helpers';

describe('the mock diagnosis (getStoryDiagnosis)', () => {
  it('finds nothing to explain in a voyage that is under way', () => {
    const { server } = testServer();
    expect(call(server, 'GET', '/stories/PROJ-140/diagnosis').body).toEqual({
      key: 'PROJ-140',
      status: 'running',
      phase: 'planning',
      haltReason: null,
      findings: [],
    });
  });

  it('explains a failed run with its detail, its exit reason and the last lines of the worker', () => {
    const { server } = testServer();
    const answer = call(server, 'GET', '/stories/PROJ-118/diagnosis');
    expect(answer.status).toBe(200);
    const body = answer.body as {
      haltReason: string;
      findings: { kind: string; evidence: string[]; runId: string }[];
    };
    expect(body.haltReason).toBe('run_failed');
    expect(body.findings).toHaveLength(1);
    const [finding] = body.findings;
    expect(finding?.kind).toBe('agent_failed');
    expect(finding?.evidence[0]).toBe(
      'The worker exited with code 1 before it wrote a result.'
    );
    expect(finding?.evidence).toContain('worker: [ahoy-worker] exit 1');
    expect(finding?.runId).toMatch(/^proj-118-implementation-/);
  });

  it('quotes who stopped a voyage and why', () => {
    const { server } = testServer();
    const body = call(server, 'GET', '/stories/PROJ-126/diagnosis').body as {
      findings: { kind: string; evidence: string[] }[];
    };
    expect(body.findings.map((f) => f.kind)).toEqual(['stopped_by_user']);
    expect(body.findings[0]?.evidence[0]).toBe(
      "priya@example.com: Waiting for the compliance team's answer on retention."
    );
  });

  it('answers 404 for a story that does not exist', () => {
    const { server } = testServer();
    expect(
      problemCode(call(server, 'GET', '/stories/PROJ-404/diagnosis'))
    ).toBe('not_found');
  });
});
