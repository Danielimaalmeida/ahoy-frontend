import answerQuestion from '@testing/fixtures/answerQuestion.json';
import cancelRefinement from '@testing/fixtures/cancelRefinement.json';
import decideHumanGate from '@testing/fixtures/decideHumanGate.json';
import getHealth from '@testing/fixtures/getHealth.json';
import getRefinements from '@testing/fixtures/getRefinements.json';
import getRun from '@testing/fixtures/getRun.json';
import getStory from '@testing/fixtures/getStory.json';
import getStoryModels from '@testing/fixtures/getStoryModels.json';
import getStoryState from '@testing/fixtures/getStoryState.json';
import listArtifacts from '@testing/fixtures/listArtifacts.json';
import listModels from '@testing/fixtures/listModels.json';
import listGateRecords from '@testing/fixtures/listGateRecords.json';
import listQuestions from '@testing/fixtures/listQuestions.json';
import listRefinements from '@testing/fixtures/listRefinements.json';
import listStories from '@testing/fixtures/listStories.json';
import listStoryEvents from '@testing/fixtures/listStoryEvents.json';
import listStoryRuns from '@testing/fixtures/listStoryRuns.json';
import { withField, withoutField } from '@testing/fixtures/mutate';
import problems from '@testing/fixtures/problems.json';
import refreshIntake from '@testing/fixtures/refreshIntake.json';
import requestRefinement from '@testing/fixtures/requestRefinement.json';
import resumeStory from '@testing/fixtures/resumeStory.json';
import setStoryBudget from '@testing/fixtures/setStoryBudget.json';
import setStoryModels from '@testing/fixtures/setStoryModels.json';
import startStory from '@testing/fixtures/startStory.json';
import stopStory from '@testing/fixtures/stopStory.json';
import type { Guard } from './guard-kit';
import {
  isAnswerAccepted,
  isArtifact,
  isArtifactList,
  isDecisionAccepted,
  isEvent,
  isEventPage,
  isGateRecord,
  isGateRecordList,
  isHealth,
  isModelPlan,
  isModelCatalog,
  isProblem,
  isQuestion,
  isQuestionList,
  isRefinement,
  isRefinementList,
  isRefinementSummaryList,
  isRun,
  isRunList,
  isStory,
  isStoryPage,
  isStoryStateDocument,
} from './guards';

/** AIU amounts and counts a guard must refuse: fractional, negative, NaN, infinite, text and beyond 2^53. */
const BAD_AMOUNTS: readonly unknown[] = [
  12.5,
  0.1,
  -1,
  NaN,
  Infinity,
  -Infinity,
  '5',
  null,
  2 ** 53,
];

describe('guards accept what the API sends (the fixtures)', () => {
  const cases: readonly (readonly [string, Guard<unknown>, unknown])[] = [
    ['listModels', isModelCatalog, listModels],
    ['getHealth', isHealth, getHealth],
    ['getStory', isStory, getStory],
    ['startStory', isStory, startStory],
    ['stopStory', isStory, stopStory],
    ['resumeStory', isStory, resumeStory],
    ['setStoryBudget', isStory, setStoryBudget],
    ['listStories', isStoryPage, listStories],
    ['getStoryModels', isModelPlan, getStoryModels],
    ['setStoryModels', isModelPlan, setStoryModels],
    ['listStoryRuns', isRunList, listStoryRuns],
    ['getRun', isRun, getRun],
    ['listQuestions', isQuestionList, listQuestions],
    ['answerQuestion', isAnswerAccepted, answerQuestion],
    ['listGateRecords', isGateRecordList, listGateRecords],
    ['decideHumanGate', isDecisionAccepted, decideHumanGate],
    ['getStoryState', isStoryStateDocument, getStoryState],
    ['listArtifacts', isArtifactList, listArtifacts],
    ['listStoryEvents', isEventPage, listStoryEvents],
    ['refreshIntake', isStory, refreshIntake],
    ['listRefinements', isRefinementSummaryList, listRefinements],
    ['getRefinements', isRefinementList, getRefinements],
    ['requestRefinement', isRefinement, requestRefinement],
    ['cancelRefinement', isRefinement, cancelRefinement],
  ];

  it.each(cases)('%s', (_name, accepts, fixture) => {
    expect(accepts.explain(fixture)).toBeNull();
    expect(accepts(fixture)).toBe(true);
  });

  it('accepts each item of the lists on its own', () => {
    expect(listQuestions.items.every(isQuestion)).toBe(true);
    expect(listGateRecords.items.every(isGateRecord)).toBe(true);
    expect(listArtifacts.items.every(isArtifact)).toBe(true);
    expect(listStoryEvents.items.every(isEvent)).toBe(true);
  });

  it.each(problems.map((p) => [p.code, p] as const))(
    'accepts the %s problem',
    (_code, problem) => {
      expect(isProblem(problem)).toBe(true);
    }
  );
});

