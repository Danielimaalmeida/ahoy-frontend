import type { ProblemError } from '@core/api/api-error';
import { describe, expect, it } from 'vitest';
import {
  NO_FEEDBACK,
  startFeedback,
  withoutField,
  type StartFeedback,
} from './start-errors';

function problem(
  status: number,
  code: string,
  extra: Partial<ProblemError> = {}
): ProblemError {
  return { kind: 'problem', status, code, title: `Title of ${code}`, ...extra };
}

describe('a refused startStory', () => {
  it('409 story_exists is an error on the key field with the key to open, and no banner', () => {
    const feedback = startFeedback(
      problem(409, 'story_exists', { detail: 'Story PROJ-145 already exists' }),
      'PROJ-145'
    );
    expect(feedback.key).toBe('PROJ-145 already has a voyage.');
    expect(feedback.existingKey).toBe('PROJ-145');
    expect(feedback.banner).toBeUndefined();
    expect(feedback.models).toEqual({});
  });

  it('400 validation_failed puts each error beside its field, in both spellings of the path', () => {
    const feedback = startFeedback(
      problem(400, 'validation_failed', {
        errors: [
          { path: 'body/budgetNanoAiu', message: 'must be >= 1' },
          { path: '/key', message: 'must match pattern' },
          { path: '/title', message: 'must NOT have more than 500 characters' },
          {
            path: '/models/review/model',
            message: 'must match pattern',
          },
          { path: 'body/models/planning', message: 'unknown slot value' },
        ],
      }),
      'PROJ-145'
    );
    expect(feedback.budget).toBe('must be >= 1');
    expect(feedback.key).toBe('must match pattern');
    expect(feedback.title).toBe('must NOT have more than 500 characters');
    expect(feedback.models).toEqual({
      review: 'must match pattern',
      planning: 'unknown slot value',
    });
    expect(feedback.banner).toBeUndefined();
  });

  it('400 with an error that names no field falls back to a banner with the detail', () => {
    const feedback = startFeedback(
      problem(400, 'validation_failed', {
        detail: 'The request body is not valid',
        errors: [
          { message: 'body must be object' },
          { path: 'query/limit', message: 'bad limit' },
        ],
      }),
      'PROJ-145'
    );
    expect(feedback.banner).toEqual({
      heading: 'Title of validation_failed',
      text: 'The request body is not valid: body must be object; bad limit',
      tech: '400 · validation_failed',
      retry: false,
    });
  });
});

describe('the feedback state', () => {
  it('starts with nothing to show', () => {
    expect(NO_FEEDBACK).toEqual({ models: {} });
  });
});

describe('an error that no field can show', () => {
  it("422 and other problems give a banner with the API's own detail and the technical line", () => {
    const feedback = startFeedback(
      problem(422, 'unsupported_gate', {
        detail: 'That cannot be done now.',
        instance: 'req-7f3a',
      }),
      'PROJ-145'
    );
    expect(feedback).toEqual({
      models: {},
      banner: {
        heading: 'Title of unsupported_gate',
        text: 'That cannot be done now.',
        tech: '422 · unsupported_gate · req-7f3a',
        retry: false,
      },
    });
  });

  it('503 and a failed network are "Can\'t reach Ahoy", and say nothing typed was lost', () => {
    for (const error of [
      problem(503, 'unavailable'),
      { kind: 'network', status: 504 } as const,
      { kind: 'network' } as const,
    ]) {
      const banner = startFeedback(error, 'PROJ-145').banner;
      expect(banner?.heading).toBe("Can't reach Ahoy");
      expect(banner?.text).toContain('Nothing you typed was lost');
    }
    expect(
      startFeedback({ kind: 'network', status: 504 }, 'PROJ-145').banner?.tech
    ).toBe('network · 504');
    expect(
      startFeedback(
        problem(503, 'unavailable', { instance: 'req-1' }),
        'PROJ-145'
      ).banner?.tech
    ).toBe('503 · unavailable · req-1');
  });

  it('offers Try again only when the harbour could not be reached', () => {
    expect(
      startFeedback(problem(503, 'unavailable'), 'PROJ-145').banner?.retry
    ).toBe(true);
    expect(startFeedback({ kind: 'network' }, 'PROJ-145').banner?.retry).toBe(
      true
    );
    expect(
      startFeedback(problem(422, 'unsupported_gate'), 'PROJ-145').banner?.retry
    ).toBe(false);
    expect(
      startFeedback(problem(401, 'unauthenticated'), 'PROJ-145').banner?.retry
    ).toBe(false);
  });

  it("an answer the app cannot read is Ahoy's tooling failure, never a verdict on the voyage", () => {
    const banner = startFeedback(
      { kind: 'invalid_response', what: 'startStory: key is missing' },
      'PROJ-145'
    ).banner;
    expect(banner).toEqual({
      heading: 'Ahoy sent something unexpected',
      text: 'The voyage may or may not have been created. Check All voyages before trying again.',
      tech: 'invalid_response · startStory: key is missing',
      retry: false,
    });
  });

  it('401 asks for a sign-in, which the app does not do itself', () => {
    expect(
      startFeedback(problem(401, 'unauthenticated'), 'PROJ-145').banner?.heading
    ).toBe('Sign-in needed');
  });
});

describe('an error beside a field', () => {
  const all: StartFeedback = {
    key: 'PROJ-145 already has a voyage.',
    existingKey: 'PROJ-145',
    title: 'too long',
    budget: 'too small',
    models: { planning: 'bad', review: 'invalid model' },
    banner: { heading: 'h', text: 't', tech: 'x', retry: false },
  };

  it('goes away when the user edits that field, and only that one', () => {
    const budgetEdited = withoutField(all, 'budget');
    expect(budgetEdited.budget).toBeUndefined();
    expect(budgetEdited.title).toBe('too long');
    expect(budgetEdited.models).toEqual(all.models);
    expect(withoutField(all, 'planning').models).toEqual({
      review: 'invalid model',
    });
    expect(withoutField(all, 'title').title).toBeUndefined();
  });

  it('clears the review row error when that slot is edited', () => {
    expect(withoutField(all, 'review').models).toEqual({
      planning: 'bad',
    });
  });

  it('takes the link to the existing voyage with it when the key is edited', () => {
    const next = withoutField(all, 'key');
    expect(next.key).toBeUndefined();
    expect(next.existingKey).toBeUndefined();
  });
});
