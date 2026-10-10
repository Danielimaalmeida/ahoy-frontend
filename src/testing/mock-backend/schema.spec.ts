import contract from '@testing/fixtures/openapi.json';
import {
  operations,
  schemaNamed,
  violations,
} from '@testing/fixtures/contract';
import { SchemaChecker, unstorableText } from './schema';

const checker = new SchemaChecker(contract);
const sha = 'a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302';

/** Bodies per operation, valid and not, that the mock's checker and Ajv must judge alike. */
const BODIES: Readonly<Record<string, readonly unknown[]>> = {
  startStory: [
    { key: 'PROJ-1', budgetNanoAiu: 1 },
    {
      key: 'PROJ-1',
      title: 'T',
      budgetNanoAiu: 5_000_000_000,
      controlRef: sha,
      models: { planning: { model: 'gpt-5' } },
    },
    { key: 'proj-1', budgetNanoAiu: 1 },
    { key: 'PROJ-1', budgetNanoAiu: 0 },
    { key: 'PROJ-1', budgetNanoAiu: 1.5 },
    { key: 'PROJ-1', budgetNanoAiu: '1' },
    { key: 'PROJ-1' },
    { budgetNanoAiu: 1 },
    { key: 'PROJ-1', budgetNanoAiu: 1, controlRef: 'main' },
    { key: 'PROJ-1', budgetNanoAiu: 1, surprise: true },
    { key: 'PROJ-1', budgetNanoAiu: 1, title: 'x'.repeat(501) },
    { key: 'PROJ-1', budgetNanoAiu: 1, models: { planning: {} } },
    { key: 'PROJ-1', budgetNanoAiu: 1, models: { planning: null } },
    { key: 'PROJ-1', budgetNanoAiu: 1, models: { review: { model: 'x' } } },
    {
      key: 'PROJ-1',
      budgetNanoAiu: 1,
      models: { intake: { reasoningEffort: 'extreme' } },
    },
    { key: 'PROJ-1', budgetNanoAiu: 1, models: { intake: { model: '-bad' } } },
    { key: `P-${'1'.repeat(40)}`, budgetNanoAiu: 1 },
    [],
    null,
    'PROJ-1',
  ],
  stopStory: [
    { expectedVersion: 3, reason: 'Waiting' },
    { expectedVersion: 0, reason: 'Waiting' },
    { expectedVersion: 3, reason: '' },
    { expectedVersion: 3 },
    { reason: 'x' },
    { expectedVersion: 3, reason: 'x'.repeat(2001) },
  ],
  resumeStory: [
    { expectedVersion: 3 },
    { expectedVersion: 3, reason: '' },
    { expectedVersion: -1 },
    {},
  ],
  setStoryBudget: [
    { expectedVersion: 1, budgetNanoAiu: 2, reason: 'More' },
    { expectedVersion: 1, budgetNanoAiu: 0, reason: 'More' },
    { expectedVersion: 1, budgetNanoAiu: 2 },
    { expectedVersion: 1, budgetNanoAiu: 2.25, reason: 'More' },
  ],
  setStoryModels: [
    {
      expectedVersion: 1,
      models: {
        planning: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
      },
    },
    {
      expectedVersion: 1,
      models: { planning: null, review: { reasoningEffort: 'low' } },
    },
    { expectedVersion: 1, models: {} },
    { expectedVersion: 1, models: { planning: {} } },
    { expectedVersion: 1, models: { planning: { model: '' } } },
    { expectedVersion: 1, models: { planning: { model: 'x', extra: 1 } } },
    { expectedVersion: 1 },
    { expectedVersion: 1, models: { planning: null }, reason: '' },
  ],
  answerQuestion: [
    { answer: 'Yes', expectedVersion: 2 },
    { answer: '', expectedVersion: 2 },
    { answer: 'Yes' },
    { answer: 5, expectedVersion: 2 },
    { answer: 'é'.repeat(20_001), expectedVersion: 2 },
  ],
  decideHumanGate: [
    { gate: 'plan_accepted', decision: 'approve', expectedVersion: 9 },
    {
      gate: 'plan_accepted',
      decision: 'send_back',
      reason: 'Fix it',
      expectedVersion: 9,
    },
    { gate: 'Plan', decision: 'approve', expectedVersion: 9 },
    { gate: 'plan_accepted', decision: 'maybe', expectedVersion: 9 },
    { gate: 'plan_accepted', expectedVersion: 9 },
    {
      gate: 'plan_accepted',
      decision: 'reject',
      reason: 'x'.repeat(5001),
      expectedVersion: 9,
    },
  ],
};

describe('SchemaChecker', () => {
  for (const [operationId, bodies] of Object.entries(BODIES)) {
    it(`judges ${operationId} bodies as Ajv does against the contract`, () => {
      const op = operations().find((o) => o.operationId === operationId);
      expect(op?.requestSchema).toBeTruthy();
      for (const body of bodies) {
        const ajv = violations(op!.requestSchema!, body);
        const mine = checker.check(op!.requestSchema, body, 'body');
        expect({ body, conforms: mine.length === 0 }).toEqual({
          body,
          conforms: ajv.length === 0,
        });
      }
    });
  }

  it('judges parameter schemas as Ajv does', () => {
    const cases: readonly [string, unknown][] = [
      ['StoryKey', 'PROJ-123'],
      ['StoryKey', 'proj-123'],
      ['StoryKey', `PROJ-${'9'.repeat(40)}`],
      ['RunId', 'proj-140-planning-001-5c54'],
      ['RunId', 'a b'],
      ['EventId', '209'],
      ['EventId', '2a'],
      ['ArtifactPath', 'implementation-plan.md'],
      ['ArtifactPath', '../etc/passwd'],
      ['ArtifactPath', '/abs.md'],
    ];
    for (const [name, value] of cases) {
      const ajv = violations(schemaNamed(name), value);
      expect({
        name,
        value,
        conforms: checker.passes(schemaNamed(name), value),
      }).toEqual({
        name,
        value,
        conforms: ajv.length === 0,
      });
    }
  });

  it("words its errors as Ajv does, with the real API's paths", () => {
    const op = operations().find((o) => o.operationId === 'setStoryBudget')!;
    expect(
      checker.check(
        op.requestSchema,
        { expectedVersion: 1, budgetNanoAiu: 0 },
        'body'
      )
    ).toEqual([
      { path: 'body', message: "must have required property 'reason'" },
      { path: 'body/budgetNanoAiu', message: 'must be >= 1' },
    ]);
    expect(
      checker.check(
        op.requestSchema,
        { expectedVersion: 1, budgetNanoAiu: 1, reason: 'r', x: 1 },
        'body'
      )
    ).toEqual([
      { path: 'body', message: 'must NOT have additional properties' },
    ]);
    expect(checker.check(schemaNamed('StoryKey'), 'x', 'path.key')).toEqual([
      {
        path: 'path.key',
        message: 'must match pattern "^[A-Z][A-Z0-9]+-[0-9]+$"',
      },
    ]);
  });

  it('finds text Postgres cannot store, anywhere in a body', () => {
    expect(unstorableText({ reason: 'ok', nested: ['fine'] })).toBeNull();
    expect(unstorableText({ reason: 'a\u0000b' })).toBe(
      'contains a NUL character'
    );
    expect(unstorableText({ list: ['\uD800'] })).toBe(
      'contains an unpaired surrogate'
    );
    expect(unstorableText('😀')).toBeNull();
  });
});