describe('isModelCatalog', () => {
  it.each([
    ['source', 'copilot_account'],
    ['models', []],
    ['models', [{ id: 'bad id', label: 'Model', reasoningEfforts: null }]],
    ['models', [{ id: 'valid', label: '', reasoningEfforts: null }]],
    [
      'models',
      [{ id: 'valid', label: 'Model', reasoningEfforts: ['extreme'] }],
    ],
    ['reasoningEfforts', ['extreme']],
    ['controlSha', 'not-a-sha'],
    ['defaults', [{ ...listModels.defaults[0], slot: 'unknown' }]],
    ['defaults', [{ ...listModels.defaults[0], modelSource: 'story' }]],
    ['defaults', [{ ...listModels.defaults[0], reasoningEffort: 'extreme' }]],
  ])('refuses invalid %s', (field, value) => {
    expect(isModelCatalog(withField(listModels, field, value))).toBe(false);
  });

  it.each(Object.keys(listModels))('requires %s', (field) => {
    expect(isModelCatalog(withoutField(listModels, field))).toBe(false);
  });

  it('accepts unavailable control defaults and unknown model effort support', () => {
    expect(
      isModelCatalog({ ...listModels, controlSha: null, defaults: [] })
    ).toBe(true);
  });
});

describe('isStory', () => {
  const REQUIRED = Object.keys(getStory);

  it('checks all thirteen fields of the contract', () => {
    expect(REQUIRED).toHaveLength(13);
  });

  it.each(REQUIRED)(
    'refuses a story without %s and names the field',
    (field) => {
      const broken = withoutField(getStory, field);
      expect(isStory(broken)).toBe(false);
      expect(isStory.explain(broken)).toContain(`Story.${field} must be`);
    }
  );

  const BAD: readonly (readonly [string, unknown])[] = [
    ['key', 'proj-123'],
    ['key', 'PROJ-'],
    ['key', `A${'B'.repeat(40)}-1`],
    ['key', 7],
    ['title', 7],
    ['owner', ''],
    ['owner', 7],
    ['phase', ''],
    ['status', 'paused'],
    ['status', 7],
    ['haltReason', 7],
    ['controlSha', 'a41f9c2'],
    ['controlSha', 'A'.repeat(40)],
    ['currentRunId', 'bad id'],
    ['currentRunId', 7],
    ['version', 0],
    ['version', 1.5],
    ['createdAt', 'yesterday'],
    ['updatedAt', 1_790_000_000],
  ];

  it.each(BAD)('refuses %s = %o', (field, value) => {
    const broken = withField(getStory, field, value);
    expect(isStory(broken)).toBe(false);
    expect(isStory.explain(broken)).toContain(`Story.${field} must be`);
  });

  it.each(['budgetNanoAiu', 'spentNanoAiu'])(
    'refuses a %s that is fractional, negative, NaN or not exact',
    (field) => {
      for (const amount of BAD_AMOUNTS) {
        expect(isStory(withField(getStory, field, amount))).toBe(false);
      }
    }
  );

  it('accepts whole amounts including zero and the largest exact one', () => {
    for (const amount of [0, 1, 12_400_000_000, Number.MAX_SAFE_INTEGER]) {
      expect(isStory(withField(getStory, 'spentNanoAiu', amount))).toBe(true);
    }
  });

  it('accepts null where the contract allows it', () => {
    const quiet = {
      ...getStory,
      title: null,
      haltReason: null,
      currentRunId: null,
    };
    expect(isStory(quiet)).toBe(true);
  });

  it('accepts a halted story with its reason, and a running one with its run', () => {
    expect(
      isStory({ ...getStory, status: 'halted', haltReason: 'run_failed' })
    ).toBe(true);
    expect(
      isStory({ ...getStory, status: 'running', currentRunId: 'r-02' })
    ).toBe(true);
  });

  it('tolerates fields it does not know, so a newer API does not break the app', () => {
    expect(isStory({ ...getStory, haltDetail: 'x', labels: ['a'] })).toBe(true);
  });

  it('refuses what is not an object', () => {
    for (const value of [null, undefined, [], 'PROJ-123', 7])
      expect(isStory(value)).toBe(false);
  });
});

