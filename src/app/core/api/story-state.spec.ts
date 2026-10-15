import getStoryState from '@testing/fixtures/getStoryState.json';
import { DEFAULT_REVISION_CEILING, readStoryState } from './story-state';

describe('readStoryState', () => {
  describe('on the state the API sent for PROJ-123', () => {
    const view = readStoryState(getStoryState.state);

    it('reads repository aliases even when they have no pull requests yet', () => {
      expect(view.repositoryAliases).toEqual(['billing-api', 'billing-web']);
    });

    it('reads the acceptance criteria with their repository', () => {
      expect(view.criteria.map((c) => c.id)).toEqual([
        'AC1',
        'AC2',
        'AC3',
        'AC4',
        'AC5',
      ]);
      expect(view.criteria[3]).toEqual({
        id: 'AC4',
        text: "Due dates and overdue checks use the customer's timezone.",
        repo: 'billing-api',
      });
    });

    it('reads the work packages, with pending for a status the state leaves unset', () => {
      expect(view.packages).toEqual([
        {
          id: 'WP1',
          repo: 'billing-api',
          agent: 'implementer',
          status: 'pending',
          openPr: true,
          dependsOn: [],
        },
        {
          id: 'WP2',
          repo: 'billing-web',
          agent: 'implementer',
          status: 'pending',
          openPr: true,
          dependsOn: ['WP1'],
        },
      ]);
    });

    it('reads the send-back rounds counted so far for each gate', () => {
      expect(view.revisions.get('plan_accepted')).toBe(1);
      expect(view.revisions.get('delivery_accepted')).toBeUndefined();
    });

    it("has no human gate entry: a send-back clears the gate's decision", () => {
      expect(view.humanGates.size).toBe(0);
    });

    it('uses the default ceiling when the state sets none', () => {
      expect(view.revisionCeiling).toBe(DEFAULT_REVISION_CEILING);
      expect(DEFAULT_REVISION_CEILING).toBe(4);
    });
  });

  it('reads a decided human gate: status, time and reason', () => {
    const view = readStoryState({
      human_gates: {
        plan_accepted: {
          status: 'approved',
          timestamp: '2026-10-06T10:12:00Z',
          reason: 'Looks right.',
        },
        delivery_accepted: {},
      },
    });
    expect(view.humanGates.get('plan_accepted')).toEqual({
      status: 'approved',
      decidedAt: '2026-10-06T10:12:00Z',
      reason: 'Looks right.',
    });
    expect(view.humanGates.get('delivery_accepted')).toEqual({});
  });

  it('reads the ceiling the state sets, if it is a positive whole number', () => {
    expect(readStoryState({ revision_ceiling: 6 }).revisionCeiling).toBe(6);
    for (const bad of [0, -2, 2.5, '4', null, NaN]) {
      expect(readStoryState({ revision_ceiling: bad }).revisionCeiling).toBe(
        DEFAULT_REVISION_CEILING
      );
    }
  });

  it('keeps the status, agent and dependencies of a package that has moved on', () => {
    const view = readStoryState({
      work_packages: [
        {
          id: 'WP1',
          repo: 'svc',
          agent: 'implementer',
          open_pr: false,
          status: 'blocked',
          depends_on: ['WP0', 3, null],
        },
      ],
    });
    expect(view.packages[0]).toEqual({
      id: 'WP1',
      repo: 'svc',
      agent: 'implementer',
      status: 'blocked',
      openPr: false,
      dependsOn: ['WP0'],
    });
  });

  it('reads the rework note, the package it waits on and who accepted it, and drops an incomplete acceptance', () => {
    const view = readStoryState({
      work_packages: [
        {
          id: 'WP1',
          repo: 'svc',
          agent: 'implementer',
          open_pr: true,
          status: 'done',
          rework_note: 'Cover the timezone edge case.',
          accepted: {
            by: 'alex@example.com',
            reason: 'The missing check cannot run here.',
            from_status: 'unverified',
            at: '2026-10-06T10:00:00Z',
          },
        },
        {
          id: 'WP2',
          repo: 'web',
          agent: 'implementer',
          open_pr: true,
          status: 'waiting_on_handback',
          handback_to: 'WP1',
          rework_note: '   ',
          accepted: { by: 'alex@example.com', reason: 'x' },
        },
      ],
    });
    expect(view.packages[0]).toEqual({
      id: 'WP1',
      repo: 'svc',
      agent: 'implementer',
      status: 'done',
      openPr: true,
      dependsOn: [],
      reworkNote: 'Cover the timezone edge case.',
      accepted: {
        by: 'alex@example.com',
        reason: 'The missing check cannot run here.',
        fromStatus: 'unverified',
        at: '2026-10-06T10:00:00Z',
      },
    });
    expect(view.packages[1]).toEqual({
      id: 'WP2',
      repo: 'web',
      agent: 'implementer',
      status: 'waiting_on_handback',
      openPr: true,
      dependsOn: [],
      handbackTo: 'WP1',
    });
  });

  it('has no goal or description for a package, whatever the planner wrote beside it', () => {
    const view = readStoryState({
      work_packages: [
        { id: 'WP1', repo: 'svc', agent: 'implementer', summary: 'Do X' },
      ],
    });
    expect(Object.keys(view.packages[0]!).sort()).toEqual([
      'agent',
      'dependsOn',
      'id',
      'openPr',
      'repo',
      'status',
    ]);
  });

  it('reads the pull requests recorded on the child repositories, in plan order', () => {
    const view = readStoryState({
      child_repos: [
        {
          repo: 'billing-api',
          pr_url: 'https://github.example/r3da/billing-api/pull/7',
          pr_number: 7,
          pr_state: 'MERGED',
        },
        { repo: 'billing-web', branch: 'feature/PROJ-123' },
        {
          repo: 'billing-docs',
          pr_url: 'https://github.example/r3da/billing-docs/pull/2',
        },
      ],
    });
    expect(view.pullRequests).toEqual([
      {
        repo: 'billing-api',
        url: 'https://github.example/r3da/billing-api/pull/7',
        number: 7,
        state: 'MERGED',
      },
      {
        repo: 'billing-docs',
        url: 'https://github.example/r3da/billing-docs/pull/2',
      },
    ]);
  });

  it('keeps only absolute http(s) pull request links and drops a number or state of the wrong type', () => {
    const view = readStoryState({
      child_repos: [
        { repo: 'a', pr_url: 'javascript:alert(1)' },
        { repo: 'b', pr_url: '/r3da/b/pull/1' },
        { repo: 'c', pr_url: 42 },
        {
          repo: 'd',
          pr_url: ' https://h.example/o/d/pull/3 ',
          pr_number: -3,
          pr_state: 7,
        },
      ],
    });
    expect(view.pullRequests).toEqual([
      { repo: 'd', url: 'https://h.example/o/d/pull/3' },
    ]);
  });

  describe('on a state it cannot trust', () => {
    const EMPTY = {
      repositoryAliases: [],
      criteria: [],
      packages: [],
      pullRequests: [],
      humanGates: new Map(),
      revisions: new Map(),
      revisionCeiling: DEFAULT_REVISION_CEILING,
    };

    it.each([null, undefined, [], 'state', 42, true])(
      'reads %o as an empty state',
      (state) => {
        expect(readStoryState(state)).toEqual(EMPTY);
      }
    );

    it('reads fields of the wrong type as empty', () => {
      expect(
        readStoryState({
          acceptance_criteria: 'none',
          work_packages: { WP1: {} },
          human_gates: ['plan_accepted'],
          revisions: 3,
        })
      ).toEqual(EMPTY);
    });

    it('skips entries that are not usable and keeps the others', () => {
      const view = readStoryState({
        acceptance_criteria: [
          { id: 'AC1', text: 'ok' },
          'AC2',
          { id: '', text: 'no id' },
          { id: 'AC3' },
          null,
          { id: 'AC4', text: '' },
        ],
        work_packages: [{ repo: 'svc' }, { id: 'WP1' }, 7],
        human_gates: { a: 'approved', b: { status: 3 } },
        revisions: {
          plan_accepted: 2,
          bad_fraction: 1.5,
          bad_negative: -1,
          bad_text: '2',
        },
      });
      expect(view.criteria).toEqual([
        { id: 'AC1', text: 'ok' },
        { id: 'AC4', text: '' },
      ]);
      expect(view.packages).toEqual([
        {
          id: 'WP1',
          repo: '',
          agent: '',
          status: 'pending',
          openPr: false,
          dependsOn: [],
        },
      ]);
      expect(view.humanGates.get('a')).toBeUndefined();
      expect(view.humanGates.get('b')).toEqual({});
      expect([...view.revisions]).toEqual([['plan_accepted', 2]]);
    });

    it('does not let a key such as __proto__ change anything', () => {
      const state: unknown = JSON.parse(
        '{"revisions": {"__proto__": 5}, "human_gates": {"__proto__": {"status": "x"}}}'
      );
      const view = readStoryState(state);
      expect(view.revisions.get('__proto__')).toBe(5);
      expect(view.humanGates.get('__proto__')).toEqual({ status: 'x' });
      expect(({} as Record<string, unknown>)['status']).toBeUndefined();
    });

    it('ignores fields it does not know', () => {
      expect(
        readStoryState({
          intake_analyst: {},
          reviewer_reviews: [],
          gate_results: [],
          extra: 1,
        })
      ).toEqual(EMPTY);
    });

    it('keeps distinct contract-valid aliases from child repositories only', () => {
      expect(
        readStoryState({
          child_repos: [
            { repo: 'frontend' },
            { repo: 'frontend' },
            { repo: 'API_1.v2-test' },
            { repo: 'x'.repeat(64) },
            { repo: 'x'.repeat(65) },
            { repo: '' },
            { repo: '-bad' },
            { repo: 'bad repo' },
            { repo: 'https://example.com/repo' },
            { repo: 42 },
            null,
          ],
          work_packages: [{ id: 'WP1', repo: 'not-a-child-alias' }],
        }).repositoryAliases
      ).toEqual(['frontend', 'API_1.v2-test', 'x'.repeat(64)]);
    });
  });
});
