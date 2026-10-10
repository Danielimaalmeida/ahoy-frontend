import type { ProblemError } from '@core/api/api-error';
import {
  STALE_HEADING,
  UNREACHABLE_HEADING,
  apiErrorView,
  commandErrorView,
  techLine,
} from './command-error';

function problem(
  status: number,
  code: string,
  extra: Partial<ProblemError> = {}
): ProblemError {
  return { kind: 'problem', status, code, title: code, ...extra };
}

describe('techLine', () => {
  it('joins the status, the code and the request id when there is one', () => {
    expect(techLine(problem(409, 'stale_version', { instance: 'req-7' }))).toBe(
      '409 · stale_version · req-7'
    );
    expect(techLine(problem(409, 'invalid_state'))).toBe('409 · invalid_state');
  });

  it('names a network failure and a gateway status', () => {
    expect(techLine({ kind: 'network' })).toBe('network');
    expect(techLine({ kind: 'network', status: 504 })).toBe('504 · network');
  });

  it('says which call sent an unreadable answer', () => {
    expect(
      techLine({ kind: 'invalid_response', what: 'stopStory: no version' })
    ).toBe('invalid_response · stopStory: no version');
  });
});

describe('commandErrorView', () => {
  it('shows nothing for ok and skipped', () => {
    expect(commandErrorView({ kind: 'ok', value: 1 })).toBeNull();
    expect(commandErrorView({ kind: 'skipped' })).toBeNull();
  });

  it('shows the stale_version notice that says the text is kept', () => {
    const view = commandErrorView({
      kind: 'stale',
      error: problem(409, 'stale_version'),
    });
    expect(view?.variant).toBe('notice');
    expect(view?.heading).toBe(STALE_HEADING);
    expect(view?.text).toContain('Your text is kept');
    expect(view?.tech).toBe('409 · stale_version');
  });

  it("shows the API's detail for invalid_state, with the code on the technical line", () => {
    const view = commandErrorView({
      kind: 'other',
      error: problem(409, 'invalid_state', {
        detail: 'Story PROJ-126 is already halted',
      }),
    });
    expect(view).toEqual({
      variant: 'error',
      heading: "The voyage isn't in a state that allows this",
      text: 'Story PROJ-126 is already halted',
      tech: '409 · invalid_state',
    });
  });

  it('keeps the decided and answered conflicts apart from the others', () => {
    expect(
      commandErrorView({
        kind: 'decided',
        error: problem(409, 'decision_already_recorded'),
      })?.heading
    ).toBe('Someone already decided');
    expect(
      commandErrorView({
        kind: 'answered',
        error: problem(409, 'already_answered'),
      })?.heading
    ).toBe('Someone already answered');
  });
});

describe('apiErrorView', () => {
  it("shows Can't reach Ahoy for the network and 503 unavailable", () => {
    expect(apiErrorView({ kind: 'network' }).heading).toBe(UNREACHABLE_HEADING);
    expect(apiErrorView(problem(503, 'unavailable')).heading).toBe(
      UNREACHABLE_HEADING
    );
  });

  it('never reads an unreadable answer as a verdict', () => {
    const view = apiErrorView({
      kind: 'invalid_response',
      what: 'getStory: status',
    });
    expect(view.heading).toBe('Ahoy sent something unexpected');
    expect(view.text).not.toMatch(/reject|fail/i);
  });

  it("names the other codes of the plan's table", () => {
    expect(apiErrorView(problem(401, 'unauthenticated')).heading).toBe(
      'Sign-in needed'
    );
    expect(apiErrorView(problem(404, 'not_found')).heading).toBe(
      "This voyage doesn't exist"
    );
    expect(apiErrorView(problem(400, 'validation_failed')).heading).toBe(
      'Check the highlighted fields'
    );
    expect(apiErrorView(problem(409, 'revision_ceiling_reached')).heading).toBe(
      'No more revision rounds'
    );
    expect(apiErrorView(problem(409, 'legacy_story')).heading).toBe(
      "This voyage can't be changed here"
    );
    expect(apiErrorView(problem(500, 'internal_error')).heading).toBe(
      "That didn't go through"
    );
  });

  it('falls back to its own words when the detail is blank', () => {
    expect(
      apiErrorView(problem(409, 'invalid_state', { detail: '  ' })).text
    ).toBe('It may have moved on. It has been refreshed.');
  });
});