describe('isStoryPage', () => {
  it('names the item and the field that broke the page', () => {
    const broken = {
      ...listStories,
      items: [
        listStories.items[0],
        { ...listStories.items[1], spentNanoAiu: 12.5 },
      ],
    };
    expect(isStoryPage(broken)).toBe(false);
    expect(isStoryPage.explain(broken)).toBe(
      'StoryPage.items[1].spentNanoAiu must be a whole number of nano-AIU, 0 or more (got 12.5)'
    );
  });

  it('accepts an empty last page and refuses a page without a cursor field', () => {
    expect(isStoryPage({ items: [], nextCursor: null })).toBe(true);
    expect(isStoryPage({ items: [] })).toBe(false);
    expect(isStoryPage({ items: 'none', nextCursor: null })).toBe(false);
  });
});

describe('isRun', () => {
  it('refuses a fractional or negative AIU amount anywhere in a run', () => {
    for (const amount of BAD_AMOUNTS) {
      expect(isRun(withField(getRun, 'budgetNanoAiu', amount))).toBe(false);
      expect(
        isRun(withField(getRun, 'usage', { ...getRun.usage, nanoAiu: amount }))
      ).toBe(false);
    }
    for (const count of ['requests', 'inputTokens', 'outputTokens']) {
      expect(
        isRun(withField(getRun, 'usage', { ...getRun.usage, [count]: 1.5 }))
      ).toBe(false);
      expect(
        isRun(withField(getRun, 'usage', { ...getRun.usage, [count]: -1 }))
      ).toBe(false);
    }
  });

  it('names the nested field', () => {
    const broken = withField(getRun, 'usage', { ...getRun.usage, nanoAiu: -5 });
    expect(isRun.explain(broken)).toBe(
      'Run.usage.nanoAiu must be a whole number of nano-AIU, 0 or more (got -5)'
    );
  });

  it('refuses a status or effort the contract does not list', () => {
    expect(isRun(withField(getRun, 'status', 'paused'))).toBe(false);
    expect(isRun(withField(getRun, 'reasoningEffort', 'extreme'))).toBe(false);
  });

  it('accepts a run that has not started, has no model and no gate', () => {
    const queued = {
      ...getRun,
      status: 'queued',
      model: null,
      reasoningEffort: null,
      gate: null,
      startedAt: null,
      endedAt: null,
    };
    expect(isRun(queued)).toBe(true);
  });

  it('checks the gate verdict of a run', () => {
    expect(
      isRun(
        withField(getRun, 'gate', {
          gate: 'plan',
          code: 9,
          result: 'pass',
          message: 'x',
        })
      )
    ).toBe(false);
    expect(
      isRun(
        withField(getRun, 'gate', {
          gate: 'plan',
          code: 0,
          result: 'maybe',
          message: 'x',
        })
      )
    ).toBe(false);
  });

  it('accepts any agent, runtime and phase text: the contract leaves them open', () => {
    expect(
      isRun({
        ...getRun,
        agent: 'a-new-agent',
        runtime: 'firecracker',
        phase: 'a_new_phase',
      })
    ).toBe(true);
  });
});

