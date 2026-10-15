import type { StoryPullRequest } from '@core/api/story-state';
import type { AhoyEvent } from '@core/api/types';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { ciWait, readChecksRunning } from './ci-wait';

/** A `gate.evaluated` of a reconciler step, written at `at` (one transaction shares one time). */
function verdict(
  id: number,
  gate: string,
  result: string,
  message: string,
  at = '2026-10-06T10:00:00.000Z'
): AhoyEvent {
  return {
    ...anEvent(id, 'gate.evaluated', { gate, code: 1, result, message }),
    createdAt: at,
  };
}

const running = (pr = 7, names = 'build, e2e', count = 2): string =>
  `PR #${pr} has ${count} check(s) still running (${names}); poll again rather than recording ready`;

const waiting = aStory('PROJ-131', {
  phase: 'implementation',
  status: 'ready',
  currentRunId: null,
});

const prs: readonly StoryPullRequest[] = [
  {
    repo: 'billing-api',
    url: 'https://github.example/r3da/billing-api/pull/7',
    number: 7,
    state: 'OPEN',
  },
];

describe('readChecksRunning', () => {
  it('reads the pull request, the count and the names of the checks still running', () => {
    expect(readChecksRunning(running())).toEqual({
      prNumber: 7,
      pendingCount: 2,
      pendingChecks: ['build', 'e2e'],
    });
  });

  it('refuses any other message', () => {
    expect(
      readChecksRunning(
        "repo 'billing-api' status is 'in_progress', not 'ready'"
      )
    ).toBeNull();
    expect(
      readChecksRunning(
        'PR #7 has failing check(s):\n  build -> no details url'
      )
    ).toBeNull();
  });
});

