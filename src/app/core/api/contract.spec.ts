import answerQuestion from '@testing/fixtures/answerQuestion.json';
import cancelRefinement from '@testing/fixtures/cancelRefinement.json';
import decideHumanGate from '@testing/fixtures/decideHumanGate.json';
import getArtifactContent from '@testing/fixtures/getArtifactContent.json';
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

const jiraBacklog = {
  items: [
    {
      key: 'PROJ-145',
      issueType: 'Story',
      summary: 'Show the VAT number on exported invoices',
      status: 'Open',
      priority: 'High',
      updatedAt: '2026-10-06T08:00:00.000Z',
      sprint: null,
    },
  ],
  total: 1,
};
import {
  enumOf,
  isDateTime,
  operationNamed,
  operations,
  requestViolations,
  responseViolations,
  schemaNamed,
  violations,
} from '@testing/fixtures/contract';
import {
  EFFORT_SOURCES,
  GATE_OUTCOMES,
  GATE_RESULTS,
  GATE_SOURCES,
  HUMAN_DECISIONS,
  MODEL_SLOTS,
  MODEL_SOURCES,
  PROBLEM_CODES,
  REASONING_EFFORTS,
  RUN_STATUSES,
  STORY_STATUSES,
} from './types';

/** The operations `ApiClient` implements (phases 3 to 6), each with the fixture that is the body of its answer. */
const CLIENT_OPERATIONS: readonly (readonly [string, unknown])[] = [
  ['listModels', listModels],
  ['listJiraBacklog', jiraBacklog],
  ['getHealth', getHealth],
  ['listStories', listStories],
  ['startStory', startStory],
  ['getStory', getStory],
  ['stopStory', stopStory],
  ['resumeStory', resumeStory],
  ['setStoryBudget', setStoryBudget],
  ['refreshIntake', refreshIntake],
  ['getStoryModels', getStoryModels],
  ['setStoryModels', setStoryModels],
  ['listStoryRuns', listStoryRuns],
  ['getRun', getRun],
  ['listQuestions', listQuestions],
  ['answerQuestion', answerQuestion],
  ['listGateRecords', listGateRecords],
  ['decideHumanGate', decideHumanGate],
  ['getStoryState', getStoryState],
  ['listArtifacts', listArtifacts],
  ['listStoryEvents', listStoryEvents],
  ['listRefinements', listRefinements],
  ['getRefinements', getRefinements],
  ['requestRefinement', requestRefinement],
  ['cancelRefinement', cancelRefinement],
];

/** In the contract, not in the client yet: phase 7 (`resolveReview`...) and the live stream (lane 2B). */
const NOT_IN_THE_CLIENT_YET: readonly string[] = [
  'resolveReview',
  'decideWorkPackage',
  'reopenWork',
  'unblockStory',
  'streamEvents',
];

/** The members of a list, sorted, so that the order the contract lists enum values in does not matter. */
const members = (list: readonly string[]): readonly string[] =>
  [...list].sort();