describe('isQuestion', () => {
  const [, pending] = listQuestions.items;

  it('accepts an unanswered question with its nulls', () => {
    expect(pending?.answer).toBeNull();
    expect(isQuestion(pending)).toBe(true);
  });

  it('refuses an id that is not Q followed by a positive number', () => {
    for (const id of ['Q0', 'q1', '1', 'Q01', ''])
      expect(isQuestion(withField(pending!, 'id', id))).toBe(false);
  });

  it('refuses a round below 1 and a consumed flag that is not a boolean', () => {
    expect(isQuestion(withField(pending!, 'round', 0))).toBe(false);
    expect(isQuestion(withField(pending!, 'consumed', 'no'))).toBe(false);
  });

  it('accepts a question an intake refresh superseded, and requires supersededAt to be null or a timestamp', () => {
    expect(
      isQuestion(withField(pending!, 'supersededAt', '2026-10-06T10:05:00Z'))
    ).toBe(true);
    expect(isQuestion(withoutField(pending!, 'supersededAt'))).toBe(false);
    expect(isQuestion(withField(pending!, 'supersededAt', 'yesterday'))).toBe(
      false
    );
  });
});

describe('isRefinement', () => {
  const [succeeded, cancelled] = getRefinements.items;

  it('accepts a succeeded refinement with its Markdown and a cancelled one without', () => {
    expect(isRefinement(succeeded)).toBe(true);
    expect(isRefinement(cancelled)).toBe(true);
  });

  it('refuses content on a refinement that did not succeed, and none on one that did', () => {
    expect(isRefinement.explain(withField(cancelled!, 'content', '# x'))).toBe(
      'Refinement.content must be set exactly when the status is succeeded'
    );
    expect(isRefinement(withField(succeeded!, 'content', null))).toBe(false);
  });

  it('refuses an unknown status, a fractional amount and a key that is not a Jira key', () => {
    expect(isRefinement(withField(cancelled!, 'status', 'waiting'))).toBe(
      false
    );
    expect(isRefinement(withField(cancelled!, 'budgetNanoAiu', 0.5))).toBe(
      false
    );
    expect(isRefinement(withField(cancelled!, 'key', 'proj-145'))).toBe(false);
  });

  it('names the item of a list that is wrong', () => {
    const list = withField(getRefinements, 'items', [
      succeeded,
      withField(cancelled!, 'cancelRequested', 'yes'),
    ]);
    expect(isRefinementList.explain(list)).toBe(
      'RefinementList.items[1].cancelRequested must be true or false (got "yes")'
    );
  });

  it('lists summaries without content', () => {
    expect(
      listRefinements.items.every((item) => !Object.hasOwn(item, 'content'))
    ).toBe(true);
  });
});

describe('isGateRecord', () => {
  it('refuses an outcome or source the contract does not list', () => {
    const [first] = listGateRecords.items;
    expect(isGateRecord(withField(first!, 'outcome', 'waiting'))).toBe(false);
    expect(isGateRecord(withField(first!, 'source', 'robot'))).toBe(false);
  });

  it('accepts the outcomes of both sources', () => {
    const [first] = listGateRecords.items;
    for (const outcome of [
      'pass',
      'fail',
      'error',
      'branch',
      'halt',
      'reject',
      'approve',
      'send_back',
    ]) {
      expect(isGateRecord(withField(first!, 'outcome', outcome))).toBe(true);
    }
  });
});

describe('isArtifact', () => {
  const [plan] = listArtifacts.items;

  it('refuses a path that escapes the story or has odd characters', () => {
    for (const path of [
      '../etc/passwd',
      '/abs.md',
      'a b.md',
      'a//b.md',
      '',
      '.hidden',
      'a/../b',
    ]) {
      expect(isArtifact(withField(plan!, 'path', path))).toBe(false);
    }
  });

  it('accepts nested paths and refuses a sha256 of the wrong length', () => {
    expect(
      isArtifact(withField(plan!, 'path', 'specs/PROJ-123/plan-round-1.md'))
    ).toBe(true);
    expect(isArtifact(withField(plan!, 'sha256', 'abc'))).toBe(false);
  });

  it('refuses a revision of 0 in an entry but accepts a set at revision 0', () => {
    expect(isArtifact(withField(plan!, 'revision', 0))).toBe(false);
    expect(isArtifactList({ revision: 0, items: [] })).toBe(true);
  });
});

