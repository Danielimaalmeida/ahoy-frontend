import { call, testServer } from './spec-helpers';

const AIU = 1_000_000_000;
const brief = { text: 'The VAT number is missing', criteria: ['VAT shows'] };

function setup() {
  const { server } = testServer();
  const get = (path: string) => call(server, 'GET', path);
  const post = (path: string, body: unknown) =>
    call(server, 'POST', path, body);
  const version = (key: string) =>
    (get(`/stories/${key}`).body as { version: number }).version;
  const start = (key: string, extra: Record<string, unknown> = {}) =>
    post(`/stories/${key}/follow-ups`, {
      expectedVersion: version(key),
      source: { ahoyOnly: true },
      brief,
      route: 'planning',
      budgetNanoAiu: 10 * AIU,
      confirmSpend: true,
      ...extra,
    });
  return { get, post, version, start };
}

const codeOf = (answer: { body: unknown }): string =>
  (answer.body as { code: string }).code;

describe('the mock backend: follow-up voyages', () => {
  it('previews a done voyage: it can start, and the suggestion follows the brief', () => {
    const { get } = setup();
    const planning = get('/stories/PROJ-097/follow-up-preview').body as {
      canStart: boolean;
      nextKey: string;
      revisions: unknown;
      suggestion: { route: string };
    };
    expect([planning.canStart, planning.nextKey, planning.revisions]).toEqual([
      true,
      'PROJ-097-FU1',
      { used: 0, ceiling: 4 },
    ]);
    expect(planning.suggestion.route).toBe('planning');
    const small = get(
      '/stories/PROJ-097/follow-up-preview?criteria=1&briefChars=200&repos=api'
    ).body as { suggestion: { route: string } };
    expect(small.suggestion.route).toBe('fast_path');
  });

  it('says why a voyage that is not done cannot be continued', () => {
    const { get, start } = setup();
    const preview = get('/stories/PROJ-140/follow-up-preview').body as {
      canStart: boolean;
      blockedReason: string;
    };
    expect(preview.canStart).toBe(false);
    expect(preview.blockedReason).toMatch(/not done/);
    expect(codeOf(start('PROJ-140'))).toBe('invalid_state');
  });

  it('starts an Ahoy-only follow-up in intake, charges one round to the root and links it', () => {
    const { get, start } = setup();
    const started = start('PROJ-097');
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      key: 'PROJ-097-FU1',
      phase: 'intake',
      followUp: {
        rootKey: 'PROJ-097',
        number: 1,
        source: 'ahoy',
        route: 'planning',
      },
    });
    const lineage = get('/stories/PROJ-097-FU1/lineage').body as {
      rootKey: string;
      items: { key: string }[];
      revisions: unknown;
    };
    expect(lineage.rootKey).toBe('PROJ-097');
    expect(lineage.items.map((i) => i.key)).toEqual([
      'PROJ-097',
      'PROJ-097-FU1',
    ]);
    expect(lineage.revisions).toEqual({ used: 1, ceiling: 4 });
    expect(get('/stories/PROJ-097').body).toMatchObject({
      phase: 'done',
      status: 'terminal',
    });
  });

  it("creates the Jira issue of a follow-up, keyed in the root's project, and needs its title", () => {
    const { get, start } = setup();
    const create = { source: { createInJira: { issueType: 'Bug' } } };
    expect(codeOf(start('PROJ-097', create))).toBe('validation_failed');
    const started = start('PROJ-097', {
      ...create,
      title: 'Export drops a row',
    });
    expect(started.status).toBe(201);
    const body = started.body as { key: string; title: string };
    expect(body.key).toMatch(/^PROJ-\d+$/);
    expect(body).toMatchObject({
      title: 'Export drops a row',
      followUp: { rootKey: 'PROJ-097', source: 'jira' },
    });
    expect(
      (
        get('/stories/PROJ-097/lineage').body as { items: { key: string }[] }
      ).items.map((i) => i.key)
    ).toEqual(['PROJ-097', body.key]);
    const preview = get('/stories/PROJ-097/follow-up-preview').body as {
      canCreateInJira: boolean;
      issueTypes: string[];
    };
    expect([preview.canCreateInJira, preview.issueTypes[0]]).toEqual([
      true,
      'Bug',
    ]);
  });

  it('allows one open follow-up at a time', () => {
    const { start } = setup();
    expect(start('PROJ-097').status).toBe(201);
    expect(codeOf(start('PROJ-097'))).toBe('invalid_state');
  });

  it('takes the fast path for exactly one repository of the earlier plan', () => {
    const { start } = setup();
    expect(codeOf(start('PROJ-097', { route: 'fast_path' }))).toBe(
      'validation_failed'
    );
    expect(
      codeOf(start('PROJ-097', { route: 'fast_path', repos: ['api', 'web'] }))
    ).toBe('validation_failed');
    expect(
      start('PROJ-097', { route: 'fast_path', repos: ['api'] }).status
    ).toBe(201);
  });

  it('needs a criterion for an Ahoy-only follow-up, and a free key for a Jira one', () => {
    const { start } = setup();
    expect(
      codeOf(start('PROJ-097', { brief: { text: 'x', criteria: [] } }))
    ).toBe('validation_failed');
    expect(codeOf(start('PROJ-097', { source: { jiraKey: 'PROJ-140' } }))).toBe(
      'story_exists'
    );
  });

  it('raises the ceiling of the lineage, and lets the follow-up count on the new room', () => {
    const { get, post, version } = setup();
    const raised = post('/stories/PROJ-097/revision-ceiling', {
      expectedVersion: version('PROJ-097'),
      rounds: 2,
      reason: 'QA found more cases',
      confirmSpend: true,
    });
    expect(raised.status).toBe(200);
    expect(raised.body).toMatchObject({ ceiling: 6 });
    expect(
      (get('/stories/PROJ-097/lineage').body as { revisions: unknown })
        .revisions
    ).toEqual({ used: 0, ceiling: 6 });
  });
});