describe('ciWait', () => {
  it('says Ahoy waits for CI, with the pull request link, the count and the names, after a waiting batch', () => {
    const events = [
      anEvent(1, 'implementation.reported', {
        runId: 'r-05',
        workPackage: 'WP2',
        status: 'ready',
      }),
      verdict(2, 'child_ready', 'fail', running()),
      {
        ...anEvent(3, 'story.routed', { phase: 'implementation' }),
        createdAt: '2026-10-06T10:00:00.000Z',
      },
    ];
    expect(ciWait(waiting, events, prs)).toEqual({
      seenAt: '2026-10-06T10:00:00.000Z',
      pullRequests: [
        {
          prNumber: 7,
          pendingCount: 2,
          pendingChecks: ['build', 'e2e'],
          pullRequest: prs[0],
          candidateRepos: [],
          message: running(),
        },
      ],
    });
  });

  it('reads every repository of the batch: one waits for CI, another has passed', () => {
    const events = [
      verdict(1, 'child_ready', 'pass', 'ok'),
      verdict(2, 'child_ready', 'fail', running(9, 'lint', 1)),
    ];
    const wait = ciWait(waiting, events, prs);
    expect(wait?.pullRequests.map((p) => [p.prNumber, p.pullRequest])).toEqual([
      [9, null],
    ]);
  });

  it('is no CI wait for a fail that is not about running checks, nor for a ready voyage on its own', () => {
    expect(
      ciWait(
        waiting,
        [
          verdict(
            1,
            'child_ready',
            'fail',
            "repo 'billing-web' status is 'in_progress', not 'ready'"
          ),
        ],
        prs
      )
    ).toBeNull();
    expect(ciWait(waiting, [], prs)).toBeNull();
    expect(ciWait(waiting, [anEvent(1, 'story.resumed', {})], prs)).toBeNull();
  });

  it('is no CI wait when the batch also branches, rejects or halts', () => {
    for (const result of ['branch', 'reject', 'halt', 'error'])
      expect(
        ciWait(
          waiting,
          [
            verdict(1, 'child_ready', 'fail', running()),
            verdict(2, 'child_ready', result, 'PR #8 has failing check(s)'),
          ],
          prs
        )
      ).toBeNull();
  });

  it('is gone once the voyage moves on: a run queued, a halt, a decision, a resume or a phase change after the batch', () => {
    const batch = verdict(1, 'child_ready', 'fail', running());
    for (const next of [
      anEvent(2, 'run.queued', { runId: 'r-07', workPackage: 'WP3' }),
      anEvent(2, 'story.halted', { reason: 'package_stuck' }),
      anEvent(2, 'work_package.decided', {
        workPackage: 'WP2',
        decision: 'retry',
        reason: 'x',
      }),
      anEvent(2, 'story.resumed', {}),
      anEvent(2, 'story.phase_changed', {
        from: 'implementation',
        to: 'pr_review',
      }),
    ])
      expect(ciWait(waiting, [batch, next], prs)).toBeNull();
  });

  it('is gone when the next batch passes, and an older waiting batch is never read with it', () => {
    const events = [
      verdict(1, 'child_ready', 'fail', running(), '2026-10-06T10:00:00.000Z'),
      verdict(2, 'child_ready', 'pass', 'ok', '2026-10-06T10:05:00.000Z'),
      verdict(3, 'pr', 'fail', 'not yet', '2026-10-06T10:05:00.000Z'),
    ];
    expect(ciWait(waiting, events, prs)).toBeNull();
  });

  it('follows the checks as they finish: the newest batch names only those still running', () => {
    const events = [
      verdict(
        1,
        'child_ready',
        'fail',
        running(7, 'build, e2e', 2),
        '2026-10-06T10:00:00.000Z'
      ),
      verdict(
        2,
        'child_ready',
        'fail',
        running(7, 'e2e', 1),
        '2026-10-06T10:02:00.000Z'
      ),
    ];
    const wait = ciWait(waiting, events, prs);
    expect(wait?.seenAt).toBe('2026-10-06T10:02:00.000Z');
    expect(wait?.pullRequests[0]?.pendingChecks).toEqual(['e2e']);
  });

  it('is no CI wait unless the voyage is ready in implementation with no run', () => {
    const events = [verdict(1, 'child_ready', 'fail', running())];
    for (const story of [
      { ...waiting, status: 'running' as const, currentRunId: 'r-08' },
      { ...waiting, status: 'halted' as const },
      { ...waiting, status: 'terminal' as const },
      { ...waiting, phase: 'pr_review' },
      { ...waiting, currentRunId: 'r-08' },
    ])
      expect(ciWait(story, events, prs)).toBeNull();
    expect(ciWait(null, events, prs)).toBeNull();
  });

  it("ignores a run's own gate verdict, an owner's budget change and event types it does not know", () => {
    const runGate = anEvent(1, 'gate.evaluated', {
      runId: 'r-05',
      gate: 'child_ready',
      code: 1,
      result: 'fail',
      message: running(),
    });
    expect(ciWait(waiting, [runGate], prs)).toBeNull();
    const events = [
      verdict(2, 'child_ready', 'fail', running()),
      anEvent(3, 'story.budget_changed', {}),
      anEvent(4, 'knowledge_review.skipped', {}),
    ];
    expect(ciWait(waiting, events, prs)).not.toBeNull();
  });

  it('links no pull request when two repositories record the same number, and names both as candidates', () => {
    const twice: StoryPullRequest[] = [
      ...prs,
      {
        repo: 'billing-web',
        url: 'https://github.example/r3da/billing-web/pull/7',
        number: 7,
      },
    ];
    const wait = ciWait(
      waiting,
      [verdict(1, 'child_ready', 'fail', running())],
      twice
    );
    expect(wait?.pullRequests[0]?.pullRequest).toBeNull();
    expect(wait?.pullRequests[0]?.candidateRepos).toEqual([
      'billing-api',
      'billing-web',
    ]);
    expect(
      ciWait(waiting, [verdict(1, 'child_ready', 'fail', running())], prs)
        ?.pullRequests[0]?.candidateRepos
    ).toEqual([]);
  });
});