describe('isEvent', () => {
  const [event] = listStoryEvents.items;

  it('accepts an event type this version does not know', () => {
    expect(isEvent(withField(event!, 'type', 'story.something_new'))).toBe(
      true
    );
  });

  it('needs a payload that is an object', () => {
    for (const payload of [null, [], 'x', 3])
      expect(isEvent(withField(event!, 'payload', payload))).toBe(false);
    expect(isEvent(withField(event!, 'payload', {}))).toBe(true);
  });

  it('needs a decimal id', () => {
    for (const id of ['abc', '-1', '', 12, '1'.repeat(21)])
      expect(isEvent(withField(event!, 'id', id))).toBe(false);
  });

  it('accepts a page with no events yet (lastEventId null)', () => {
    expect(isEventPage({ items: [], lastEventId: null })).toBe(true);
    expect(isEventPage({ items: [] })).toBe(false);
  });
});

describe('isModelPlan', () => {
  it("accepts a slot that runs on the agent's profile", () => {
    const [intake] = getStoryModels.slots;
    const profile = {
      ...intake,
      model: null,
      reasoningEffort: null,
      modelSource: 'agent_profile',
    };
    expect(isModelPlan({ ...getStoryModels, slots: [profile] })).toBe(true);
  });

  it('refuses a slot or source the contract does not list', () => {
    const [intake] = getStoryModels.slots;
    for (const [field, value] of [
      ['slot', 'defect_review'],
      ['modelSource', 'default'],
      ['effortSource', 'agent_profile'],
    ] as const) {
      expect(
        isModelPlan({
          ...getStoryModels,
          slots: [withField(intake!, field, value)],
        })
      ).toBe(false);
    }
  });

  it('refuses a model id with spaces', () => {
    const [intake] = getStoryModels.slots;
    expect(
      isModelPlan({
        ...getStoryModels,
        slots: [withField(intake!, 'model', 'bad model')],
      })
    ).toBe(false);
  });
});

describe('isStoryStateDocument', () => {
  it('needs the state to be an object, whatever is in it', () => {
    expect(
      isStoryStateDocument({ key: 'PROJ-123', version: 1, state: {} })
    ).toBe(true);
    for (const state of [null, [], 'x']) {
      expect(isStoryStateDocument({ key: 'PROJ-123', version: 1, state })).toBe(
        false
      );
    }
  });
});

describe('isProblem', () => {
  it('accepts a code this version does not know: an error is never refused for that', () => {
    expect(
      isProblem({
        type: 'urn:x',
        title: 'slow down',
        status: 429,
        code: 'rate_limited',
      })
    ).toBe(true);
  });

  it('refuses a body that is not problem details', () => {
    for (const body of [
      { message: 'Bad gateway' },
      { type: 'urn:x', title: 't', status: 200, code: 'x' },
      { type: 'urn:x', title: 't', status: 600, code: 'x' },
      { type: 'urn:x', title: 't', status: 404.5, code: 'x' },
      { type: 'urn:x', title: 't', status: 404, code: '' },
      { type: 'urn:x', title: 't', status: 404 },
      null,
      '<html>502</html>',
    ]) {
      expect(isProblem(body)).toBe(false);
    }
  });

  it('checks the optional parts when they are present', () => {
    const base = {
      type: 'urn:x',
      title: 't',
      status: 409,
      code: 'stale_version',
    };
    expect(
      isProblem({ ...base, currentVersion: 9, instance: 'req-1', detail: 'd' })
    ).toBe(true);
    expect(isProblem({ ...base, currentVersion: 0 })).toBe(false);
    expect(
      isProblem({
        ...base,
        errors: [{ message: 'm' }, { path: '/a', message: 'm' }],
      })
    ).toBe(true);
    expect(isProblem({ ...base, errors: [{ path: '/a' }] })).toBe(false);
    expect(isProblem({ ...base, errors: 'none' })).toBe(false);
  });
});