describe('the contract (openapi/ahoy-v1.yaml, through its JSON mirror)', () => {
  it('has the implemented operations, and exactly these others that it does not yet', () => {
    const inTheContract = operations().map((o) => o.operationId);
    const expected = [
      ...CLIENT_OPERATIONS.map(([id]) => id),
      'getArtifactContent',
      ...NOT_IN_THE_CLIENT_YET,
    ];
    expect(members(inTheContract)).toEqual(members(expected));
    expect(CLIENT_OPERATIONS.length + 1).toBe(26);
  });

  it('has no operation id twice', () => {
    const ids = operations().map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('each fixture is a valid successful answer of its operation', () => {
  it.each(CLIENT_OPERATIONS)('%s', (operationId, fixture) => {
    expect(responseViolations(operationId, fixture)).toEqual([]);
  });

  it('getArtifactContent: the contract answers raw text with an ETag; the fixture holds that text, its type and its ETag', () => {
    const op = operationNamed('getArtifactContent');
    expect(op.successMediaTypes).toContain(getArtifactContent.mediaType);
    expect(typeof getArtifactContent.text).toBe('string');
    expect(
      violations(schemaNamed('ArtifactPath'), getArtifactContent.path)
    ).toEqual([]);
    const listed = listArtifacts.items.find(
      (a) => a.path === getArtifactContent.path
    );
    expect(listed).toBeDefined();
    expect(getArtifactContent.etag).toBe(`"${listed!.sha256}"`);
  });

  it('the 2xx statuses the client tests use are the ones the contract documents for each command', () => {
    const statusOf = (id: string) =>
      operationNamed(id).successStatuses.filter((s) => s !== '304');
    expect(statusOf('startStory')).toEqual(['201']);
    for (const id of [
      'stopStory',
      'resumeStory',
      'setStoryBudget',
      'setStoryModels',
      'answerQuestion',
      'decideHumanGate',
      'refreshIntake',
      'requestRefinement',
      'cancelRefinement',
    ])
      expect(statusOf(id)).toEqual(['202']);
    expect(
      members(operationNamed('getArtifactContent').successStatuses)
    ).toEqual(['200', '304']);
  });
});

describe('problems.json: one problem+json body per code', () => {
  it('has exactly the codes of the contract, once each', () => {
    expect(members(problems.map((p) => p.code))).toEqual(
      members(enumOf('Problem', 'code'))
    );
  });

  it.each(problems.map((p) => [p.code, p] as const))(
    '%s is a valid Problem',
    (_code, problem) => {
      expect(violations(schemaNamed('Problem'), problem)).toEqual([]);
    }
  );

  it('uses the `type` the real API sends: urn:ahoy:problem:<code>', () => {
    for (const p of problems) expect(p.type).toBe(`urn:ahoy:problem:${p.code}`);
  });
});

describe('the request bodies the client sends', () => {
  it('are valid for startStory with every optional field, including models', () => {
    const body = {
      key: 'PROJ-145',
      title: 'Allow exporting invoices as CSV',
      budgetNanoAiu: 25_000_000_000,
      controlRef: '1890d5aa84819480275f79060cae5d529be21ee8',
      models: {
        planning: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
        review: { model: 'gpt-5.6-terra' },
      },
    };
    expect(requestViolations('startStory', body)).toEqual([]);
  });

  it('are valid for refreshIntake, requestRefinement and cancelRefinement as the client sends them', () => {
    expect(
      requestViolations('refreshIntake', {
        expectedVersion: 9,
        reason: 'Jira now has the export limits',
        confirmSpend: true,
      })
    ).toEqual([]);
    expect(
      requestViolations('requestRefinement', { confirmSpend: true })
    ).toEqual([]);
    expect(
      requestViolations('requestRefinement', {
        confirmSpend: true,
        notes: 'Check the CSV export limits',
        budgetNanoAiu: 5_000_000_000,
      })
    ).toEqual([]);
    expect(
      requestViolations('cancelRefinement', { reason: 'Wrong story' })
    ).toEqual([]);
  });

  it('refuse a refresh or a refinement without the spend confirmation', () => {
    expect(
      requestViolations('refreshIntake', {
        expectedVersion: 9,
        reason: 'x',
        confirmSpend: false,
      })
    ).not.toEqual([]);
    expect(requestViolations('requestRefinement', {})).not.toEqual([]);
  });

  it('are valid for setStoryModels with a null that gives a slot back to the defaults', () => {
    expect(
      requestViolations('setStoryModels', {
        expectedVersion: 9,
        models: { planning: null, implementation: { model: 'm' } },
      })
    ).toEqual([]);
  });

  it('are refused when a required field is missing, so the check is not vacuous', () => {
    expect(
      requestViolations('stopStory', { expectedVersion: 3 }).join('\n')
    ).toContain('reason');
    expect(
      requestViolations('startStory', { key: 'PROJ-1' }).join('\n')
    ).toContain('budgetNanoAiu');
    expect(
      requestViolations('decideHumanGate', {
        gate: 'plan_accepted',
        decision: 'approve',
      }).join('\n')
    ).toContain('expectedVersion');
  });

  it('are refused when a field has the wrong type, a fractional amount, or a value outside its enum', () => {
    expect(
      requestViolations('setStoryBudget', {
        expectedVersion: 1,
        budgetNanoAiu: 1.5,
        reason: 'x',
      })
    ).not.toEqual([]);
    expect(
      requestViolations('setStoryBudget', {
        expectedVersion: 0,
        budgetNanoAiu: 1,
        reason: 'x',
      })
    ).not.toEqual([]);
    expect(
      requestViolations('decideHumanGate', {
        gate: 'g',
        decision: 'maybe',
        expectedVersion: 1,
      })
    ).not.toEqual([]);
    expect(
      requestViolations('answerQuestion', { answer: 5, expectedVersion: 1 })
    ).not.toEqual([]);
  });

  it('are refused when they carry a field the contract does not have, and the message names it', () => {
    const refused = requestViolations('resumeStory', {
      expectedVersion: 1,
      comment: 'hi',
    });
    expect(refused.join('\n')).toContain('comment');
  });
});

describe('the check itself', () => {
  const story = getStory;

  it('accepts a story and says nothing', () => {
    expect(violations(schemaNamed('Story'), story)).toEqual([]);
  });

  it('names the field when an amount is negative, fractional or the wrong type', () => {
    expect(
      violations(
        schemaNamed('Story'),
        withField(story, 'spentNanoAiu', -1)
      ).join('\n')
    ).toContain('/spentNanoAiu');
    expect(
      violations(
        schemaNamed('Story'),
        withField(story, 'spentNanoAiu', 1.5)
      ).join('\n')
    ).toContain('/spentNanoAiu');
    expect(
      violations(
        schemaNamed('Story'),
        withField(story, 'budgetNanoAiu', '9')
      ).join('\n')
    ).toContain('/budgetNanoAiu');
  });

  it('refuses a missing field, an unknown status, a malformed key and an extra field', () => {
    expect(
      violations(schemaNamed('Story'), withoutField(story, 'version')).join(
        '\n'
      )
    ).toContain('version');
    expect(
      violations(
        schemaNamed('Story'),
        withField(story, 'status', 'sailing')
      ).join('\n')
    ).toContain('/status');
    expect(
      violations(schemaNamed('Story'), withField(story, 'key', 'proj-1')).join(
        '\n'
      )
    ).toContain('/key');
    expect(
      violations(schemaNamed('Story'), withField(story, 'extra', 1)).join('\n')
    ).toContain('extra');
  });

  it('refuses a timestamp that is not a real RFC 3339 date-time', () => {
    expect(
      violations(
        schemaNamed('Story'),
        withField(story, 'createdAt', 'yesterday')
      ).join('\n')
    ).toContain('/createdAt');
    expect(
      violations(
        schemaNamed('Story'),
        withField(story, 'createdAt', '2026-02-30T10:00:00.000Z')
      ).join('\n')
    ).toContain('/createdAt');
  });

  it('lists every difference, not only the first', () => {
    const broken = { ...story, spentNanoAiu: -1, status: 'sailing' };
    expect(
      violations(schemaNamed('Story'), broken).length
    ).toBeGreaterThanOrEqual(2);
  });

  describe('isDateTime', () => {
    it.each([
      '2026-10-06T09:48:00Z',
      '2026-10-06T09:48:00.123Z',
      '2026-10-06T09:48:00+02:00',
      '2026-10-06T09:48:00-05:30',
      '2024-02-29T00:00:00Z',
      '2026-12-31T23:59:60Z',
      '2026-10-06t09:48:00z',
    ])('accepts %s', (text) => {
      expect(isDateTime(text)).toBe(true);
    });

    it.each([
      '',
      '2026-10-06',
      '2026-10-06T09:48:00',
      '2026-10-06 09:48:00Z',
      '2026-02-30T10:00:00Z',
      '2023-02-29T10:00:00Z',
      '1900-02-29T10:00:00Z',
      '2026-13-01T10:00:00Z',
      '2026-00-10T10:00:00Z',
      '2026-04-31T10:00:00Z',
      '2026-10-06T24:00:00Z',
      '2026-10-06T09:60:00Z',
      '2026-10-06T09:48:00+24:00',
      '2026-10-06T09:48:00+02:60',
    ])('refuses %j', (text) => {
      expect(isDateTime(text)).toBe(false);
    });
  });
});

describe("the lists of values in types.ts are the contract's enums", () => {
  it.each([
    ['STORY_STATUSES', STORY_STATUSES, enumOf('StoryStatus')],
    ['RUN_STATUSES', RUN_STATUSES, enumOf('RunStatus')],
    ['REASONING_EFFORTS', REASONING_EFFORTS, enumOf('ReasoningEffort')],
    ['MODEL_SLOTS', MODEL_SLOTS, enumOf('ModelSlot')],
    ['MODEL_SOURCES', MODEL_SOURCES, enumOf('SlotModel', 'modelSource')],
    ['EFFORT_SOURCES', EFFORT_SOURCES, enumOf('SlotModel', 'effortSource')],
    ['GATE_RESULTS', GATE_RESULTS, enumOf('GateVerdict', 'result')],
    ['GATE_SOURCES', GATE_SOURCES, enumOf('GateRecord', 'source')],
    ['GATE_OUTCOMES', GATE_OUTCOMES, enumOf('GateRecord', 'outcome')],
    ['HUMAN_DECISIONS', HUMAN_DECISIONS, enumOf('DecisionRequest', 'decision')],
    ['PROBLEM_CODES', PROBLEM_CODES, enumOf('Problem', 'code')],
  ] as const)('%s', (_name, list, fromTheContract) => {
    expect(members(list)).toEqual(members(fromTheContract));
  });
});
